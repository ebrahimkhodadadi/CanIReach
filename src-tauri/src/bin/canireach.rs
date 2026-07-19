use clap::{Parser, Subcommand};
use indicatif::{MultiProgress, ProgressBar, ProgressStyle};
use std::fs;
use std::fs::File;
use std::io::{Read, Write};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::Duration;
use zip::write::FileOptions;
use zip::ZipWriter;

use canireach_core::config::ProbeConfig;
use canireach_core::{FailureKind, FailureStage, ProbeEvent, ProbeResult, ProbeStatus, Target};
use tauri_app_lib::config::{
    get_app_data_dir, get_db_path, get_groups_path, get_profiles_path, get_schedules_path,
    get_settings_path, get_targets_path, GroupsLoader, ProfilesLoader, SchedulesLoader,
    TargetLoader,
};
use tauri_app_lib::monitoring::persistence::DbManager;
use tauri_app_lib::monitoring::scheduler::{SchedulerLock, SchedulerService};
use tauri_app_lib::traceroute::run_traceroute;

#[derive(Parser, Debug)]
#[command(
    name = "canireach",
    author,
    version,
    about = "CanIReach CLI Network Diagnostics",
    long_about = None
)]
struct Cli {
    /// Format output (human, json, ndjson)
    #[arg(long, default_value = "human", global = true)]
    format: String,

    /// Color setting (auto, always, never)
    #[arg(long, default_value = "auto", global = true)]
    color: String,

    /// Global connection timeout in milliseconds or human duration (e.g., 5s, 500ms)
    #[arg(long, global = true)]
    timeout: Option<String>,

    /// Connection retries count
    #[arg(long, global = true)]
    retries: Option<u32>,

    /// Route connections through a proxy URL (HTTP or SOCKS5)
    #[arg(long, global = true)]
    proxy: Option<String>,

    /// Bounded concurrency count for testing multiple targets
    #[arg(long, default_value_t = 5, global = true)]
    concurrency: usize,

    /// Verbose logging output
    #[arg(long, short = 'v', action = clap::ArgAction::Count, global = true)]
    verbose: u8,

    /// Quiet mode (suppress all logs and human text, print final verdict/data only)
    #[arg(long, short = 'q', global = true)]
    quiet: bool,

    /// Disable animated progress spinner
    #[arg(long, global = true)]
    no_progress: bool,

    /// Disable Unicode output symbols, fall back to ASCII characters
    #[arg(long, global = true)]
    no_unicode: bool,

    /// Path to custom targets configuration file
    #[arg(long, global = true)]
    config: Option<String>,

    /// Selected network profile ID or interface binding
    #[arg(long, global = true)]
    network: Option<String>,

    /// Continuous live diagnostics mode, repeating tests until stopped (Ctrl+C)
    #[arg(short = 't', long, global = true)]
    continuous: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Clone, Debug)]
enum Commands {
    /// Check local readiness of databases, permissions, and profiles
    Doctor,

    /// Test connectivity diagnostics for one or more targets
    Test {
        /// Hostnames or URLs to diagnose
        #[arg(index = 1)]
        targets: Vec<String>,

        /// Lookup by target ID in targets.json
        #[arg(long)]
        target_id: Option<String>,

        /// Test all targets in a target group
        #[arg(long)]
        group: Option<String>,

        /// Override profile ID for tests
        #[arg(long)]
        profile: Option<String>,
    },

    /// Run network preflight checks for a profile
    Preflight {
        #[arg(long)]
        profile: String,
    },

    /// Trace the network path to a target (hop-by-hop diagnostics)
    #[command(alias = "trace")]
    Traceroute {
        /// Destination host to trace
        #[arg(index = 1)]
        host: String,

        /// Maximum number of hops
        #[arg(long, default_value_t = 30)]
        max_hops: u32,

        /// Resolve router IP addresses to DNS hostnames
        #[arg(long, default_value_t = true)]
        resolve: bool,
    },

    /// Inspect local configurations (targets, profiles, schedules)
    Config {
        #[command(subcommand)]
        sub: ConfigSubcommands,
    },

    /// Manage backup and restore operations
    Backup {
        #[command(subcommand)]
        sub: BackupSubcommands,
    },

    /// Execute scheduled monitoring headlessly in background
    Monitor,

    /// Query past connection history
    History {
        #[arg(long, default_value_t = 20)]
        limit: u32,
    },

    /// Query recent incidents or failures
    Incidents {
        #[arg(long, default_value_t = 10)]
        limit: u32,
    },

    /// Generate shell completion scripts
    Completion {
        /// Target shell (bash, zsh, fish, powershell, elvish)
        #[arg(index = 1)]
        shell: String,
    },
}

#[derive(Subcommand, Clone, Debug)]
enum ConfigSubcommands {
    /// Show current loaded configuration settings
    Show,
    /// Validate configuration json schemas
    Validate,
    /// Export active configuration (excluding plaintext secrets)
    Export {
        #[arg(long, default_value = "config_export.json")]
        file: String,
    },
    /// Import configuration profiles and targets
    Import {
        #[arg(long)]
        file: String,

        #[arg(long)]
        dry_run: bool,
    },
}

#[derive(Subcommand, Clone, Debug)]
enum BackupSubcommands {
    /// Create a ZIP archive backup of active settings and history DB
    Create {
        #[arg(long, default_value = "canireach_backup.zip")]
        file: String,
    },
    /// Inspect an existing backup manifest and checksums
    Inspect {
        #[arg(long)]
        file: String,
    },
    /// Restore settings and database from a backup ZIP archive
    Restore {
        #[arg(long)]
        file: String,

        #[arg(long)]
        force: bool,
    },
}

#[derive(serde::Serialize)]
struct CliJsonResult {
    schema_version: String,
    command: String,
    target: String,
    normalized_target: String,
    status: String,
    total_elapsed_ms: u64,
    stages: Vec<CliJsonStage>,
    http: Option<CliJsonHttp>,
    warnings: Vec<String>,
    error: Option<CliJsonError>,
}

#[derive(serde::Serialize)]
struct CliJsonStage {
    name: String,
    status: String,
    duration_ms: Option<u64>,
    message: Option<String>,
    error: Option<String>,
}

#[derive(serde::Serialize)]
struct CliJsonHttp {
    status: u16,
    version: Option<String>,
}

