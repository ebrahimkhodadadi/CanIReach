use std::net::UdpSocket;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::time::sleep;

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ObserverCapabilities {
    pub is_supported: bool,
    pub requires_elevation: bool,
    pub is_elevated: bool,
}

pub struct SystemConnectionObserver {
    active: Arc<AtomicBool>,
}

impl Default for SystemConnectionObserver {
    fn default() -> Self {
        Self::new()
    }
}

impl SystemConnectionObserver {
    pub fn new() -> Self {
        Self {
            active: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn capabilities(&self) -> ObserverCapabilities {
        #[cfg(target_os = "windows")]
        {
            ObserverCapabilities {
                is_supported: true,
                requires_elevation: true,
                is_elevated: false,
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            ObserverCapabilities {
                is_supported: false,
                requires_elevation: true,
                is_elevated: false,
            }
        }
    }

    pub fn start(&self, _app: AppHandle) {
        self.active.store(true, Ordering::SeqCst);
        println!("INFO: System Connection Observer started (User level best-effort).");
    }

    pub fn stop(&self) {
        self.active.store(false, Ordering::SeqCst);
        println!("INFO: System Connection Observer stopped.");
    }
}

impl Default for NetworkChangeObserver {
    fn default() -> Self {
        Self::new()
    }
}

pub struct NetworkChangeObserver {
    active: Arc<AtomicBool>,
}

impl NetworkChangeObserver {
    pub fn new() -> Self {
        Self {
            active: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(&self, app: AppHandle) {
        if self.active.swap(true, Ordering::SeqCst) {
            return;
        }

        let active = self.active.clone();
        tauri::async_runtime::spawn(async move {
            println!("INFO: Network Change Observer loop started.");
            let mut last_local_ip = Self::get_current_local_ip();

            while active.load(Ordering::SeqCst) {
                sleep(Duration::from_secs(3)).await;

                let current_ip = Self::get_current_local_ip();
                if current_ip != last_local_ip {
                    println!(
                        "INFO: Network change detected. Old local IP: {:?}, New local IP: {:?}",
                        last_local_ip, current_ip
                    );
                    last_local_ip = current_ip;

                    let _ = app.emit("network-change-detected", ());
                }
            }
            println!("INFO: Network Change Observer loop stopped.");
        });
    }

    pub fn stop(&self) {
        self.active.store(false, Ordering::SeqCst);
    }

    fn get_current_local_ip() -> Option<String> {
        let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
        socket.connect("8.8.8.8:80").ok()?;
        socket.local_addr().ok().map(|addr| addr.ip().to_string())
    }
}
