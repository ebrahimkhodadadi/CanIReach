use thiserror::Error;

#[derive(Error, Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum ProbeError {
    #[error("Invalid target URL: {0}")]
    InvalidUrl(String),

    #[error("Client construction/configuration failure: {0}")]
    ClientError(String),

    #[error("Timeout occurred while probing: {0}")]
    Timeout(String),

    #[error("DNS resolution failure: {0}")]
    DnsError(String),

    #[error("Connection failure: {0}")]
    ConnectionError(String),

    #[error("TLS handshake failure: {0}")]
    TlsError(String),

    #[error("Redirect policy failure: {0}")]
    RedirectError(String),

    #[error("HTTP response failure status: {0}")]
    HttpStatus(u16),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

impl From<reqwest::Error> for ProbeError {
    fn from(err: reqwest::Error) -> Self {
        let err_str = err.to_string().to_lowercase();
        if err.is_timeout() {
            Self::Timeout(err.to_string())
        } else if err.is_builder() {
            Self::ClientError(err.to_string())
        } else if err.is_redirect() {
            Self::RedirectError(err.to_string())
        } else if err_str.contains("dns")
            || err_str.contains("resolve")
            || err_str.contains("could not resolve host")
        {
            Self::DnsError(err.to_string())
        } else if err_str.contains("tls")
            || err_str.contains("ssl")
            || err_str.contains("handshake")
        {
            Self::TlsError(err.to_string())
        } else if err.is_connect()
            || err_str.contains("connection refused")
            || err_str.contains("connect error")
        {
            Self::ConnectionError(err.to_string())
        } else if let Some(status) = err.status() {
            Self::HttpStatus(status.as_u16())
        } else {
            Self::Unknown(err.to_string())
        }
    }
}