#[derive(serde::Serialize)]
struct CliJsonError {
    stage: String,
    kind: String,
    message: String,
    technical_details: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ConfigurationExport {
    schema_version: u32,
    targets: Option<serde_json::Value>,
    groups: Option<serde_json::Value>,
    profiles: Option<serde_json::Value>,
    schedules: Option<serde_json::Value>,
}

#[tokio::main]
async fn main() {
    let mut raw_args: Vec<String> = std::env::args().collect();
    let subcommands = [
        "doctor",
        "test",
        "preflight",
        "trace",
        "traceroute",
        "config",
        "backup",
        "monitor",
        "history",
        "incidents",
        "completion",
        "help",
    ];
    let flags_with_values = [
        "--format",
        "-f",
        "--color",
        "--timeout",
        "--retries",
        "--proxy",
        "--concurrency",
        "--config",
        "--network",
    ];

    let has_subcommand = raw_args
        .iter()
        .any(|arg| subcommands.contains(&arg.as_str()));

    if !has_subcommand {
        let mut insert_idx = None;
        let mut i = 1;
        while i < raw_args.len() {
            let arg = &raw_args[i];
            if arg.starts_with('-') {
                if flags_with_values.contains(&arg.as_str()) {
                    i += 2;
                } else {
                    i += 1;
                }
            } else {
                insert_idx = Some(i);
                break;
            }
        }
        if let Some(idx) = insert_idx {
            raw_args.insert(idx, "test".to_string());
        }
    }

    let args = Cli::parse_from(raw_args);

    // Apply color settings
    match args.color.to_lowercase().as_str() {
        "always" => console::set_colors_enabled(true),
        "never" => console::set_colors_enabled(false),
        _ => {
            if std::env::var("NO_COLOR").is_ok() {
                console::set_colors_enabled(false);
            }
        }
    }

    let run_task = async {
        match args.command.clone() {
            Commands::Doctor => run_doctor(),
            Commands::Test {
                targets,
                target_id,
                group,
                profile,
            } => run_test(&args, targets, target_id, group, profile).await,
            Commands::Preflight { profile } => run_preflight(&profile).await,
            Commands::Traceroute {
                host,
                max_hops,
                resolve,
            } => run_trace(host, max_hops, resolve).await,
            Commands::Config { sub } => run_config(sub),
            Commands::Backup { sub } => run_backup(sub),
            Commands::Monitor => run_monitor().await,
            Commands::History { limit } => run_history(limit),
            Commands::Incidents { limit } => run_incidents(limit),
            Commands::Completion { shell } => run_completion(&shell),
        }
    };

    tokio::select! {
        code = run_task => {
            std::process::exit(code);
        }
        _ = tokio::signal::ctrl_c() => {
            eprintln!("\nOperation cancelled or interrupted.");
            std::process::exit(5);
        }
    }
}

fn redact_credentials(url_str: &str) -> String {
    if let Ok(mut parsed) = reqwest::Url::parse(url_str) {
        if parsed.password().is_some() || !parsed.username().is_empty() {
            let _ = parsed.set_username("[redacted]");
            let _ = parsed.set_password(None);
            parsed.to_string().replace("%5Bredacted%5D", "[redacted]")
        } else {
            url_str.to_string()
        }
    } else {
        url_str.to_string()
    }
}

fn get_diagnostic_hint(stage: FailureStage, kind: FailureKind) -> &'static str {
    match (stage, kind) {
        (FailureStage::Dns, _) => "Check local network DNS servers, gateway interface state, or proxy DNS settings.",
        (FailureStage::Tcp, FailureKind::TcpRefused) => "Connection refused by the host. Check if the port is open and services are listening.",
        (FailureStage::Tcp, FailureKind::TcpTimeout) => "TCP connection timed out. Check firewall filters, network routings, or active proxy routes.",
        (FailureStage::Tls, _) => "TLS handshake failed. Check system time/clock accuracy, expired certificate, or active decryption proxy.",
        (FailureStage::Http, _) => "Received non-2xx/3xx HTTP status. Check URL query parameters, authentication headers, or client requests.",
        (FailureStage::Redirect, _) => "Encountered infinite redirects or exceeded configured hop limit. Check URL redirection loops.",
        _ => "Verify local network state, active VPN adaptors, proxy config overrides, or target url accuracy."
    }
}

fn parse_duration_to_ms(s: &str) -> Result<u64, String> {
    let s = s.trim().to_lowercase();
    if s.ends_with("ms") {
        let val = s[..s.len() - 2].parse::<u64>().map_err(|e| e.to_string())?;
        Ok(val)
    } else if s.ends_with("s") {
        let val = s[..s.len() - 1].parse::<u64>().map_err(|e| e.to_string())?;
        Ok(val * 1000)
    } else if s.ends_with("m") {
        let val = s[..s.len() - 1].parse::<u64>().map_err(|e| e.to_string())?;
        Ok(val * 60000)
    } else {
        let val = s.parse::<u64>().map_err(|e| e.to_string())?;
        Ok(val)
    }
}

fn map_to_cli_json(res: &ProbeResult) -> CliJsonResult {
    let mut stages = Vec::new();

    if let Some(ref dns) = res.dns {
        stages.push(CliJsonStage {
            name: "dns".to_string(),
            status: dns.status.clone(),
            duration_ms: dns.duration_ms,
            message: dns
                .metadata
                .as_ref()
                .and_then(|m| m.get("outcome").cloned()),
            error: dns.error.as_ref().map(|e| e.user_message.clone()),
        });
    }
    if let Some(ref tcp) = res.tcp {
        stages.push(CliJsonStage {
            name: "tcp".to_string(),
            status: tcp.status.clone(),
            duration_ms: tcp.duration_ms,
            message: tcp
                .metadata
                .as_ref()
                .and_then(|m| m.get("outcome").cloned()),
            error: tcp.error.as_ref().map(|e| e.user_message.clone()),
        });
    }
    if let Some(ref tls) = res.tls {
        stages.push(CliJsonStage {
            name: "tls".to_string(),
            status: tls.status.clone(),
            duration_ms: tls.duration_ms,
            message: tls
                .metadata
                .as_ref()
                .and_then(|m| m.get("tls_version").cloned()),
            error: tls.error.as_ref().map(|e| e.user_message.clone()),
        });
    }
    if let Some(ref http) = res.http {
        stages.push(CliJsonStage {
            name: "http".to_string(),
            status: http.status.clone(),
            duration_ms: http.duration_ms,
            message: http
                .metadata
                .as_ref()
                .and_then(|m| m.get("negotiated_version").cloned()),
            error: http.error.as_ref().map(|e| e.user_message.clone()),
        });
    }

    let http_info = res.http_status.map(|s| CliJsonHttp {
        status: s,
        version: res
            .http
            .as_ref()
            .and_then(|h| h.metadata.as_ref())
            .and_then(|m| m.get("negotiated_version").cloned()),
    });

    let cli_status = if res.overall_status == "up" {
        "reachable".to_string()
    } else if res.overall_status == "degraded" {
        "degraded".to_string()
    } else {
        "unreachable".to_string()
    };

    let err_info = res.failure.as_ref().map(|f| CliJsonError {
        stage: format!("{:?}", f.stage),
        kind: format!("{:?}", f.kind),
        message: f.user_message.clone(),
        technical_details: f.technical_message.clone(),
    });

    CliJsonResult {
        schema_version: "1".to_string(),
        command: "test".to_string(),
        target: redact_credentials(&res.target_url),
        normalized_target: redact_credentials(
            &res.final_url
                .clone()
                .unwrap_or_else(|| res.target_url.clone()),
        ),
        status: cli_status,
        total_elapsed_ms: res.latency_ms,
        stages,
        http: http_info,
        warnings: Vec::new(),
        error: err_info,
    }
}

