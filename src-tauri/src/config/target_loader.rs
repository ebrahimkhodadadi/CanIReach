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
                        pinned: false,
                        sort_order: 0,
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
            // ── AI: Frontier LLM APIs ──
            ("ai_openai", "https://api.openai.com", "AI"),
            ("ai_openai_platform", "https://platform.openai.com", "AI"),
            ("ai_openai_chatgpt", "https://chatgpt.com", "AI"),
            ("ai_anthropic", "https://api.anthropic.com", "AI"),
            ("ai_anthropic_platform", "https://platform.claude.com", "AI"),
            ("ai_gemini", "https://generativelanguage.googleapis.com", "AI"),
            ("ai_gemini_studio", "https://aistudio.google.com", "AI"),
            ("ai_xai", "https://api.x.ai", "AI"),
            ("ai_xai_web", "https://x.ai", "AI"),
            ("ai_deepseek", "https://api.deepseek.com", "AI"),
            ("ai_deepseek_platform", "https://platform.deepseek.com", "AI"),
            ("ai_mistral", "https://api.mistral.ai", "AI"),
            ("ai_mistral_web", "https://mistral.ai", "AI"),
            ("ai_codestral", "https://codestral.mistral.ai", "AI"),
            ("ai_cohere", "https://api.cohere.com", "AI"),
            ("ai_cohere_web", "https://cohere.com", "AI"),
            ("ai_groq", "https://api.groq.com", "AI"),
            ("ai_groq_web", "https://groq.com", "AI"),
            ("ai_ai21", "https://api.ai21.com", "AI"),
            ("ai_ai21_web", "https://www.ai21.com", "AI"),
            ("ai_meta_llama", "https://api.llama.com", "AI"),
            ("ai_meta_llama_web", "https://llama.developer.meta.com", "AI"),
            ("ai_perplexity", "https://api.perplexity.ai", "AI"),
            ("ai_perplexity_web", "https://www.perplexity.ai", "AI"),
            ("ai_venice", "https://api.venice.ai", "AI"),
            ("ai_venice_web", "https://venice.ai", "AI"),
            ("ai_blackbox", "https://api.blackbox.ai", "AI"),
            ("ai_blackbox_web", "https://blackbox.ai", "AI"),
            ("ai_morph", "https://morphllm.com", "AI"),
            ("ai_liquid", "https://liquid.ai", "AI"),
            ("ai_reka", "https://api.reka.ai", "AI"),
            ("ai_upstage", "https://api.upstage.ai", "AI"),
            ("ai_upstage_web", "https://www.upstage.ai", "AI"),
            ("ai_maritalk", "https://www.maritaca.ai", "AI"),
            ("ai_nous_research", "https://inference-api.nousresearch.com", "AI"),
            ("ai_pioneer", "https://pioneer.ai", "AI"),
            ("ai_longcat", "https://longcat.chat", "AI"),
            // ── AI: Inference Hosts ──
            ("ai_together", "https://api.together.xyz", "AI"),
            ("ai_together_web", "https://www.together.ai", "AI"),
            ("ai_fireworks", "https://api.fireworks.ai", "AI"),
            ("ai_fireworks_web", "https://fireworks.ai", "AI"),
            ("ai_cerebras", "https://api.cerebras.ai", "AI"),
            ("ai_cerebras_web", "https://inference.cerebras.ai", "AI"),
            ("ai_nvidia", "https://integrate.api.nvidia.com", "AI"),
            ("ai_nvidia_web", "https://build.nvidia.com", "AI"),
            ("ai_nebius", "https://api.nebius.com", "AI"),
            ("ai_nebius_web", "https://nebius.com", "AI"),
            ("ai_siliconflow", "https://api.siliconflow.com", "AI"),
            ("ai_siliconflow_web", "https://cloud.siliconflow.com", "AI"),
            ("ai_deepinfra", "https://api.deepinfra.com", "AI"),
            ("ai_deepinfra_web", "https://deepinfra.com", "AI"),
            ("ai_lambda", "https://api.lambda.ai", "AI"),
            ("ai_lambda_web", "https://lambda.ai", "AI"),
            ("ai_sambanova", "https://api.sambanova.ai", "AI"),
            ("ai_sambanova_web", "https://sambanova.ai", "AI"),
            ("ai_hyperbolic", "https://api.hyperbolic.xyz", "AI"),
            ("ai_hyperbolic_web", "https://hyperbolic.xyz", "AI"),
            ("ai_featherless", "https://api.featherless.ai", "AI"),
            ("ai_featherless_web", "https://featherless.ai", "AI"),
            ("ai_friendli", "https://api.friendli.ai", "AI"),
            ("ai_friendli_web", "https://friendli.ai", "AI"),
            ("ai_baseten", "https://inference.baseten.co", "AI"),
            ("ai_baseten_web", "https://baseten.co", "AI"),
            ("ai_nscale", "https://nscale.com", "AI"),
            ("ai_bytez", "https://api.bytez.com", "AI"),
            ("ai_bytez_web", "https://bytez.com", "AI"),
            ("ai_monsterapi", "https://monsterapi.ai", "AI"),
            ("ai_modelscope", "https://modelscope.cn", "AI"),
            ("ai_byteplus", "https://ark.ap-southeast.bytepluses.com", "AI"),
            ("ai_byteplus_web", "https://console.byteplus.com", "AI"),
            ("ai_digitalocean", "https://inference.do-ai.run", "AI"),
            ("ai_publicai", "https://api.publicai.co", "AI"),
            ("ai_publicai_web", "https://publicai.co", "AI"),
            ("ai_inferencenet", "https://inference.net", "AI"),
            ("ai_wandb", "https://api.inference.wandb.ai", "AI"),
            ("ai_wandb_web", "https://wandb.ai", "AI"),
            ("ai_nube", "https://nube.sh", "AI"),
            ("ai_ollama_cloud", "https://ollama.com", "AI"),
            ("ai_liquid_inference", "https://inference.liquid.ai", "AI"),
            ("ai_scaleway", "https://api.scaleway.ai", "AI"),
            ("ai_scaleway_web", "https://www.scaleway.com", "AI"),
            ("ai_ovhcloud", "https://www.ovhcloud.com", "AI"),
            ("ai_modal", "https://modal.com", "AI"),
            ("ai_segmind", "https://api.segmind.com", "AI"),
            ("ai_segmind_web", "https://segmind.com", "AI"),
            // ── AI: Gateways / Aggregators ──
            ("ai_openrouter", "https://openrouter.ai", "AI"),
            ("ai_aimlapi", "https://api.aimlapi.com", "AI"),
            ("ai_aimlapi_web", "https://aimlapi.com", "AI"),
            ("ai_novita", "https://api.novita.ai", "AI"),
            ("ai_novita_web", "https://novita.ai", "AI"),
            ("ai_requesty", "https://router.requesty.ai", "AI"),
            ("ai_requesty_web", "https://requesty.ai", "AI"),
            ("ai_tokenrouter", "https://api.tokenrouter.com", "AI"),
            ("ai_tokenrouter_web", "https://tokenrouter.com", "AI"),
            ("ai_puter", "https://api.puter.com", "AI"),
            ("ai_puter_web", "https://puter.com", "AI"),
            ("ai_aihorde", "https://aihorde.net", "AI"),
            ("ai_huggingface", "https://huggingface.co", "AI"),
            ("ai_huggingface_router", "https://router.huggingface.co", "AI"),
            ("ai_huggingchat", "https://huggingface.co", "AI"),
            ("ai_airforce", "https://api.airforce", "AI"),
            ("ai_charm_hyper", "https://hyper.charm.land", "AI"),
            ("ai_agentrouter", "https://agentrouter.org", "AI"),
            ("ai_command_code", "https://api.commandcode.ai", "AI"),
            ("ai_command_code_web", "https://commandcode.ai", "AI"),
            ("ai_dgrid", "https://api.dgrid.ai", "AI"),
            ("ai_dgrid_web", "https://dgrid.ai", "AI"),
            ("ai_qiniu", "https://api.qnaigc.com", "AI"),
            ("ai_qiniu_web", "https://www.qiniu.com", "AI"),
            ("ai_orcarouter", "https://api.orcarouter.ai", "AI"),
            ("ai_orcarouter_web", "https://www.orcarouter.ai", "AI"),
            ("ai_crof", "https://crof.ai", "AI"),
            ("ai_bazaarlink", "https://bazaarlink.ai", "AI"),
            ("ai_synthetic", "https://synthetic.new", "AI"),
            ("ai_kilo_gateway", "https://api.kilo.ai", "AI"),
            ("ai_kilo_web", "https://kilo.ai", "AI"),
            ("ai_wafer", "https://pass.wafer.ai", "AI"),
            ("ai_wafer_web", "https://wafer.ai", "AI"),
            ("ai_dahl", "https://inference.dahl.global", "AI"),
            ("ai_uncloseai", "https://hermes.ai.unturf.com", "AI"),
            ("ai_uncloseai_web", "https://uncloseai.com", "AI"),
            ("ai_hackclub", "https://ai.hackclub.com", "AI"),
            ("ai_freetheai", "https://api.freetheai.xyz", "AI"),
            ("ai_freetheai_web", "https://freetheai.xyz", "AI"),
            ("ai_g4f_space", "https://g4f.space", "AI"),
            ("ai_vercel_gateway", "https://ai-gateway.vercel.sh", "AI"),
            ("ai_llm7", "https://api.llm7.io", "AI"),
            ("ai_llm7_web", "https://llm7.io", "AI"),
            ("ai_llamagate", "https://llamagate.ai", "AI"),
            ("ai_gitlawb", "https://opengateway.gitlawb.com", "AI"),
            ("ai_nanogpt", "https://nano-gpt.com", "AI"),
            ("ai_chutes", "https://llm.chutes.ai", "AI"),
            ("ai_chutes_web", "https://chutes.ai", "AI"),
            ("ai_factory", "https://api.factory.ai", "AI"),
            ("ai_factory_web", "https://factory.ai", "AI"),
            ("ai_bluesminds", "https://api.bluesminds.com", "AI"),
            ("ai_bluesminds_web", "https://www.bluesminds.com", "AI"),
            ("ai_freemodel", "https://freemodel.dev", "AI"),
            ("ai_freeaiapikey", "https://freeaiapikey.com", "AI"),
            ("ai_zenmux", "https://zenmux.ai", "AI"),
            ("ai_openadapter", "https://api.openadapter.in", "AI"),
            ("ai_openadapter_web", "https://openadapter.dev", "AI"),
            ("ai_dit", "https://api.dit.ai", "AI"),
            ("ai_dit_web", "https://dit.ai", "AI"),
            ("ai_chenzk", "https://chenzk.top", "AI"),
            ("ai_kenari", "https://kenari.id", "AI"),
            ("ai_navy", "https://api.navy", "AI"),
            ("ai_longcat_api", "https://api.longcat.chat", "AI"),
            ("ai_sumopod", "https://ai.sumopod.com", "AI"),
            ("ai_x5lab", "https://api.x5lab.dev", "AI"),
            ("ai_x5lab_web", "https://x5lab.dev", "AI"),
            ("ai_bai", "https://api.b.ai", "AI"),
            ("ai_bai_web", "https://b.ai", "AI"),
            ("ai_lmarena", "https://arena.ai", "AI"),
            ("ai_openvecta", "https://openvecta.com", "AI"),
            ("ai_poe", "https://api.poe.com", "AI"),
            ("ai_poe_web", "https://poe.com", "AI"),
            ("ai_fenayai", "https://fenayai.com", "AI"),
            ("ai_empower", "https://app.empower.dev", "AI"),
            ("ai_piapi", "https://piapi.ai", "AI"),
            ("ai_getgoapi", "https://api.getgoapi.com", "AI"),
            ("ai_laozhang", "https://api.laozhang.ai", "AI"),
            ("ai_thebai", "https://theb.ai", "AI"),
            // ── AI: Regional / Chinese Providers ──
            ("ai_alibaba", "https://dashscope-intl.aliyuncs.com", "AI"),
            ("ai_alibaba_web", "https://bailian.console.alibabacloud.com", "AI"),
            ("ai_baidu", "https://qianfan.baidubce.com", "AI"),
            ("ai_baidu_web", "https://yiyan.baidu.com", "AI"),
            ("ai_tencent", "https://api.hunyuan.cloud.tencent.com", "AI"),
            ("ai_tencent_web", "https://hunyuan.tencent.com", "AI"),
            ("ai_stepfun", "https://api.stepfun.com", "AI"),
            ("ai_stepfun_web", "https://stepfun.com", "AI"),
            ("ai_moonshot", "https://api.moonshot.ai", "AI"),
            ("ai_moonshot_web", "https://platform.moonshot.ai", "AI"),
            ("ai_kimi", "https://api.moonshot.ai", "AI"),
            ("ai_kimi_web", "https://www.kimi.com", "AI"),
            ("ai_minimax", "https://api.minimax.io", "AI"),
            ("ai_minimax_web", "https://www.minimax.io", "AI"),
            ("ai_baichuan", "https://api.baichuan-ai.com", "AI"),
            ("ai_baichuan_web", "https://baichuan.com", "AI"),
            ("ai_yi", "https://api.lingyiwanwu.com", "AI"),
            ("ai_yi_web", "https://01.ai", "AI"),
            ("ai_xiaomi_mimo", "https://api.xiaomimimo.com", "AI"),
            ("ai_xiaomi_mimo_web", "https://mimo.mi.com", "AI"),
            ("ai_volcengine", "https://ark.cn-beijing.volces.com", "AI"),
            ("ai_volcengine_web", "https://www.volcengine.com", "AI"),
            ("ai_doubao", "https://doubao.com", "AI"),
            ("ai_glm", "https://api.z.ai", "AI"),
            ("ai_glm_web", "https://z.ai", "AI"),
            ("ai_glm_cn", "https://open.bigmodel.cn", "AI"),
            ("ai_iflytek", "https://spark-api.xf-yun.com", "AI"),
            ("ai_iflytek_web", "https://xinghuo.xfyun.cn", "AI"),
            ("ai_sensenova", "https://token.sensenova.cn", "AI"),
            ("ai_sensenova_web", "https://platform.sensenova.cn", "AI"),
            ("ai_360ai", "https://ai.360.cn", "AI"),
            ("ai_gigachat", "https://gigachat.devices.sberbank.ru", "AI"),
            ("ai_gigachat_web", "https://developers.sber.ru", "AI"),
            ("ai_hcnsec", "https://api.hcnsec.cn", "AI"),
            ("ai_agnes", "https://apihub.agnes-ai.com", "AI"),
            ("ai_agnes_web", "https://agnes-ai.com", "AI"),
            ("ai_coze", "https://api.coze.com", "AI"),
            ("ai_coze_web", "https://coze.com", "AI"),
            ("ai_yuanbao", "https://yuanbao.tencent.com", "AI"),
            ("ai_qianfan_web", "https://cloud.baidu.com", "AI"),
            // ── AI: Enterprise Cloud ──
            ("ai_azure_openai", "https://api.openai.azure.com", "AI"),
            ("ai_azure_ai", "https://ai.azure.com", "AI"),
            ("ai_azure_web", "https://azure.microsoft.com", "AI"),
            ("ai_bedrock", "https://bedrock-runtime.us-east-1.amazonaws.com", "AI"),
            ("ai_bedrock_web", "https://aws.amazon.com/bedrock", "AI"),
            ("ai_vertex", "https://us-central1-aiplatform.googleapis.com", "AI"),
            ("ai_vertex_web", "https://cloud.google.com/vertex-ai", "AI"),
            ("ai_vertex_partner", "https://cloud.google.com/vertex-ai", "AI"),
            ("ai_snowflake", "https://www.snowflake.com", "AI"),
            ("ai_sap", "https://www.sap.com", "AI"),
            ("ai_databricks", "https://www.databricks.com", "AI"),
            ("ai_clarifai", "https://api.clarifai.com", "AI"),
            ("ai_clarifai_web", "https://docs.clarifai.com", "AI"),
            ("ai_datrobot", "https://docs.datarobot.com", "AI"),
            ("ai_oci", "https://www.oracle.com/artificial-intelligence/generative-ai", "AI"),
            ("ai_heroku", "https://www.heroku.com", "AI"),
            ("ai_cloudflare_ai", "https://developers.cloudflare.com/workers-ai", "AI"),
            // ── AI: Code AI Assistants ──
            ("ai_github_copilot", "https://api.githubcopilot.com", "AI"),
            ("ai_github_models", "https://github.com/marketplace/models", "AI"),
            ("ai_cursor", "https://api2.cursor.sh", "AI"),
            ("ai_cursor_web", "https://cursor.com", "AI"),
            ("ai_windsurf", "https://codeium.com", "AI"),
            ("ai_windsurf_server", "https://server.self-serve.windsurf.com", "AI"),
            ("ai_cline", "https://api.cline.bot", "AI"),
            ("ai_zed", "https://cloud.zed.dev", "AI"),
            ("ai_zed_web", "https://zed.dev", "AI"),
            ("ai_kiro", "https://codewhisperer.us-east-1.amazonaws.com", "AI"),
            ("ai_kiro_web", "https://kiro.dev", "AI"),
            ("ai_tabnine", "https://api.tabnine.com", "AI"),
            ("ai_tabnine_web", "https://www.tabnine.com", "AI"),
            ("ai_sourcegraph", "https://sourcegraph.com", "AI"),
            ("ai_gitlab_duo", "https://gitlab.com", "AI"),
            ("ai_ghe_copilot", "https://api.githubcopilot.com", "AI"),
            // ── AI: Image, Video & Media Generation ──
            ("ai_stability", "https://stability.ai", "AI"),
            ("ai_stability_api", "https://api.stability.ai", "AI"),
            ("ai_ideogram", "https://ideogram.ai", "AI"),
            ("ai_ideogram_api", "https://api.ideogram.ai", "AI"),
            ("ai_freepik", "https://freepik.com", "AI"),
            ("ai_haiper", "https://haiper.ai", "AI"),
            ("ai_haiper_api", "https://api.haiper.ai", "AI"),
            ("ai_leonardo", "https://leonardo.ai", "AI"),
            ("ai_leonardo_api", "https://cloud.leonardo.ai", "AI"),
            ("ai_fal", "https://fal.ai", "AI"),
            ("ai_fal_api", "https://api.fal.ai", "AI"),
            ("ai_blackforest", "https://blackforestlabs.ai", "AI"),
            ("ai_recraft", "https://recraft.ai", "AI"),
            ("ai_topaz", "https://topazlabs.com", "AI"),
            ("ai_suno", "https://suno.ai", "AI"),
            ("ai_udio", "https://udio.com", "AI"),
            ("ai_runway", "https://api.dev.runwayml.com", "AI"),
            ("ai_runway_web", "https://runwayml.com", "AI"),
            // ── AI: Audio Providers ──
            ("ai_deepgram", "https://deepgram.com", "AI"),
            ("ai_assemblyai", "https://assemblyai.com", "AI"),
            ("ai_elevenlabs", "https://elevenlabs.io", "AI"),
            ("ai_cartesia", "https://cartesia.ai", "AI"),
            ("ai_playht", "https://play.ht", "AI"),
            ("ai_inworld", "https://inworld.ai", "AI"),
            ("ai_gladia", "https://gladia.io", "AI"),
            ("ai_speechmatics", "https://www.speechmatics.com", "AI"),
            // ── AI: Embeddings & Search ──
            ("ai_voyage", "https://www.voyageai.com", "AI"),
            ("ai_jina", "https://jina.ai", "AI"),
            ("ai_jina_reader", "https://jina.ai/reader", "AI"),
            ("ai_nomic", "https://nomic.ai", "AI"),
            ("ai_mixedbread", "https://www.mixedbread.com", "AI"),
            ("ai_serper", "https://serper.dev", "AI"),
            ("ai_brave_search", "https://brave.com/search/api", "AI"),
            ("ai_exa", "https://exa.ai", "AI"),
            ("ai_tavily", "https://tavily.com", "AI"),
            ("ai_firecrawl", "https://firecrawl.dev", "AI"),
            ("ai_linkup", "https://docs.linkup.so", "AI"),
            ("ai_searchapi", "https://www.searchapi.io", "AI"),
            ("ai_nlpcloud", "https://api.nlpcloud.io", "AI"),
            ("ai_nlpcloud_web", "https://docs.nlpcloud.com", "AI"),
            // ── AI: Web AI Services ──
            ("ai_microsoft_copilot", "https://copilot.microsoft.com", "AI"),
            ("ai_duckduckgo_ai", "https://duckduckgo.com", "AI"),
            ("ai_grok_web", "https://grok.com", "AI"),
            ("ai_grok_cli", "https://cli-chat-proxy.grok.com", "AI"),
            ("ai_meta_ai", "https://www.meta.ai", "AI"),
            ("ai_felo", "https://felo.ai", "AI"),
            ("ai_t3", "https://t3.chat", "AI"),
            ("ai_v0", "https://v0.dev", "AI"),
            ("ai_opencode", "https://opencode.ai", "AI"),
            ("ai_chatgpt_web", "https://chatgpt.com", "AI"),
            ("ai_deepseek_web", "https://chat.deepseek.com", "AI"),
            ("ai_grok_web2", "https://x.com/i/grok", "AI"),
            ("ai_gemini_web", "https://gemini.google.com", "AI"),
            ("ai_claude_web", "https://claude.ai", "AI"),
            ("ai_doubao_web", "https://www.doubao.com", "AI"),
            ("ai_zai_web", "https://chat.z.ai", "AI"),
            ("ai_muse_spark", "https://www.meta.ai", "AI"),
            // ── AI: Specialized / Misc ──
            ("ai_kie", "https://kie.ai", "AI"),
            ("ai_pollinations", "https://pollinations.ai", "AI"),
            ("ai_dify", "https://dify.ai", "AI"),
            ("ai_reka_web", "https://reka.ai", "AI"),
            ("ai_databricks_api", "https://www.databricks.com", "AI"),
            ("ai_apify", "https://apify.com", "AI"),
            ("ai_pioneer_web", "https://agent.pioneer.ai", "AI"),
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
                pinned: false,
                sort_order: 0,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            })
            .collect()
    }
}
