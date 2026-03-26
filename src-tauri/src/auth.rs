use crate::sharefile_api::{ShareFileApiError, ShareFileClient};
use crate::sharefile_models::{
    OAuthTokenSet, ShareFileAuthConfig, ShareFileAuthSession, ShareFileAuthStatus,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, Mac};
use rand::{distributions::Alphanumeric, Rng};
use sha2::Sha256;
use std::path::PathBuf;
use thiserror::Error;
use url::Url;

const APP_DIR_NAME: &str = "TeamUpdaterV3";
const AUTH_FILE_NAME: &str = "sharefile-auth.json";

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct StoredShareFileAuth {
    auth_config: Option<ShareFileAuthConfig>,
    tokens: Option<OAuthTokenSet>,
    pending_state: Option<String>,
    auth_url: Option<String>,
}

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("unable to resolve local app data directory")]
    MissingDataDir,
    #[error("ShareFile auth configuration is incomplete")]
    MissingAuthConfig,
    #[error("ShareFile authentication has not been completed")]
    MissingTokens,
    #[error("ShareFile authorization callback is missing the {0} parameter")]
    MissingCallbackField(&'static str),
    #[error("ShareFile authorization state did not match the active session")]
    InvalidState,
    #[error("ShareFile authorization callback signature was invalid")]
    InvalidCallbackSignature,
    #[error("ShareFile auth store error: {0}")]
    Io(#[from] std::io::Error),
    #[error("ShareFile auth store parse error: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("{0}")]
    Api(#[from] ShareFileApiError),
    #[error("ShareFile callback URL is invalid: {0}")]
    Url(#[from] url::ParseError),
}

pub fn get_sharefile_auth_status() -> Result<ShareFileAuthStatus, AuthError> {
    let stored = load_store()?;
    let is_authenticated = stored
        .tokens
        .as_ref()
        .map(|tokens| !tokens.access_token.trim().is_empty())
        .unwrap_or(false);
    let tenant_subdomain = stored.tokens.as_ref().map(|tokens| tokens.subdomain.clone());
    let expires_at = stored.tokens.as_ref().and_then(|tokens| tokens.expires_at.clone());
    let has_refresh_token = stored
        .tokens
        .as_ref()
        .and_then(|tokens| tokens.refresh_token.as_ref())
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let message = if is_authenticated {
        "ShareFile account connected.".to_string()
    } else if stored.auth_url.is_some() {
        "ShareFile authorization is waiting for completion.".to_string()
    } else {
        "ShareFile account is not connected.".to_string()
    };

    Ok(ShareFileAuthStatus {
        is_authenticated,
        tenant_subdomain,
        expires_at,
        has_refresh_token,
        auth_url: stored.auth_url,
        message,
    })
}

pub fn begin_sharefile_auth(
    auth_config: ShareFileAuthConfig,
) -> Result<ShareFileAuthSession, AuthError> {
    if auth_config.client_id.trim().is_empty()
        || auth_config.client_secret.trim().is_empty()
        || auth_config.redirect_uri.trim().is_empty()
    {
        return Err(AuthError::MissingAuthConfig);
    }

    let state: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();
    let auth_url = ShareFileClient::build_authorize_url(&auth_config, &state)?;

    let mut stored = load_store()?;
    stored.auth_config = Some(auth_config);
    stored.pending_state = Some(state.clone());
    stored.auth_url = Some(auth_url.clone());
    save_store(&stored)?;

    Ok(ShareFileAuthSession { auth_url, state })
}

pub fn complete_sharefile_auth(callback_url: &str) -> Result<ShareFileAuthStatus, AuthError> {
    let mut stored = load_store()?;
    let auth_config = stored.auth_config.clone().ok_or(AuthError::MissingAuthConfig)?;
    let expected_state = stored.pending_state.clone().ok_or(AuthError::InvalidState)?;
    let callback = Url::parse(callback_url)?;
    let query_pairs = callback.query_pairs().into_owned().collect::<Vec<_>>();

    let get_query_value = |key: &str| {
        query_pairs
            .iter()
            .find(|(name, _)| name == key)
            .map(|(_, value)| value.clone())
    };

    let state = get_query_value("state").ok_or(AuthError::MissingCallbackField("state"))?;
    if state != expected_state {
        return Err(AuthError::InvalidState);
    }

    if let Some(signature) = get_query_value("h") {
        validate_callback_signature(&callback, &signature, &auth_config.client_secret)?;
    }

    let code = get_query_value("code").ok_or(AuthError::MissingCallbackField("code"))?;
    let subdomain =
        get_query_value("subdomain").ok_or(AuthError::MissingCallbackField("subdomain"))?;
    let apicp = get_query_value("apicp").ok_or(AuthError::MissingCallbackField("apicp"))?;

    let runtime = tokio::runtime::Runtime::new()?;
    let tokens = runtime.block_on(ShareFileClient::exchange_code(
        &auth_config,
        &subdomain,
        &apicp,
        &code,
    ))?;

    stored.tokens = Some(tokens);
    stored.pending_state = None;
    stored.auth_url = None;
    save_store(&stored)?;

    get_sharefile_auth_status()
}

pub fn disconnect_sharefile_account() -> Result<(), AuthError> {
    let mut stored = load_store()?;
    stored.tokens = None;
    stored.pending_state = None;
    stored.auth_url = None;
    save_store(&stored)?;
    Ok(())
}

pub fn load_authenticated_client() -> Result<ShareFileClient, AuthError> {
    let mut stored = load_store()?;
    let auth_config = stored.auth_config.clone().ok_or(AuthError::MissingAuthConfig)?;
    let mut tokens = stored.tokens.clone().ok_or(AuthError::MissingTokens)?;

    if token_needs_refresh(tokens.expires_at.as_deref()) {
        tokens = refresh_tokens(&auth_config, &tokens)?;
        stored.tokens = Some(tokens.clone());
        save_store(&stored)?;
    }

    ShareFileClient::new(auth_config, tokens).map_err(AuthError::from)
}

fn refresh_tokens(
    auth_config: &ShareFileAuthConfig,
    tokens: &OAuthTokenSet,
) -> Result<OAuthTokenSet, AuthError> {
    let runtime = tokio::runtime::Runtime::new()?;
    runtime
        .block_on(ShareFileClient::refresh_token(auth_config, tokens))
        .map_err(AuthError::from)
}

fn validate_callback_signature(
    callback_url: &Url,
    provided_signature: &str,
    client_secret: &str,
) -> Result<(), AuthError> {
    let mut normalized = callback_url.clone();
    normalized.query_pairs_mut().clear();

    let filtered_pairs = callback_url
        .query_pairs()
        .filter(|(key, _)| key != "h")
        .collect::<Vec<_>>();

    if filtered_pairs.is_empty() {
        return Ok(());
    }

    let query = filtered_pairs
        .iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("&");
    let path_and_query = format!("{}?{}", callback_url.path(), query);

    let mut mac =
        HmacSha256::new_from_slice(client_secret.as_bytes()).map_err(|_| AuthError::MissingAuthConfig)?;
    mac.update(path_and_query.as_bytes());
    let computed = STANDARD.encode(mac.finalize().into_bytes());
    let encoded = url_encode(&computed);

    if encoded != provided_signature {
        return Err(AuthError::InvalidCallbackSignature);
    }

    Ok(())
}

fn token_needs_refresh(expires_at: Option<&str>) -> bool {
    let Some(value) = expires_at else {
        return false;
    };

    let Ok(parsed) = DateTime::parse_from_rfc3339(value) else {
        return false;
    };

    parsed.with_timezone(&Utc) <= Utc::now() + Duration::seconds(30)
}

fn auth_store_path() -> Result<PathBuf, AuthError> {
    let base_dir = dirs::data_local_dir().ok_or(AuthError::MissingDataDir)?;
    Ok(base_dir.join(APP_DIR_NAME).join(AUTH_FILE_NAME))
}

fn load_store() -> Result<StoredShareFileAuth, AuthError> {
    let path = auth_store_path()?;

    if !path.exists() {
        return Ok(StoredShareFileAuth::default());
    }

    let content = std::fs::read_to_string(path)?;
    serde_json::from_str::<StoredShareFileAuth>(&content).map_err(AuthError::from)
}

fn save_store(store: &StoredShareFileAuth) -> Result<(), AuthError> {
    let path = auth_store_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let serialized = serde_json::to_string_pretty(store)?;
    std::fs::write(path, serialized)?;
    Ok(())
}

fn url_encode(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}