fn run_doctor() -> i32 {
    println!("=== CanIReach Doctor System Diagnostic ===");
    let mut ok = true;

    print!("Database Connectivity... ");
    match DbManager::get_connection() {
        Ok(_) => println!("OK"),
        Err(e) => {
            println!("FAIL ({})", e);
            ok = false;
        }
    }

    print!("Config Profiles Loader... ");
    match ProfilesLoader::load() {
        Ok(p) => println!("OK ({} profiles loaded)", p.len()),
        Err(e) => {
            println!("FAIL ({})", e);
            ok = false;
        }
    }

    print!("Targets List Loader... ");
    match TargetLoader::load() {
        Ok(t) => println!("OK ({} targets loaded)", t.len()),
        Err(e) => {
            println!("FAIL ({})", e);
            ok = false;
        }
    }

    print!("Schedules Loader... ");
    match SchedulesLoader::load() {
        Ok(s) => println!("OK ({} active schedules)", s.len()),
        Err(e) => {
            println!("FAIL ({})", e);
            ok = false;
        }
    }

    print!("DNS Resolver test (google.com)... ");
    use std::net::ToSocketAddrs;
    match "google.com:443".to_socket_addrs() {
        Ok(_) => println!("OK"),
        Err(e) => {
            println!("FAIL (Could not resolve DNS: {})", e);
            ok = false;
        }
    }

    print!("Active Adapters Scan... ");
    let vpns =
        tauri_app_lib::privacy_diagnostics::posture::NetworkPostureScanner::scan_vpn_adapters();
    if vpns.is_empty() {
        println!("OK (No VPN adapter tunnels active)");
    } else {
        println!("INFO (Active VPN adaptors: {:?})", vpns);
    }

    if ok {
        println!("\nVerdict: All systems operational.");
        0
    } else {
        println!("\nVerdict: Diagnostics issues detected.");
        3
    }
}

