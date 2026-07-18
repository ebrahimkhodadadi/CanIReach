use crate::error::AppError;
use canireach_core::Target;
use std::fs;
use std::path::PathBuf;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ConfigCategory {
    pub name: String,
    pub targets: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct TargetsConfig {
    pub categories: Vec<ConfigCategory>,
}

pub struct TargetLoader;

impl TargetLoader {
    pub fn load() -> Result<Vec<Target>, AppError> {
        let paths = vec![
            crate::config::get_targets_path(),
            PathBuf::from("config/targets.json"),
            PathBuf::from("../config/targets.json"),
        ];

        let mut content = None;
        let mut loaded_path = None;

        for path in &paths {
            if path.exists() {
                if let Ok(c) = fs::read_to_string(path) {
                    content = Some(c);
                    loaded_path = Some(path.clone());
                    break;
                }
            }
        }

        let file_content = match content {
            Some(c) => c,
            None => {
                // If file does not exist, initialize defaults
                let defaults = Self::get_defaults();
                let save_path = crate::config::get_targets_path();
                if let Some(parent) = save_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                if let Ok(serialized) = serde_json::to_string_pretty(&defaults) {
                    let _ = fs::write(&save_path, serialized);
                }
                return Ok(defaults);
            }
        };

        // 1. Try to deserialize as new format: Vec<Target>
        if let Ok(mut targets) = serde_json::from_str::<Vec<Target>>(&file_content) {
            // Check if we need to migrate and merge default targets
            let has_new_defaults = targets.iter().any(|t| t.id == "google_homepage");
            if !has_new_defaults {
                let defaults = Self::get_defaults();
                let mut seen_ids: std::collections::HashSet<String> =
                    targets.iter().map(|t| t.id.clone()).collect();
                for d in defaults {
                    if seen_ids.insert(d.id.clone()) {
                        targets.push(d);
                    }
                }
                // Save updated targets list back to file
                let save_path = crate::config::get_targets_path();
                if let Ok(serialized) = serde_json::to_string_pretty(&targets) {
                    let _ = fs::write(&save_path, serialized);
                }
            }
            return Ok(targets);
        }

        // 2. Fallback to old format: TargetsConfig
        if let Ok(config) = serde_json::from_str::<TargetsConfig>(&file_content) {
            let mut targets = Vec::new();
            let mut seen_ids = std::collections::HashSet::new();

            for category in config.categories {
                if category.name.trim().is_empty() {
                    continue;
                }

                for domain in category.targets {
                    let domain_trimmed = domain.trim();
                    if domain_trimmed.is_empty() {
                        continue;
                    }

                    let id = domain_trimmed.to_string();
                    if !seen_ids.insert(id.clone()) {
                        continue;
                    }

                    targets.push(Target {
                        id: id.clone(),
                        name: id.clone(),
                        url: id,
                        description: None,
                        category: Some(category.name.clone()),
                        group_ids: Vec::new(),
                        tags: Vec::new(),
                        enabled: true,
                        network_profile_id: None,
                        diagnostic_overrides: None,
                        created_at: chrono::Utc::now().to_rfc3339(),
                        updated_at: chrono::Utc::now().to_rfc3339(),
                    });
                }
            }

            // Write migrated format back to config file
            if let Some(ref path) = loaded_path {
                if let Ok(serialized) = serde_json::to_string_pretty(&targets) {
                    let _ = fs::write(path, serialized);
                }
            }

            return Ok(targets);
        }

        Err(AppError::Config(format!(
            "Failed to parse target config file at {:?}",
            loaded_path
        )))
    }

    pub fn save(targets: &Vec<Target>) -> Result<(), AppError> {
        let app_path = crate::config::get_targets_path();
        let paths = vec![
            app_path.clone(),
            PathBuf::from("config/targets.json"),
            PathBuf::from("../config/targets.json"),
        ];

        let mut save_path = app_path;
        for path in &paths {
            if path.exists() {
                save_path = path.clone();
                break;
            }
        }

        if let Some(parent) = save_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let serialized = serde_json::to_string_pretty(targets)
            .map_err(|e| AppError::Generic(format!("Failed to serialize targets: {}", e)))?;
        fs::write(save_path, serialized)
            .map_err(|e| AppError::Generic(format!("Failed to write targets: {}", e)))?;

        Ok(())
    }

    fn get_defaults() -> Vec<Target> {
        let default_domains = vec![
            // Google
            ("google_homepage", "https://www.google.com", "Google"),
            ("google_gstatic", "https://www.gstatic.com", "Google"),
            ("google_fonts_api", "https://fonts.googleapis.com", "Google"),
            ("google_fonts_static", "https://fonts.gstatic.com", "Google"),
            ("google_storage", "https://storage.googleapis.com", "Google"),
            ("google_download", "https://dl.google.com", "Google"),
            ("google_play_api", "https://play.googleapis.com", "Google"),
            (
                "google_android_api",
                "https://android.googleapis.com",
                "Google",
            ),
            ("google_oauth", "https://oauth2.googleapis.com", "Google"),
            ("google_apis", "https://www.googleapis.com", "Google"),
            (
                "google_firebase_api",
                "https://firebase.googleapis.com",
                "Google",
            ),
            (
                "google_firebase_web",
                "https://firebase.google.com",
                "Google",
            ),
            ("google_fcm", "https://fcm.googleapis.com", "Google"),
            ("google_maps_api", "https://maps.googleapis.com", "Google"),
            ("google_dns", "https://dns.google", "Google"),
            // Flutter & Dart
            ("flutter_homepage", "https://flutter.dev", "Flutter & Dart"),
            ("flutter_docs", "https://docs.flutter.dev", "Flutter & Dart"),
            ("flutter_api", "https://api.flutter.dev", "Flutter & Dart"),
            (
                "flutter_infra",
                "https://storage.googleapis.com/flutter_infra_release",
                "Flutter & Dart",
            ),
            ("pub_dev", "https://pub.dev", "Flutter & Dart"),
            ("dart_dev", "https://dart.dev", "Flutter & Dart"),
            // Android
            (
                "android_download_sdk",
                "https://dl.google.com/android",
                "Android",
            ),
            (
                "android_download_dl",
                "https://dl.google.com/dl/android",
                "Android",
            ),
            ("android_maven", "https://maven.google.com", "Android"),
            (
                "android_developer",
                "https://developer.android.com",
                "Android",
            ),
            // Apple
            ("apple_developer", "https://developer.apple.com", "Apple"),
            (
                "apple_connect",
                "https://appstoreconnect.apple.com",
                "Apple",
            ),
            (
                "apple_connect_api",
                "https://api.appstoreconnect.apple.com",
                "Apple",
            ),
            // GitHub
            ("github_homepage", "https://github.com", "GitHub"),
            ("github_api", "https://api.github.com", "GitHub"),
            ("github_raw", "https://raw.githubusercontent.com", "GitHub"),
            (
                "github_objects",
                "https://objects.githubusercontent.com",
                "GitHub",
            ),
            (
                "github_user_content",
                "https://githubusercontent.com",
                "GitHub",
            ),
            ("github_ghcr", "https://ghcr.io", "GitHub"),
            // GitLab
            ("gitlab_homepage", "https://gitlab.com", "GitLab"),
            ("gitlab_about", "https://about.gitlab.com", "GitLab"),
            // Bitbucket
            ("bitbucket_homepage", "https://bitbucket.org", "Bitbucket"),
            ("bitbucket_api", "https://api.bitbucket.org", "Bitbucket"),
            // Node.js
            ("nodejs_homepage", "https://nodejs.org", "Node.js"),
            ("npm_registry", "https://registry.npmjs.org", "Node.js"),
            ("npm_homepage", "https://www.npmjs.com", "Node.js"),
            // Java
            ("maven_central", "https://repo.maven.apache.org", "Java"),
            ("maven_search", "https://search.maven.org", "Java"),
            ("maven_repo1", "https://repo1.maven.org", "Java"),
            // Gradle
            ("gradle_services", "https://services.gradle.org", "Gradle"),
            ("gradle_plugins", "https://plugins.gradle.org", "Gradle"),
            // NuGet
            ("nuget_api", "https://api.nuget.org", "NuGet"),
            ("nuget_homepage", "https://www.nuget.org", "NuGet"),
            // .NET
            ("dotnet_homepage", "https://dotnet.microsoft.com", " .NET"),
            (
                "dotnet_builds",
                "https://builds.dotnet.microsoft.com",
                " .NET",
            ),
            // Python
            ("pypi_registry", "https://pypi.org", "Python"),
            (
                "python_hosted_files",
                "https://files.pythonhosted.org",
                "Python",
            ),
            // Rust
            ("crates_io_registry", "https://crates.io", "Rust"),
            ("crates_io_static", "https://static.crates.io", "Rust"),
            ("rust_docs", "https://doc.rust-lang.org", "Rust"),
            // Go
            ("go_proxy", "https://proxy.golang.org", "Go"),
            ("go_sum", "https://sum.golang.org", "Go"),
            ("go_pkg", "https://pkg.go.dev", "Go"),
            // PHP
            ("packagist_registry", "https://packagist.org", "PHP"),
            ("composer_homepage", "https://getcomposer.org", "PHP"),
            // Ruby
            ("rubygems_registry", "https://rubygems.org", "Ruby"),
            // Docker
            ("docker_hub", "https://hub.docker.com", "Docker"),
            ("docker_registry", "https://registry-1.docker.io", "Docker"),
            ("docker_auth", "https://auth.docker.io", "Docker"),
            (
                "docker_production",
                "https://production.cloudflare.docker.com",
                "Docker",
            ),
            // Kubernetes
            ("kubernetes_homepage", "https://kubernetes.io", "Kubernetes"),
            (
                "kubernetes_registry",
                "https://registry.k8s.io",
                "Kubernetes",
            ),
            // HashiCorp
            (
                "hashicorp_releases",
                "https://releases.hashicorp.com",
                "HashiCorp",
            ),
            (
                "hashicorp_registry",
                "https://registry.terraform.io",
                "HashiCorp",
            ),
            // Cloudflare
            ("cloudflare_dns_ip", "https://1.1.1.1", "Cloudflare"),
            (
                "cloudflare_dns_name",
                "https://one.one.one.one",
                "Cloudflare",
            ),
            (
                "cloudflare_developers",
                "https://developers.cloudflare.com",
                "Cloudflare",
            ),
            ("cloudflare_api", "https://api.cloudflare.com", "Cloudflare"),
            // AWS
            ("aws_homepage", "https://aws.amazon.com", "AWS"),
            ("aws_docs", "https://docs.aws.amazon.com", "AWS"),
            // Azure
            ("azure_homepage", "https://azure.microsoft.com", "Azure"),
            ("azure_management", "https://management.azure.com", "Azure"),
            // Google Cloud
            ("gcp_homepage", "https://cloud.google.com", "Google Cloud"),
            (
                "gcp_console",
                "https://console.cloud.google.com",
                "Google Cloud",
            ),
            // Vercel
            ("vercel_homepage", "https://vercel.com", "Vercel"),
            ("vercel_api", "https://api.vercel.com", "Vercel"),
            // Netlify
            ("netlify_homepage", "https://www.netlify.com", "Netlify"),
            ("netlify_api", "https://api.netlify.com", "Netlify"),
            // Railway
            ("railway_homepage", "https://railway.com", "Railway"),
            ("railway_api", "https://backboard.railway.app", "Railway"),
            // Render
            ("render_homepage", "https://render.com", "Render"),
            // Supabase
            ("supabase_homepage", "https://supabase.com", "Supabase"),
            ("supabase_api", "https://api.supabase.com", "Supabase"),
            // Firebase
            (
                "firebase_console",
                "https://firebase.google.com",
                "Firebase",
            ),
            (
                "firebase_apis",
                "https://firebase.googleapis.com",
                "Firebase",
            ),
            // MongoDB
            ("mongodb_homepage", "https://www.mongodb.com", "MongoDB"),
            ("mongodb_cloud", "https://cloud.mongodb.com", "MongoDB"),
            // Redis
            ("redis_homepage", "https://redis.io", "Redis"),
            // OpenAI
            ("openai_api", "https://api.openai.com", "OpenAI"),
            ("openai_chatgpt", "https://chatgpt.com", "OpenAI"),
            ("openai_platform", "https://platform.openai.com", "OpenAI"),
            // Anthropic
            ("anthropic_api", "https://api.anthropic.com", "Anthropic"),
            (
                "anthropic_console",
                "https://console.anthropic.com",
                "Anthropic",
            ),
            // Google AI
            (
                "google_ai_language",
                "https://generativelanguage.googleapis.com",
                "Google AI",
            ),
            (
                "google_ai_studio",
                "https://aistudio.google.com",
                "Google AI",
            ),
            // xAI
            ("xai_api", "https://api.x.ai", "xAI"),
            // Hugging Face
            (
                "huggingface_homepage",
                "https://huggingface.co",
                "Hugging Face",
            ),
            (
                "huggingface_api",
                "https://api-inference.huggingface.co",
                "Hugging Face",
            ),
            // Discord
            ("discord_homepage", "https://discord.com", "Discord"),
            ("discord_invite", "https://discord.gg", "Discord"),
            // Telegram
            ("telegram_api", "https://api.telegram.org", "Telegram"),
            ("telegram_core", "https://core.telegram.org", "Telegram"),
            // Slack
            ("slack_homepage", "https://slack.com", "Slack"),
            ("slack_api", "https://api.slack.com", "Slack"),
            // Figma
            ("figma_homepage", "https://www.figma.com", "Figma"),
            ("figma_api", "https://api.figma.com", "Figma"),
            // JetBrains
            (
                "jetbrains_plugins",
                "https://plugins.jetbrains.com",
                "JetBrains",
            ),
            (
                "jetbrains_account",
                "https://account.jetbrains.com",
                "JetBrains",
            ),
            // Visual Studio Code
            (
                "vscode_marketplace",
                "https://marketplace.visualstudio.com",
                "Visual Studio Code",
            ),
            (
                "vscode_update",
                "https://update.code.visualstudio.com",
                "Visual Studio Code",
            ),
            // JetBrains Marketplace
            (
                "jetbrains_marketplace",
                "https://plugins.jetbrains.com",
                "JetBrains Marketplace",
            ),
            // Homebrew
            ("brew_formulae", "https://formulae.brew.sh", "Homebrew"),
            // Chocolatey
            (
                "chocolatey_community",
                "https://community.chocolatey.org",
                "Chocolatey",
            ),
            // Winget
            ("winget_cdn", "https://cdn.winget.microsoft.com", "Winget"),
        ];

        default_domains
            .into_iter()
            .map(|(id, url, cat)| Target {
                id: id.to_string(),
                name: id.to_string(),
                url: url.to_string(),
                description: None,
                category: Some(cat.to_string()),
                group_ids: Vec::new(),
                tags: Vec::new(),
                enabled: true,
                network_profile_id: None,
                diagnostic_overrides: None,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            })
            .collect()
    }
}
