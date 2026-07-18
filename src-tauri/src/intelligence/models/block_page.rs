use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeaderMatch {
    pub header: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockPageMatchCondition {
    pub status_codes: Option<Vec<u32>>,
    pub header_contains: Option<Vec<HeaderMatch>>,
    pub title_contains: Option<Vec<String>>,
    pub body_text_contains: Option<Vec<String>>,
    pub redirect_host_patterns: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockPageSignature {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub match_json: BlockPageMatchCondition,
}