async fn run_test(
    cli: &Cli,
    targets: Vec<String>,
    target_id_opt: Option<String>,
    group_opt: Option<String>,
    profile_id_opt: Option<String>,
) -> i32 {
    let mut targets_to_test = Vec::new();

    if !targets.is_empty() {
        for url in targets {
            let clean_url = if !url.starts_with("http://") && !url.starts_with("https://") {
                format!("https://{}", url)
            } else {
                url.clone()
            };
            let inherited_target = {
                let targets_list = TargetLoader::load().unwrap_or_default();
                targets_list
                    .into_iter()
                    .find(|t| t.url == clean_url || t.name == clean_url || t.url == url)
            };
            if let Some(t) = inherited_target {
                targets_to_test.push(t);
            } else {
                let t = Target {
                    id: format!("cli-temp-{}", uuid::Uuid::new_v4().simple()),
                    name: clean_url.clone(),
                    url: clean_url,
                    description: Some("CLI dynamic test target".to_string()),
                    category: Some("CLI".to_string()),
                    group_ids: Vec::new(),
                    tags: Vec::new(),
                    enabled: true,
                    network_profile_id: profile_id_opt.clone(),
                    diagnostic_overrides: None,
                    created_at: chrono::Utc::now().to_rfc3339(),
                    updated_at: chrono::Utc::now().to_rfc3339(),
                };
                targets_to_test.push(t);
            }
        }
    } else if let Some(target_id) = target_id_opt {
        let loaded = TargetLoader::load().unwrap_or_default();
        if let Some(t) = loaded.into_iter().find(|t| t.id == target_id) {
            targets_to_test.push(t);
        } else {
            eprintln!(
                "Error: Target ID '{}' not found in configuration",
                target_id
            );
            return 2;
        }
    } else if let Some(group) = group_opt {
        let loaded = TargetLoader::load().unwrap_or_default();
        let matched: Vec<_> = loaded
            .into_iter()
            .filter(|t| t.group_ids.contains(&group))
            .collect();
        if matched.is_empty() {
            eprintln!("Error: No targets found in group '{}'", group);
            return 2;
        }
        targets_to_test.extend(matched);
    } else {
        eprintln!("Error: Must specify one or more target URLs, target ID, or group to test");
        return 2;
    }

    // Load active settings
    let mut config = if let Ok(content) = fs::read_to_string(get_settings_path()) {
        serde_json::from_str(&content).unwrap_or_else(|_| ProbeConfig::default())
    } else {
        ProbeConfig::default()
    };

    // Apply CLI overrides
    if let Some(ref timeout_str) = cli.timeout {
        if let Ok(ms) = parse_duration_to_ms(timeout_str) {
            let dur = Duration::from_millis(ms);
            config.connect_timeout = dur;
            config.dns_timeout = dur;
            config.tcp_timeout = dur;
            config.tls_timeout = dur;
            config.timeout = dur;
        }
    }
    if let Some(retries) = cli.retries {
        config.retry_count = retries;
    }
    if let Some(ref proxy_url) = cli.proxy {
        config.proxy_url = Some(proxy_url.clone());
    }
    config.concurrency_limit = cli.concurrency;

    let engine = match canireach_core::ProbeEngine::new(config) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("Error initializing diagnostic engine: {:?}", e);
            return 6;
        }
    };

    let is_human = cli.format == "human";
    if is_human && !cli.quiet && targets_to_test.len() > 1 {
        println!(
            "{}",
            console::style("CanIReach · Connectivity Test")
                .bold()
                .underlined()
        );
        println!();
    }

    let mut results = Vec::new();

    if cli.continuous {
        if is_human && !cli.quiet {
            println!(
                "{}",
                console::style("CanIReach · Live Continuous Diagnostics (Press Ctrl+C to stop)")
                    .cyan()
                    .bold()
            );
            println!(
                "{}",
                console::style("────────────────────────────────────────────────────────").dim()
            );
        }

        let ctrlc_cancel = Arc::new(AtomicBool::new(false));
        let cancel_clone = ctrlc_cancel.clone();

        let cancel_spawn = cancel_clone.clone();
        tokio::spawn(async move {
            let _ = tokio::signal::ctrl_c().await;
            cancel_spawn.store(true, std::sync::atomic::Ordering::SeqCst);
        });

        let mut seq = 1;
        loop {
            if cancel_clone.load(std::sync::atomic::Ordering::SeqCst) {
                break;
            }

            for target in &targets_to_test {
                if cancel_clone.load(std::sync::atomic::Ordering::SeqCst) {
                    break;
                }

                let res = engine
                    .probe_one_with_events(target, cancel_clone.clone(), |_| {})
                    .await;

                if cli.quiet {
                    if cli.format == "json" || cli.format == "ndjson" {
                        let mapped = map_to_cli_json(&res);
                        if let Ok(serialized) = serde_json::to_string(&mapped) {
                            println!("{}", serialized);
                        }
                    } else {
                        println!("{}", res.overall_status);
                    }
                } else if is_human {
                    let status_styled = if res.overall_status == "up" {
                        console::style(if cli.no_unicode { "OK" } else { "✔" }).green()
                    } else if res.overall_status == "degraded" {
                        console::style(if cli.no_unicode { "WARN" } else { "⚠" }).yellow()
                    } else {
                        console::style(if cli.no_unicode { "FAIL" } else { "✘" }).red()
                    };

                    let rtt_styled = if res.latency_ms < 200 {
                        console::style(format!("{}ms", res.latency_ms)).green()
                    } else if res.latency_ms < 800 {
                        console::style(format!("{}ms", res.latency_ms)).yellow()
                    } else {
                        console::style(format!("{}ms", res.latency_ms)).red()
                    };

                    let http_status_str = res
                        .http_status
                        .map(|s| format!("HTTP {}", s))
                        .unwrap_or_else(|| "HTTP —".to_string());

                    let dns_time = res
                        .dns
                        .as_ref()
                        .and_then(|d| d.duration_ms)
                        .map(|d| format!("dns={}ms", d))
                        .unwrap_or_else(|| "dns=—".to_string());
                    let tcp_time = res
                        .tcp
                        .as_ref()
                        .and_then(|t| t.duration_ms)
                        .map(|t| format!("tcp={}ms", t))
                        .unwrap_or_else(|| "tcp=—".to_string());
                    let tls_time = res
                        .tls
                        .as_ref()
                        .and_then(|t| t.duration_ms)
                        .map(|t| format!("tls={}ms", t))
                        .unwrap_or_else(|| "tls=—".to_string());
                    let http_time = res
                        .http
                        .as_ref()
                        .and_then(|h| h.duration_ms)
                        .map(|h| format!("http={}ms", h))
                        .unwrap_or_else(|| "http=—".to_string());

                    let target_url_redacted = redact_credentials(&target.url);
                    println!(
                        "[{}] {} {} | rtt={} | {} | {}, {}, {}, {}",
                        seq,
                        status_styled,
                        console::style(target_url_redacted).bold(),
                        rtt_styled,
                        console::style(http_status_str).cyan(),
                        console::style(dns_time).dim(),
                        console::style(tcp_time).dim(),
                        console::style(tls_time).dim(),
                        console::style(http_time).dim()
                    );
                } else if cli.format == "json" || cli.format == "ndjson" {
                    let mapped = map_to_cli_json(&res);
                    if let Ok(line) = serde_json::to_string(&mapped) {
                        println!("{}", line);
                    }
                }
            }

            seq += 1;
            tokio::time::sleep(Duration::from_secs(1)).await;
        }

        return 0;
    }

    if targets_to_test.len() == 1 {
        let target = &targets_to_test[0];
        let target_url_redacted = redact_credentials(&target.url);

        if is_human && !cli.quiet {
            println!(
                "{}",
                console::style("CanIReach · Connection Diagnostics")
                    .cyan()
                    .bold()
            );
            println!(
                "{}",
                console::style("────────────────────────────────────────────────────────").dim()
            );
            println!(
                "  {:<12} {}",
                console::style("Endpoint:").dim(),
                console::style(&target_url_redacted).bold()
            );
            if let Some(ref cat) = target.category {
                println!("  {:<12} {}", console::style("Category:").dim(), cat);
            }
            println!();
        }

        let spinner =
            if is_human && !cli.quiet && !cli.no_progress && console::Term::stdout().is_term() {
                let pb = ProgressBar::new_spinner();
                pb.set_style(
                    ProgressStyle::default_spinner()
                        .tick_chars("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏")
                        .template("{spinner:.green} {msg}")
                        .expect("Valid template"),
                );
                pb.set_message("Initiating connection diagnostics...");
                pb.enable_steady_tick(Duration::from_millis(80));
                Some(pb)
            } else {
                None
            };

        let is_quiet = cli.quiet;
        let no_unicode = cli.no_unicode;
        let spinner_clone = spinner.clone();

        let res = engine
            .probe_one_with_events(target, Arc::new(AtomicBool::new(false)), move |event| {
                if is_quiet || !is_human {
                    return;
                }
                match event {
                    ProbeEvent::StageStarted { stage, .. } => {
                        if let Some(ref pb) = spinner_clone {
                            pb.set_message(format!(
                                "{} stage: {}",
                                console::style("»").cyan().bold(),
                                console::style(stage.to_uppercase()).bold()
                            ));
                        }
                    }
                    ProbeEvent::StageCompleted {
                        stage,
                        result: stage_res,
                        ..
                    } => {
                        let is_ok = stage_res.status == "passed";
                        let icon = if is_ok {
                            if no_unicode {
                                "[OK] "
                            } else {
                                "✔ "
                            }
                        } else {
                            if no_unicode {
                                "[FAIL] "
                            } else {
                                "✘ "
                            }
                        };
                        let icon_styled = if is_ok {
                            console::style(icon).green()
                        } else {
                            console::style(icon).red()
                        };
                        let duration_styled = stage_res
                            .duration_ms
                            .map(|d| {
                                if d < 150 {
                                    console::style(format!("{} ms", d)).green().to_string()
                                } else if d < 500 {
                                    console::style(format!("{} ms", d)).yellow().to_string()
                                } else {
                                    console::style(format!("{} ms", d)).red().to_string()
                                }
                            })
                            .unwrap_or_else(|| "—".to_string());
                        let mut extra_info = String::new();

                        if let Some(ref meta) = stage_res.metadata {
                            if stage == "dns" {
                                if let Some(ips) = meta.get("resolved_ips") {
                                    extra_info = format!("resolved: {}", ips);
                                }
                            } else if stage == "tcp" {
                                if let Some(addr) = meta.get("connected_address") {
                                    extra_info = format!("endpoint: {}", addr);
                                }
                            } else if stage == "tls" {
                                let ver = meta.get("tls_version").cloned().unwrap_or_default();
                                let alpn = meta.get("alpn_protocol").cloned().unwrap_or_default();
                                extra_info = format!("protocol: {} ({})", ver, alpn);
                            } else if stage == "http" {
                                if let Some(status) = meta.get("status_code") {
                                    extra_info = format!("status: {}", status);
                                }
                            }
                        }

                        let line = format!(
                            "  {}  {:<6}  {:<25} {}",
                            icon_styled,
                            stage.to_uppercase(),
                            duration_styled,
                            console::style(extra_info).dim()
                        );
                        if let Some(ref pb) = spinner_clone {
                            pb.println(line);
                        } else {
                            println!("{}", line);
                        }
                    }
                    _ => {}
                }
            })
            .await;

        if let Some(pb) = spinner {
            pb.finish_and_clear();
        }

        if is_human && !cli.quiet {
            println!();

            let status_str = if res.overall_status == "up" {
                console::style("REACHABLE").green().bold()
            } else if res.overall_status == "degraded" {
                console::style("DEGRADED").yellow().bold()
            } else {
                console::style("UNREACHABLE").red().bold()
            };

            let total_time_styled = if res.latency_ms < 200 {
                console::style(format!("{} ms", res.latency_ms)).green()
            } else if res.latency_ms < 800 {
                console::style(format!("{} ms", res.latency_ms)).yellow()
            } else {
                console::style(format!("{} ms", res.latency_ms)).red()
            };

            let http_status_str = res
                .http_status
                .map(|s| s.to_string())
                .unwrap_or_else(|| "—".to_string());

            let corner_top_left = if no_unicode { "+" } else { "┌" };
            let corner_top_right = if no_unicode { "+" } else { "┐" };
            let corner_bottom_left = if no_unicode { "+" } else { "└" };
            let corner_bottom_right = if no_unicode { "+" } else { "┘" };
            let border_horizontal = if no_unicode { "-" } else { "─" };
            let border_vertical = if no_unicode { "|" } else { "│" };

            println!(
                "  {}{}{}",
                corner_top_left,
                border_horizontal.repeat(48),
                corner_top_right
            );
            println!(
                "  {}  {:<15} {}",
                border_vertical,
                console::style("Verdict:").dim(),
                status_str
            );
            println!(
                "  {}  {:<15} {}",
                border_vertical,
                console::style("Response time:").dim(),
                total_time_styled
            );
            if res.http_status.is_some() {
                println!(
                    "  {}  {:<15} {}",
                    border_vertical,
                    console::style("HTTP status:").dim(),
                    http_status_str
                );
            }
            println!(
                "  {}{}{}",
                corner_bottom_left,
                border_horizontal.repeat(48),
                corner_bottom_right
            );

            if let Some(ref failure) = res.failure {
                println!();
                println!(
                    "  {}",
                    console::style("Diagnostic Failure Details:").red().bold()
                );
                println!(
                    "    {:<12} {:?}",
                    console::style("Stage:").dim(),
                    failure.stage
                );
                println!(
                    "    {:<12} {:?}",
                    console::style("Kind:").dim(),
                    failure.kind
                );
                println!(
                    "    {:<12} {}",
                    console::style("Message:").dim(),
                    failure.user_message
                );
                if let Some(ref tech) = failure.technical_message {
                    println!("    {:<12} {}", console::style("Technical:").dim(), tech);
                }
                let hint = get_diagnostic_hint(failure.stage, failure.kind);
                println!(
                    "    {:<12} {}",
                    console::style("Hint:").dim(),
                    console::style(hint).yellow()
                );
            }
            println!(
                "{}",
                console::style("────────────────────────────────────────────────────────").dim()
            );
        }
        results.push(res);
    } else {
        // Concurrently run multiple targets
        let semaphore = Arc::new(tokio::sync::Semaphore::new(cli.concurrency));
        let engine_arc = Arc::new(engine);

        let multi_bar =
            if is_human && !cli.quiet && !cli.no_progress && console::Term::stdout().is_term() {
                Some(Arc::new(MultiProgress::new()))
            } else {
                None
            };

        let mut tasks = Vec::new();
        for target in targets_to_test {
            let sem = semaphore.clone();
            let eng = engine_arc.clone();
            let is_quiet = cli.quiet;
            let no_unicode = cli.no_unicode;
            let m_bar = multi_bar.clone();

            let task = tokio::spawn(async move {
                let _permit = sem.acquire().await;
                let target_url_redacted = redact_credentials(&target.url);
                let target_url_redacted_for_event = target_url_redacted.clone();

                let pb = if let Some(ref mb) = m_bar {
                    let p = mb.add(ProgressBar::new_spinner());
                    p.set_style(
                        ProgressStyle::default_spinner()
                            .tick_chars("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏")
                            .template("{spinner:.green} {msg}")
                            .expect("Valid template"),
                    );
                    p.set_message(format!("Testing {}...", target_url_redacted));
                    p.enable_steady_tick(Duration::from_millis(80));
                    Some(p)
                } else {
                    None
                };

                let pb_clone = pb.clone();
                let res = eng
                    .probe_one_with_events(
                        &target,
                        Arc::new(AtomicBool::new(false)),
                        move |event| {
                            if is_quiet {
                                return;
                            }
                            if let ProbeEvent::StageStarted { stage, .. } = event {
                                if let Some(ref p) = pb_clone {
                                    p.set_message(format!(
                                        "{} : {}",
                                        target_url_redacted_for_event,
                                        stage.to_uppercase()
                                    ));
                                }
                            }
                        },
                    )
                    .await;

                if let Some(ref p) = pb {
                    let status_icon = if res.overall_status == "up" {
                        if no_unicode {
                            "[OK] "
                        } else {
                            "✓ "
                        }
                    } else if res.overall_status == "degraded" {
                        if no_unicode {
                            "[WARN] "
                        } else {
                            "⚠ "
                        }
                    } else {
                        if no_unicode {
                            "[FAIL] "
                        } else {
                            "✗ "
                        }
                    };
                    p.finish_with_message(format!(
                        "{}{:<35} ({} ms)",
                        status_icon, target_url_redacted, res.latency_ms
                    ));
                }
                res
            });
            tasks.push(task);
        }

        for task in tasks {
            if let Ok(res) = task.await {
                results.push(res);
            }
        }

        if is_human && !cli.quiet {
            println!();
            println!(
                "{}",
                console::style("Diagnostic Summary Table")
                    .bold()
                    .underlined()
            );
            println!(
                "{:<45} {:<15} {:<8} {:<10}",
                "TARGET", "STATUS", "HTTP", "RTT"
            );
            println!("{}", "-".repeat(82));

            let mut passed_count = 0;
            let mut failed_count = 0;
            let mut degraded_count = 0;

            for res in &results {
                let target_display = redact_credentials(&res.target_url);
                let status_str = if res.overall_status == "up" {
                    passed_count += 1;
                    console::style("REACHABLE").green()
                } else if res.overall_status == "degraded" {
                    degraded_count += 1;
                    console::style("DEGRADED").yellow()
                } else {
                    failed_count += 1;
                    console::style("UNREACHABLE").red()
                };

                let http_str = res
                    .http_status
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "—".to_string());
                let rtt_str = format!("{} ms", res.latency_ms);

                println!(
                    "{:<45} {:<15} {:<8} {:<10}",
                    target_display, status_str, http_str, rtt_str
                );
            }

            println!("{}", "-".repeat(82));
            println!(
                "{} reachable · {} degraded · {} failed",
                console::style(passed_count).green().bold(),
                console::style(degraded_count).yellow().bold(),
                console::style(failed_count).red().bold()
            );
        }
    }

    // Machine-readable output handling
    if cli.format == "json" {
        if results.len() == 1 {
            let mapped = map_to_cli_json(&results[0]);
            if let Ok(serialized) = serde_json::to_string_pretty(&mapped) {
                println!("{}", serialized);
            }
        } else {
            let mapped: Vec<_> = results.iter().map(map_to_cli_json).collect();
            if let Ok(serialized) = serde_json::to_string_pretty(&mapped) {
                println!("{}", serialized);
            }
        }
    } else if cli.format == "ndjson" {
        for res in &results {
            let mapped = map_to_cli_json(res);
            if let Ok(line) = serde_json::to_string(&mapped) {
                println!("{}", line);
            }
        }
    }

    let any_failed = results
        .iter()
        .any(|r| r.overall_status == "down" || r.status == ProbeStatus::Failed);
    if any_failed {
        if results.len() == 1 {
            map_failure_to_exit_code(&results[0])
        } else {
            1
        }
    } else {
        0
    }
}

