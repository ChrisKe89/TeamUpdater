use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareFileAuthConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthTokenSet {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_type: String,
    pub subdomain: String,
    pub apicp: String,
    pub appcp: Option<String>,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_type: String,
    pub apicp: String,
    pub appcp: Option<String>,
    pub subdomain: String,
    pub expires_in: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareFileAuthStatus {
    pub is_authenticated: bool,
    pub tenant_subdomain: Option<String>,
    pub expires_at: Option<String>,
    pub has_refresh_token: bool,
    pub auth_url: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareFileAuthSession {
    pub auth_url: String,
    pub state: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareFileBrowseNode {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub display_path: String,
    pub is_folder: bool,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ShareFileItem {
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "FileName")]
    pub file_name: Option<String>,
    #[serde(rename = "FileSizeBytes")]
    pub file_size_bytes: Option<u64>,
    #[serde(rename = "ModificationDate")]
    pub modification_date: Option<String>,
    #[serde(rename = "Path")]
    pub path: Option<String>,
    #[serde(rename = "Parent")]
    pub parent: Option<ShareFileItemReference>,
    #[serde(rename = "odata.metadata")]
    pub odata_metadata: Option<String>,
}

impl ShareFileItem {
    pub fn is_folder(&self) -> bool {
        self.odata_metadata
            .as_deref()
            .map(|value| value.contains("Folder"))
            .unwrap_or(false)
    }

    pub fn display_name(&self) -> String {
        self.file_name
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| self.name.clone())
    }

    pub fn to_browse_node(&self) -> ShareFileBrowseNode {
        ShareFileBrowseNode {
            id: self.id.clone(),
            parent_id: self.parent.as_ref().map(|parent| parent.id.clone()),
            name: self.display_name(),
            display_path: self
                .path
                .clone()
                .unwrap_or_else(|| format!("/{}", self.display_name())),
            is_folder: self.is_folder(),
            size_bytes: self.file_size_bytes,
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ShareFileItemReference {
    #[serde(rename = "Id")]
    pub id: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ShareFileChildItemsResponse {
    #[serde(default)]
    pub value: Vec<ShareFileItem>,
    #[serde(rename = "odata.nextLink", alias = "odata.nextlink")]
    pub next_link: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ShareFileDownloadLinkResponse {
    #[serde(rename = "Uri", alias = "uri")]
    pub uri: String,
}
