use super::http_probe::HttpProber;
use crate::config::ProbeConfig;
use crate::error::ProbeError;
use crate::models::{ProbeResult, ProbeStageResult, Target};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tokio::sync::Semaphore;

pub enum ProbeEvent {
    Started {
        run_id: String,
    },
    StageStarted {
        run_id: String,
        stage: String,
    },
    StageCompleted {
        run_id: String,
        stage: String,
        result: Box<ProbeStageResult>,
    },
    Completed {
        run_id: String,
        result: Box<ProbeResult>,
    },
}

pub struct ProbeEngine {
    prober: Arc<HttpProber>,
    concurrency_semaphore: Arc<Semaphore>,
}

impl ProbeEngine {
    pub fn new(config: ProbeConfig) -> Result<Self, ProbeError> {
        let concurrency_limit = config.concurrency_limit;
        let prober = Arc::new(HttpProber::new(config)?);
        let concurrency_semaphore = Arc::new(Semaphore::new(concurrency_limit));

        Ok(Self {
            prober,
            concurrency_semaphore,
        })
    }

    pub async fn probe_one(&self, target: &Target, cancel_flag: Arc<AtomicBool>) -> ProbeResult {
        let _permit = self.concurrency_semaphore.acquire().await;
        self.prober.probe(target, cancel_flag).await
    }

    pub async fn probe_one_with_events<F>(
        &self,
        target: &Target,
        cancel_flag: Arc<AtomicBool>,
        on_event: F,
    ) -> ProbeResult
    where
        F: Fn(ProbeEvent) + Send + Sync + 'static,
    {
        let _permit = self.concurrency_semaphore.acquire().await;

        let started_at = chrono::Utc::now();
        let run_id = format!("run-{}", started_at.timestamp_nanos_opt().unwrap_or(0));

        on_event(ProbeEvent::Started {
            run_id: run_id.clone(),
        });

        on_event(ProbeEvent::StageStarted {
            run_id: run_id.clone(),
            stage: "dns".to_string(),
        });
        let result = self.prober.probe(target, cancel_flag).await;

        if let Some(ref dns) = result.dns {
            on_event(ProbeEvent::StageCompleted {
                run_id: run_id.clone(),
                stage: "dns".to_string(),
                result: Box::new(dns.clone()),
            });
        }

        on_event(ProbeEvent::StageStarted {
            run_id: run_id.clone(),
            stage: "tcp".to_string(),
        });
        if let Some(ref tcp) = result.tcp {
            on_event(ProbeEvent::StageCompleted {
                run_id: run_id.clone(),
                stage: "tcp".to_string(),
                result: Box::new(tcp.clone()),
            });
        }

        if let Some(ref tls) = result.tls {
            on_event(ProbeEvent::StageStarted {
                run_id: run_id.clone(),
                stage: "tls".to_string(),
            });
            on_event(ProbeEvent::StageCompleted {
                run_id: run_id.clone(),
                stage: "tls".to_string(),
                result: Box::new(tls.clone()),
            });
        }

        if let Some(ref http) = result.http {
            on_event(ProbeEvent::StageStarted {
                run_id: run_id.clone(),
                stage: "http".to_string(),
            });
            on_event(ProbeEvent::StageCompleted {
                run_id: run_id.clone(),
                stage: "http".to_string(),
                result: Box::new(http.clone()),
            });
        }

        on_event(ProbeEvent::Completed {
            run_id: run_id.clone(),
            result: Box::new(result.clone()),
        });

        result
    }

    pub async fn probe_all<F>(
        &self,
        targets: Vec<Target>,
        cancel_flag: Arc<AtomicBool>,
        on_update: F,
    ) -> Vec<ProbeResult>
    where
        F: Fn(ProbeResult) + Send + Sync + 'static + Clone,
    {
        let mut tasks = Vec::new();
        for target in targets {
            let prober = self.prober.clone();
            let semaphore = self.concurrency_semaphore.clone();
            let on_update_clone = on_update.clone();
            let cancel_flag_clone = cancel_flag.clone();

            let task = tokio::spawn(async move {
                let _permit = semaphore.acquire().await;
                let result = prober.probe(&target, cancel_flag_clone).await;
                on_update_clone(result.clone());
                result
            });
            tasks.push(task);
        }

        let mut results = Vec::new();
        for task in tasks {
            if let Ok(res) = task.await {
                results.push(res);
            }
        }
        results
    }
}