fn map_failure_to_exit_code(res: &ProbeResult) -> i32 {
    if res.overall_status == "up" {
        return 0;
    }
    if let Some(ref failure) = res.failure {
        match failure.kind {
            FailureKind::ConnectionTimeout | FailureKind::DnsTimeout | FailureKind::TcpTimeout => 4,
            _ => 1,
        }
    } else {
        1
    }
}

async fn run_preflight(profile_id: &str) -> i32 {
    println!("Running preflight check for profile: {}", profile_id);
    let profiles = match ProfilesLoader::load() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Error loading profiles: {}", e);
            return 6;
        }
    };

    let profile = match profiles.iter().find(|p| p.id == profile_id) {
        Some(p) => p,
        None => {
            eprintln!("Profile '{}' not found", profile_id);
            return 2;
        }
    };

    let preflight_settings = match &profile.preflight {
        Some(settings) => settings,
        None => {
            println!(
                "No preflight check is configured on profile: {}. Skipping.",
                profile.name
            );
            return 0;
        }
    };

    if !preflight_settings.run_preflight {
        println!(
            "Preflight check is disabled for profile: {}. Skipping.",
            profile.name
        );
        return 0;
    }

    let timeout = Duration::from_millis(preflight_settings.timeout_ms as u64);
    let client = match tauri_app_lib::privacy_diagnostics::client::build_client_for_profile(
        profile, timeout,
    ) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to construct connection client for profile: {}", e);
            return 3;
        }
    };

    let mut successes = 0;
    for endpoint in &preflight_settings.endpoints {
        print!(
            "  Checking preflight endpoint {}... ",
            redact_credentials(endpoint)
        );
        let _ = std::io::stdout().flush();
        match client.head(endpoint).send().await {
            Ok(resp) if resp.status().is_success() || resp.status().is_redirection() => {
                println!("{}", console::style("OK").green());
                successes += 1;
            }
            Ok(resp) => {
                println!(
                    "{}",
                    console::style(format!("FAIL (HTTP status {})", resp.status())).red()
                );
            }
            Err(e) => {
                println!("{}", console::style(format!("FAIL ({})", e)).red());
            }
        }
    }

    println!(
        "Preflight finished: {}/{} endpoints responded successfully.",
        successes,
        preflight_settings.endpoints.len()
    );
    if successes >= preflight_settings.min_success_count {
        println!("Verdict: Preflight diagnostics PASSED.");
        0
    } else {
        println!("Verdict: Preflight diagnostics FAILED (did not reach minimum success target).");
        3
    }
}

