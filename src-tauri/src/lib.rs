pub mod app_state;
pub mod commands;
pub mod config;
pub mod error;
pub mod events;
pub mod intelligence;
pub mod monitoring;
pub mod performance;
pub mod privacy_diagnostics;
pub mod traceroute;

use app_state::AppState;
use commands::{
    acknowledge_incident, add_domain_to_targets, cancel_all_probes, cancel_investigation,
    cancel_probe, cancel_traceroute, check_for_updates, clear_network_operations,
    create_block_page_signature, create_investigation, create_monitoring_schedule,
    create_network_profile, create_target, create_target_group, delete_block_page_signature,
    delete_investigation, delete_monitoring_history, delete_monitoring_schedule,
    delete_network_profile, delete_target, delete_target_group, download_and_install_update,
    duplicate_monitoring_schedule, duplicate_target, get_analyzer_samples, get_analyzer_snapshot,
    get_continuous_monitor_history, get_continuous_monitor_status, get_daily_data_budget,
    get_domain_suggestions, get_history_summary, get_investigation, get_network_operation,
    get_network_profiles, get_privacy_expectation, get_scheduler_status, get_settings,
    get_target_groups, get_targets, get_update_state, list_block_page_signatures,
    list_continuous_monitors, list_incidents, list_investigations, list_monitoring_schedules,
    list_notifications, mark_all_notifications_as_read, mark_notification_as_read,
    pause_scheduled_monitoring, probe_all, probe_one, query_failed_requests,
    query_monitoring_history, query_network_operations, query_performance_history,
    query_privacy_assessments, record_webrtc_candidate, reset_application,
    resume_scheduled_monitoring, run_schedule_now, save_privacy_expectation, save_settings,
    set_default_network_profile, set_monitoring_schedule_enabled, set_target_enabled,
    start_analyzer, start_continuous_monitor, start_investigation, start_performance_run,
    start_privacy_assessment, start_traceroute, stop_analyzer, stop_continuous_monitor,
    toggle_target_pin, reorder_targets, update_block_page_signature,
    update_monitoring_schedule, update_network_profile, update_target, update_target_group,
};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState::init().unwrap_or_else(|e| {
        panic!("Failed to initialize AppState: {:?}", e);
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            println!(
                "INFO: Single instance triggered with args: {:?}, cwd: {}",
                args, cwd
            );
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(state)
        .setup(|app| {
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
            use tauri::tray::TrayIconBuilder;
            use tauri::Manager;

            // Migrate old configs if present
            crate::config::migrate_local_config_if_needed();

            let tx = monitoring::scheduler::SchedulerService::start(app.handle().clone());
            let state_handle = app.state::<AppState>();
            let mut wake_lock = state_handle.scheduler_wake_tx.lock().unwrap();
            *wake_lock = Some(tx);

            // Start network interface change observer
            let observer = monitoring::observer::NetworkChangeObserver::new();
            observer.start(app.handle().clone());

            // Configure System Tray
            let show_item = MenuItem::with_id(app, "show", "Show Main Window", true, None::<&str>)?;
            let compact_item =
                MenuItem::with_id(app, "compact", "Toggle Mini-Dashboard", true, None::<&str>)?;
            let quick_check =
                MenuItem::with_id(app, "quick_check", "Run Quick Check", true, None::<&str>)?;

            // Pause submenu
            let pause_15 =
                MenuItem::with_id(app, "pause_15", "Pause for 15 minutes", true, None::<&str>)?;
            let pause_60 =
                MenuItem::with_id(app, "pause_60", "Pause for 1 hour", true, None::<&str>)?;
            let pause_indefinite = MenuItem::with_id(
                app,
                "pause_indefinite",
                "Pause indefinitely",
                true,
                None::<&str>,
            )?;
            let resume_item =
                MenuItem::with_id(app, "resume", "Resume Monitoring", true, None::<&str>)?;

            let pause_menu_item = Submenu::with_id_and_items(
                app,
                "pause_menu",
                "Pause / Resume Monitoring",
                true,
                &[&pause_15, &pause_60, &pause_indefinite, &resume_item],
            )?;

            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;

            let tray_menu = Menu::with_items(
                app,
                &[
                    &show_item,
                    &compact_item,
                    &quick_check,
                    &PredefinedMenuItem::separator(app)?,
                    &pause_menu_item,
                    &separator,
                    &quit_item,
                ],
            )?;

            let tray_icon = app.default_window_icon().cloned();
            let mut tray_builder = TrayIconBuilder::new().menu(&tray_menu);
            if let Some(icon) = tray_icon {
                tray_builder = tray_builder.icon(icon);
            }

            let _tray = tray_builder
                .on_menu_event(|app, event| {
                    use std::sync::atomic::Ordering;
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        "compact" => {
                            if let Some(win) = app.get_webview_window("compact") {
                                if win.is_visible().unwrap_or(false) {
                                    let _ = win.hide();
                                } else {
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                }
                            }
                        }
                        "quick_check" => {
                            let app_clone = app.clone();
                            tauri::async_runtime::spawn(async move {
                                println!("INFO: Quick check triggered from tray.");
                                let state = app_clone.state::<AppState>();
                                let targets = state.targets.lock().unwrap().clone();
                                let engine = state.engine.lock().await;
                                let app_for_event = app_clone.clone();
                                let cancel_flag =
                                    std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
                                let _results = engine
                                    .probe_all(targets, cancel_flag, move |result| {
                                        crate::events::emit_probe_update(
                                            Some(&app_for_event),
                                            result,
                                        );
                                    })
                                    .await;
                                println!("INFO: Quick check completed.");
                            });
                        }
                        "pause_15" => {
                            let state = app.state::<AppState>();
                            state.monitoring_paused.store(true, Ordering::Relaxed);
                            let tx_opt = state.scheduler_wake_tx.lock().unwrap().clone();
                            if let Some(tx) = tx_opt {
                                let _ = tx.send(());
                            }
                            let app_clone = app.clone();
                            tauri::async_runtime::spawn(async move {
                                tokio::time::sleep(tokio::time::Duration::from_secs(15 * 60)).await;
                                let state = app_clone.state::<AppState>();
                                state.monitoring_paused.store(false, Ordering::Relaxed);
                                let tx_opt2 = state.scheduler_wake_tx.lock().unwrap().clone();
                                if let Some(tx2) = tx_opt2 {
                                    let _ = tx2.send(());
                                }
                                println!("INFO: Monitoring auto-resumed after 15m pause.");
                            });
                        }
                        "pause_60" => {
                            let state = app.state::<AppState>();
                            state.monitoring_paused.store(true, Ordering::Relaxed);
                            let tx_opt = state.scheduler_wake_tx.lock().unwrap().clone();
                            if let Some(tx) = tx_opt {
                                let _ = tx.send(());
                            }
                            let app_clone = app.clone();
                            tauri::async_runtime::spawn(async move {
                                tokio::time::sleep(tokio::time::Duration::from_secs(60 * 60)).await;
                                let state = app_clone.state::<AppState>();
                                state.monitoring_paused.store(false, Ordering::Relaxed);
                                let tx_opt2 = state.scheduler_wake_tx.lock().unwrap().clone();
                                if let Some(tx2) = tx_opt2 {
                                    let _ = tx2.send(());
                                }
                                println!("INFO: Monitoring auto-resumed after 1h pause.");
                            });
                        }
                        "pause_indefinite" => {
                            let state = app.state::<AppState>();
                            state.monitoring_paused.store(true, Ordering::Relaxed);
                            let tx_opt = state.scheduler_wake_tx.lock().unwrap().clone();
                            if let Some(tx) = tx_opt {
                                let _ = tx.send(());
                            }
                        }
                        "resume" => {
                            let state = app.state::<AppState>();
                            state.monitoring_paused.store(false, Ordering::Relaxed);
                            let tx_opt = state.scheduler_wake_tx.lock().unwrap().clone();
                            if let Some(tx) = tx_opt {
                                let _ = tx.send(());
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // Implement Close-to-Tray for main window
            if let Some(win) = app.get_webview_window("main") {
                let win_clone = win.clone();
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_targets,
            probe_all,
            probe_one,
            cancel_probe,
            cancel_all_probes,
            start_traceroute,
            cancel_traceroute,
            get_settings,
            save_settings,
            create_target,
            update_target,
            delete_target,
            duplicate_target,
            set_target_enabled,
            toggle_target_pin,
            reorder_targets,
            get_target_groups,
            create_target_group,
            update_target_group,
            delete_target_group,
            get_network_profiles,
            create_network_profile,
            update_network_profile,
            delete_network_profile,
            set_default_network_profile,
            list_monitoring_schedules,
            create_monitoring_schedule,
            update_monitoring_schedule,
            delete_monitoring_schedule,
            duplicate_monitoring_schedule,
            set_monitoring_schedule_enabled,
            run_schedule_now,
            pause_scheduled_monitoring,
            resume_scheduled_monitoring,
            get_scheduler_status,
            query_monitoring_history,
            get_history_summary,
            delete_monitoring_history,
            list_incidents,
            acknowledge_incident,
            list_notifications,
            mark_notification_as_read,
            mark_all_notifications_as_read,
            query_network_operations,
            get_network_operation,
            list_block_page_signatures,
            create_block_page_signature,
            update_block_page_signature,
            delete_block_page_signature,
            list_investigations,
            get_investigation,
            create_investigation,
            start_investigation,
            cancel_investigation,
            delete_investigation,
            start_performance_run,
            query_performance_history,
            get_daily_data_budget,
            start_privacy_assessment,
            query_privacy_assessments,
            get_privacy_expectation,
            save_privacy_expectation,
            record_webrtc_candidate,
            get_update_state,
            check_for_updates,
            download_and_install_update,
            get_analyzer_snapshot,
            start_analyzer,
            stop_analyzer,
            get_analyzer_samples,
            reset_application,
            clear_network_operations,
            query_failed_requests,
            get_domain_suggestions,
            add_domain_to_targets,
            start_continuous_monitor,
            stop_continuous_monitor,
            get_continuous_monitor_status,
            list_continuous_monitors,
            get_continuous_monitor_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
