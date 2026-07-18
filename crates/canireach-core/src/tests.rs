use crate::config::ProbeConfig;
use crate::error::ProbeError;
use crate::models::{LogLevel, Target};
use crate::probe::RedirectTracker;
use reqwest::Url;

#[test]
fn test_probe_config_defaults() {
    let config = ProbeConfig::default();
    assert_eq!(config.redirect_limit, 10);
    assert_eq!(config.concurrency_limit, 5);
}

#[test]
fn test_redirect_tracker_limit() {
    let mut tracker = RedirectTracker::new(2);
    let current_url = Url::parse("https://example.com").unwrap();

    // First redirect
    let next = tracker.track(&current_url, "/next");
    assert!(next.is_ok());
    let next_url = next.unwrap();
    assert_eq!(next_url.as_str(), "https://example.com/next");

    // Second redirect
    let next2 = tracker.track(&next_url, "/final");
    assert!(next2.is_ok());
    let next_url2 = next2.unwrap();
    assert_eq!(next_url2.as_str(), "https://example.com/final");

    // Third redirect (should fail because limit is 2)
    let next3 = tracker.track(&next_url2, "/overflow");
    assert!(next3.is_err());
    if let Err(ProbeError::RedirectError(msg)) = next3 {
        assert!(msg.contains("Redirect limit of 2 exceeded"));
    } else {
        panic!("Expected RedirectError");
    }
}

#[test]
fn test_target_deserialization() {
    let target_json = r#"
    {
        "id": "test-id",
        "name": "Test Target",
        "url": "example.com",
        "category": "Test Cat"
    }
    "#;
    let target: Result<Target, _> = serde_json::from_str(target_json);
    assert!(target.is_ok());
    let target = target.unwrap();
    assert_eq!(target.id, "test-id");
    assert_eq!(target.name, "Test Target");
    assert_eq!(target.url, "example.com");
    assert_eq!(target.category, Some("Test Cat".to_string()));
}

#[test]
fn test_log_level_serialization() {
    let level = LogLevel::Info;
    let serialized = serde_json::to_string(&level).unwrap();
    assert_eq!(serialized, "\"INFO\"");

    let deserialized: LogLevel = serde_json::from_str("\"ERROR\"").unwrap();
    assert_eq!(deserialized, LogLevel::Error);
}

#[test]
fn test_prober_creation_with_proxy() {
    let config = ProbeConfig {
        proxy_mode: "custom".to_string(),
        proxy_url: Some("socks5://127.0.0.1:10888".to_string()),
        ..Default::default()
    };
    let prober = crate::probe::HttpProber::new(config);
    assert!(prober.is_ok());
}