async fn run_trace(host: String, max_hops: u32, resolve: bool) -> i32 {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    let trace_id = uuid::Uuid::new_v4().to_string();

    println!(
        "Initiating Path Traceroute to: {} (Max Hops: {})",
        host, max_hops
    );

    let result = run_traceroute(
        None,
        "cli-trace".to_string(),
        "CLI Trace".to_string(),
        host.clone(),
        trace_id,
        max_hops,
        resolve,
        cancel_flag,
    )
    .await;

    match result {
        Ok(res) => {
            println!("\nTraceroute Completed (Status: {:?})", res.status);
            println!("Hops Summary:");
            for hop in &res.hops {
                let ip_str = hop
                    .address
                    .as_deref()
                    .map(|ip| format!("({})", ip))
                    .unwrap_or_default();
                let host_str = hop.hostname.as_deref().unwrap_or("*");
                print!("  {:>2}  {:<35} {}", hop.hop_number, host_str, ip_str);

                let mut rtts = Vec::new();
                for resp in &hop.responses {
                    if let Some(rtt) = resp.rtt_ms {
                        rtts.push(format!("{:.2} ms", rtt));
                    } else {
                        rtts.push("*".to_string());
                    }
                }
                println!("  {:?}", rtts);
            }
            0
        }
        Err(e) => {
            eprintln!("Error executing traceroute: {}", e);
            4
        }
    }
}

