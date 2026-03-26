use crate::sharefile_models::{
    OAuthTokenResponse, OAuthTokenSet, ShareFileAuthConfig, ShareFileChildItemsResponse,
    ShareFileDownloadLinkResponse, ShareFileItem,
};
use chrono::{Duration, Utc};
use futures_util::StreamExt;
use reqwest::{Client, Response, StatusCode};
use std::path::Path;
use thiserror::Error;
use tokio::{fs::File, io::AsyncWriteExt};

#[derive(Debug, Error)]
pub enum ShareFileApiError {
    #[error("invalid ShareFile auth configuration")]
    InvalidAuthConfig,
    #[error("ShareFile token set is incomplete")]
    MissingTokens,
    #[error("ShareFile request failed with status {status}: {message}")]
    HttpStatus { status: StatusCode, message: String },
    #[error("ShareFile request error: {0}")]
    Request(#[from] reqwest::Error),
    #[error("ShareFile response parse error: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("ShareFile API did not return a download link")]
    MissingDownloadUrl,
    #[error("ShareFile path or item could not be resolved")]
    MissingItem,
    #[error("file write failed: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Clone)]
pub struct ShareFileClient {
    client: Client,
    tokens: OAuthTokenSet,
}

impl ShareFileClient {
    pub fn new(
        auth_config: ShareFileAuthConfig,
        tokens: OAuthTokenSet,
    ) -> Result<Self, ShareFileApiError> {
        if auth_config.client_id.trim().is_empty()
            || auth_config.client_secret.trim().is_empty()
            || tokens.access_token.trim().is_empty()
            || tokens.subdomain.trim().is_empty()
            || tokens.apicp.trim().is_empty()
        {
            return Err(ShareFileApiError::InvalidAuthConfig);
        }

        Ok(Self {
            client: Client::builder().build()?,
            tokens,
        })
    }

    pub fn build_authorize_url(
        auth_config: &ShareFileAuthConfig,
        state: &str,
    ) -> Result<String, ShareFileApiError> {
        if auth_config.client_id.trim().is_empty()
            || auth_config.client_secret.trim().is_empty()
            || auth_config.redirect_uri.trim().is_empty()
        {
            return Err(ShareFileApiError::InvalidAuthConfig);
        }

        let mut url = reqwest::Url::parse("https://secure.sharefile.com/oauth/authorize")
            .map_err(|_| ShareFileApiError::InvalidAuthConfig)?;
        url.query_pairs_mut()
            .append_pair("response_type", "code")
            .append_pair("client_id", auth_config.client_id.trim())
            .append_pair("redirect_uri", auth_config.redirect_uri.trim())
            .append_pair("state", state);
        Ok(url.to_string())
    }

    pub async fn exchange_code(
        auth_config: &ShareFileAuthConfig,
        subdomain: &str,
        apicp: &str,
        code: &str,
    ) -> Result<OAuthTokenSet, ShareFileApiError> {
        if code.trim().is_empty() || subdomain.trim().is_empty() || apicp.trim().is_empty() {
            return Err(ShareFileApiError::InvalidAuthConfig);
        }

        let client = Client::builder().build()?;
        let response = client
            .post(Self::token_url(subdomain, apicp)?)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&[
                ("grant_type", "authorization_code"),
                ("code", code),
                ("client_id", auth_config.client_id.as_str()),
                ("client_secret", auth_config.client_secret.as_str()),
            ])
            .send()
            .await?;

        let payload = Self::parse_json_response::<OAuthTokenResponse>(response).await?;
        Ok(Self::token_response_to_set(payload))
    }

    pub async fn refresh_token(
        auth_config: &ShareFileAuthConfig,
        tokens: &OAuthTokenSet,
    ) -> Result<OAuthTokenSet, ShareFileApiError> {
        let refresh_token = tokens
            .refresh_token
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .ok_or(ShareFileApiError::MissingTokens)?;

        let client = Client::builder().build()?;
        let response = client
            .post(Self::token_url(&tokens.subdomain, &tokens.apicp)?)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh_token),
                ("client_id", auth_config.client_id.as_str()),
                ("client_secret", auth_config.client_secret.as_str()),
            ])
            .send()
            .await?;

        let payload = Self::parse_json_response::<OAuthTokenResponse>(response).await?;
        Ok(Self::token_response_to_set(payload))
    }

    pub async fn list_children(&self, item_id: &str) -> Result<Vec<ShareFileItem>, ShareFileApiError> {
        let mut items = Vec::new();
        let mut next_url = Some(self.api_url(&format!("Items({item_id})/Children"))?);

        while let Some(url) = next_url.take() {
            let response = self
                .client
                .get(url)
                .bearer_auth(&self.tokens.access_token)
                .send()
                .await?;
            let payload = Self::parse_json_response::<ShareFileChildItemsResponse>(response).await?;
            items.extend(payload.value);
            next_url = payload.next_link;
        }

        Ok(items)
    }

    pub async fn browse_path(
        &self,
        root_item_id: &str,
        relative_path: &str,
    ) -> Result<ShareFileItem, ShareFileApiError> {
        let url = self.api_url(&format!("Items({root_item_id})/ByPath"))?;
        let response = self
            .client
            .get(url)
            .bearer_auth(&self.tokens.access_token)
            .query(&[("path", relative_path)])
            .send()
            .await?;

        if response.status() == StatusCode::NOT_FOUND {
            return Err(ShareFileApiError::MissingItem);
        }

        Self::parse_json_response::<ShareFileItem>(response).await
    }

    pub async fn get_download_url(&self, item_id: &str) -> Result<String, ShareFileApiError> {
        let url = self.api_url(&format!("Items({item_id})/Download"))?;
        let response = self
            .client
            .get(url)
            .bearer_auth(&self.tokens.access_token)
            .query(&[("redirect", "false")])
            .send()
            .await?;
        let payload = Self::parse_json_response::<ShareFileDownloadLinkResponse>(response).await?;

        if payload.uri.trim().is_empty() {
            return Err(ShareFileApiError::MissingDownloadUrl);
        }

        Ok(payload.uri)
    }

    pub async fn download_file(
        &self,
        item_id: &str,
        destination_path: &Path,
        mut on_progress: impl FnMut(u64, Option<u64>) -> Result<(), std::io::Error>,
    ) -> Result<u64, ShareFileApiError> {
        let download_url = self.get_download_url(item_id).await?;
        let response = self.client.get(download_url).send().await?;

        if !response.status().is_success() {
            return Err(ShareFileApiError::HttpStatus {
                status: response.status(),
                message: response.text().await.unwrap_or_default(),
            });
        }

        let total_bytes = response.content_length();
        let mut file = File::create(destination_path).await?;
        let mut stream = response.bytes_stream();
        let mut written = 0_u64;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            file.write_all(&chunk).await?;
            written += chunk.len() as u64;
            on_progress(written, total_bytes)?;
        }

        file.flush().await?;
        Ok(written)
    }

    fn api_url(&self, path: &str) -> Result<String, ShareFileApiError> {
        let base_url = format!(
            "https://{}.{}{}",
            self.tokens.subdomain.trim(),
            self.tokens.apicp.trim(),
            "/sf/v3/"
        );
        let url = reqwest::Url::parse(&base_url)
            .map_err(|_| ShareFileApiError::InvalidAuthConfig)?
            .join(path)
            .map_err(|_| ShareFileApiError::InvalidAuthConfig)?;
        Ok(url.to_string())
    }

    fn token_url(subdomain: &str, apicp: &str) -> Result<String, ShareFileApiError> {
        let value = format!("https://{}.{}{}", subdomain.trim(), apicp.trim(), "/oauth/token");
        let url = reqwest::Url::parse(&value).map_err(|_| ShareFileApiError::InvalidAuthConfig)?;
        Ok(url.to_string())
    }

    async fn parse_json_response<T>(response: Response) -> Result<T, ShareFileApiError>
    where
        T: serde::de::DeserializeOwned,
    {
        let status = response.status();
        let body = response.text().await?;

        if !status.is_success() {
            return Err(ShareFileApiError::HttpStatus {
                status,
                message: body,
            });
        }

        serde_json::from_str::<T>(&body).map_err(ShareFileApiError::from)
    }

    fn token_response_to_set(payload: OAuthTokenResponse) -> OAuthTokenSet {
        let expires_at = payload
            .expires_in
            .map(|seconds| (Utc::now() + Duration::seconds(seconds as i64)).to_rfc3339());

        OAuthTokenSet {
            access_token: payload.access_token,
            refresh_token: payload.refresh_token,
            token_type: payload.token_type,
            subdomain: payload.subdomain,
            apicp: payload.apicp,
            appcp: payload.appcp,
            expires_at,
        }
    }
}