fn run_config(sub: ConfigSubcommands) -> i32 {
    match sub {
        ConfigSubcommands::Show => {
            println!("=== Targets Config ===");
            if let Ok(t) = fs::read_to_string(get_targets_path()) {
                println!("{}", t);
            }
            println!("=== Profiles Config ===");
            if let Ok(p) = fs::read_to_string(get_profiles_path()) {
                println!("{}", p);
            }
            println!("=== Schedules Config ===");
            if let Ok(s) = fs::read_to_string(get_schedules_path()) {
                println!("{}", s);
            }
            0
        }
        ConfigSubcommands::Validate => {
            let mut all_ok = true;
            print!("Validating profiles config... ");
            match ProfilesLoader::load() {
                Ok(_) => println!("OK"),
                Err(e) => {
                    println!("FAIL ({})", e);
                    all_ok = false;
                }
            }
            print!("Validating targets config... ");
            match TargetLoader::load() {
                Ok(_) => println!("OK"),
                Err(e) => {
                    println!("FAIL ({})", e);
                    all_ok = false;
                }
            }
            print!("Validating groups config... ");
            match GroupsLoader::load() {
                Ok(_) => println!("OK"),
                Err(e) => {
                    println!("FAIL ({})", e);
                    all_ok = false;
                }
            }
            print!("Validating schedules config... ");
            match SchedulesLoader::load() {
                Ok(_) => println!("OK"),
                Err(e) => {
                    println!("FAIL ({})", e);
                    all_ok = false;
                }
            }
            if all_ok {
                0
            } else {
                2
            }
        }
        ConfigSubcommands::Export { file } => match export_config(&file) {
            Ok(_) => {
                println!("Configurations successfully exported to {}", file);
                0
            }
            Err(e) => {
                eprintln!("Export failed: {}", e);
                2
            }
        },
        ConfigSubcommands::Import { file, dry_run } => match import_config(&file, dry_run) {
            Ok(_) => {
                if !dry_run {
                    println!("Configurations successfully imported from {}", file);
                }
                0
            }
            Err(e) => {
                eprintln!("Import failed: {}", e);
                2
            }
        },
    }
}

fn run_backup(sub: BackupSubcommands) -> i32 {
    match sub {
        BackupSubcommands::Create { file } => match create_backup(&file) {
            Ok(_) => {
                println!("Backup successfully created: {}", file);
                0
            }
            Err(e) => {
                eprintln!("Failed to create backup: {}", e);
                6
            }
        },
        BackupSubcommands::Inspect { file } => match inspect_backup(&file) {
            Ok(_) => 0,
            Err(e) => {
                eprintln!("Inspection failed: {}", e);
                2
            }
        },
        BackupSubcommands::Restore { file, force } => {
            if !force {
                print!("WARNING: This will overwrite your active database and configuration settings. Proceed? (y/n): ");
                let _ = std::io::stdout().flush();
                let mut answer = String::new();
                let _ = std::io::stdin().read_line(&mut answer);
                if answer.trim().to_lowercase() != "y" {
                    println!("Restore cancelled.");
                    return 0;
                }
            }
            match restore_backup(&file) {
                Ok(_) => {
                    println!("Configurations and database successfully restored.");
                    0
                }
                Err(e) => {
                    eprintln!("Failed to restore backup: {}", e);
                    6
                }
            }
        }
    }
}

async fn run_monitor() -> i32 {
    println!("=== CanIReach Headless Monitoring Daemon ===");

    let _lock = match SchedulerLock::acquire() {
        Ok(l) => {
            println!("Acquired scheduler lock. Starting loop.");
            l
        }
        Err(owner_pid) => {
            let pid_str = owner_pid
                .map(|p| p.to_string())
                .unwrap_or_else(|| "unknown".to_string());
            eprintln!("Error: Another scheduler process (PID {}) is already running monitoring schedules.", pid_str);
            return 3;
        }
    };

    println!("Monitoring active. Press Ctrl+C to terminate.");

    loop {
        let schedules = match SchedulesLoader::load() {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Error loading schedules: {}", e);
                tokio::time::sleep(Duration::from_secs(10)).await;
                continue;
            }
        };

        let now = chrono::Utc::now();
        let mut due_schedules = Vec::new();
        let mut next_wake = now + chrono::Duration::hours(1);
        let mut modified = false;

        let mut updated_schedules = schedules.clone();
        for schedule in &mut updated_schedules {
            if !schedule.enabled {
                continue;
            }

            if let Some(ref next_run_str) = schedule.next_run_at {
                if let Ok(next_run) = chrono::DateTime::parse_from_rfc3339(next_run_str) {
                    let next_run_utc = next_run.with_timezone(&chrono::Utc);
                    if next_run_utc <= now {
                        due_schedules.push(schedule.clone());
                        schedule.last_run_at = Some(now.to_rfc3339());
                        schedule.next_run_at =
                            schedule.calculate_next_run(now).map(|t| t.to_rfc3339());
                        modified = true;
                    } else if next_run_utc < next_wake {
                        next_wake = next_run_utc;
                    }
                }
            }
        }

        if modified {
            let _ = SchedulesLoader::save(&updated_schedules);
        }

        for schedule in due_schedules {
            tokio::spawn(async move {
                if let Err(err) = SchedulerService::execute_schedule(None, schedule).await {
                    eprintln!("ERROR: Schedule run failed: {:?}", err);
                }
            });
        }

        let sleep_duration = (next_wake - chrono::Utc::now()).num_milliseconds();
        if sleep_duration > 0 {
            tokio::time::sleep(Duration::from_millis(sleep_duration as u64)).await;
        } else {
            tokio::time::sleep(Duration::from_millis(1000)).await;
        }
    }
}

fn run_history(limit: u32) -> i32 {
    let conn = match DbManager::get_connection() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to open DB: {}", e);
            return 6;
        }
    };

    let mut stmt = match conn.prepare(
        "SELECT target_id, status, latency_ms, http_status, started_at 
         FROM target_runs 
         ORDER BY started_at DESC 
         LIMIT ?",
    ) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("SQL prepare error: {}", e);
            return 6;
        }
    };

    let rows = stmt.query_map([limit], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, Option<i64>>(3)?,
            row.get::<_, String>(4)?,
        ))
    });

    if let Ok(iter) = rows {
        println!(
            "{:<30} {:<12} {:<10} {:<8} {:<25}",
            "Target", "Status", "Latency", "HTTP", "Timestamp"
        );
        println!("{}", "-".repeat(88));
        for r in iter.flatten() {
            let http_str =
                r.3.map(|s| s.to_string())
                    .unwrap_or_else(|| "-".to_string());
            println!(
                "{:<30} {:<12} {:<10} {:<8} {:<25}",
                r.0,
                r.1,
                format!("{}ms", r.2),
                http_str,
                r.4
            );
        }
    }
    0
}

fn run_incidents(limit: u32) -> i32 {
    let conn = match DbManager::get_connection() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to open DB: {}", e);
            return 6;
        }
    };

    let mut stmt = match conn.prepare(
        "SELECT target_id, title, status, started_at, resolved_at 
         FROM incidents 
         ORDER BY started_at DESC 
         LIMIT ?",
    ) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("SQL prepare error: {}", e);
            return 6;
        }
    };

    let rows = stmt.query_map([limit], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<String>>(4)?,
        ))
    });

    if let Ok(iter) = rows {
        println!(
            "{:<25} {:<30} {:<12} {:<25} {:<25}",
            "Target", "Title", "Status", "Opened At", "Resolved At"
        );
        println!("{}", "-".repeat(120));
        for r in iter.flatten() {
            let resolved_str = r.4.unwrap_or_else(|| "-".to_string());
            println!(
                "{:<25} {:<30} {:<12} {:<25} {:<25}",
                r.0, r.1, r.2, r.3, resolved_str
            );
        }
    }
    0
}

fn export_config(export_path: &str) -> Result<(), String> {
    let targets = fs::read_to_string(get_targets_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok());
    let groups = fs::read_to_string(get_groups_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok());
    let profiles = fs::read_to_string(get_profiles_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok());
    let schedules = fs::read_to_string(get_schedules_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok());

    let export = ConfigurationExport {
        schema_version: 1,
        targets,
        groups,
        profiles,
        schedules,
    };

    let serialized = serde_json::to_string_pretty(&export).map_err(|e| e.to_string())?;
    fs::write(export_path, serialized).map_err(|e| e.to_string())?;
    Ok(())
}

fn import_config(import_path: &str, dry_run: bool) -> Result<(), String> {
    let content = fs::read_to_string(import_path).map_err(|e| e.to_string())?;
    let import: ConfigurationExport = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    if dry_run {
        println!("Dry run config validation succeeded! Contents:");
        if let Some(ref t) = import.targets {
            println!(
                "  - Targets: {} loaded",
                t.as_array().map(|a| a.len()).unwrap_or(0)
            );
        }
        if let Some(ref g) = import.groups {
            println!(
                "  - Groups: {} loaded",
                g.as_array().map(|a| a.len()).unwrap_or(0)
            );
        }
        if let Some(ref p) = import.profiles {
            println!(
                "  - Profiles: {} loaded",
                p.as_array().map(|a| a.len()).unwrap_or(0)
            );
        }
        if let Some(ref s) = import.schedules {
            println!(
                "  - Schedules: {} loaded",
                s.as_array().map(|a| a.len()).unwrap_or(0)
            );
        }
        return Ok(());
    }

    if let Some(targets) = import.targets {
        let serialized = serde_json::to_string_pretty(&targets).map_err(|e| e.to_string())?;
        fs::write(get_targets_path(), serialized).map_err(|e| e.to_string())?;
    }
    if let Some(groups) = import.groups {
        let serialized = serde_json::to_string_pretty(&groups).map_err(|e| e.to_string())?;
        fs::write(get_groups_path(), serialized).map_err(|e| e.to_string())?;
    }
    if let Some(profiles) = import.profiles {
        let serialized = serde_json::to_string_pretty(&profiles).map_err(|e| e.to_string())?;
        fs::write(get_profiles_path(), serialized).map_err(|e| e.to_string())?;
    }
    if let Some(schedules) = import.schedules {
        let serialized = serde_json::to_string_pretty(&schedules).map_err(|e| e.to_string())?;
        fs::write(get_schedules_path(), serialized).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn create_backup(backup_path: &str) -> Result<(), String> {
    let file = File::create(backup_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let files_to_backup = [
        ("settings.json", get_settings_path()),
        ("targets.json", get_targets_path()),
        ("groups.json", get_groups_path()),
        ("profiles.json", get_profiles_path()),
        ("schedules.json", get_schedules_path()),
        ("history.db", get_db_path()),
    ];

    for (name, path) in &files_to_backup {
        if path.exists() {
            let mut f = File::open(path).map_err(|e| e.to_string())?;
            let mut contents = Vec::new();
            f.read_to_end(&mut contents).map_err(|e| e.to_string())?;

            zip.start_file(*name, options).map_err(|e| e.to_string())?;
            zip.write_all(&contents).map_err(|e| e.to_string())?;
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn inspect_backup(backup_path: &str) -> Result<(), String> {
    let file = File::open(backup_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    println!("Backup ZIP archive: {}", backup_path);
    println!("Contains {} files:", archive.len());
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|e| e.to_string())?;
        println!("  - {} ({} bytes)", file.name(), file.size());
    }
    Ok(())
}

fn restore_backup(backup_path: &str) -> Result<(), String> {
    let file = File::open(backup_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let filename = match file.enclosed_name() {
            Some(path) => path.file_name().unwrap().to_str().unwrap().to_string(),
            None => continue,
        };
        let outpath = get_app_data_dir().join(filename);

        if let Some(p) = outpath.parent() {
            fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }

        let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
        std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn run_completion(shell_str: &str) -> i32 {
    use clap::CommandFactory;
    use clap_complete::generate;

    let mut cmd = Cli::command();
    let shell = match shell_str.to_lowercase().as_str() {
        "bash" => clap_complete::Shell::Bash,
        "zsh" => clap_complete::Shell::Zsh,
        "fish" => clap_complete::Shell::Fish,
        "powershell" => clap_complete::Shell::PowerShell,
        "elvish" => clap_complete::Shell::Elvish,
        _ => {
            eprintln!(
                "Error: Unsupported shell '{}'. Supported: bash, zsh, fish, powershell, elvish",
                shell_str
            );
            return 2;
        }
    };

    generate(shell, &mut cmd, "canireach", &mut std::io::stdout());
    0
}

#[cfg(test)]
mod cli_tests {
    use super::*;

    #[test]
    fn test_parse_duration() {
        assert_eq!(parse_duration_to_ms("500ms").unwrap(), 500);
        assert_eq!(parse_duration_to_ms("5s").unwrap(), 5000);
        assert_eq!(parse_duration_to_ms("2m").unwrap(), 120000);
        assert_eq!(parse_duration_to_ms("1000").unwrap(), 1000);
        assert!(parse_duration_to_ms("invalid").is_err());
    }

    #[test]
    fn test_redact_credentials() {
        assert_eq!(
            redact_credentials("https://github.com"),
            "https://github.com"
        );
        assert_eq!(
            redact_credentials("https://user:pass@github.com"),
            "https://[redacted]@github.com/"
        );
    }
}
