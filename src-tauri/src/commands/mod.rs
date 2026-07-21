pub mod continuous_monitor;
pub mod groups;
pub mod history;
pub mod probes;
pub mod profiles;
pub mod schedules;
pub mod settings;
pub mod targets;
pub mod traceroute;

pub mod analyzer;
pub mod block_page;
pub mod operations;
pub mod updater;

pub use analyzer::{get_analyzer_samples, get_analyzer_snapshot, start_analyzer, stop_analyzer};
pub use continuous_monitor::{
    get_continuous_monitor_history, get_continuous_monitor_status, list_continuous_monitors,
    start_continuous_monitor, stop_continuous_monitor,
};
pub use updater::{check_for_updates, download_and_install_update, get_update_state};

pub use groups::{
    create_target_group, delete_target_group, get_target_groups, update_target_group,
};
pub use history::{
    acknowledge_incident, delete_monitoring_history, get_history_summary, list_incidents,
    list_notifications, mark_all_notifications_as_read, mark_notification_as_read,
    query_monitoring_history,
};
pub use probes::{cancel_all_probes, cancel_probe, probe_all, probe_by_category, probe_one};
pub mod investigation;

pub use block_page::{
    create_block_page_signature, delete_block_page_signature, list_block_page_signatures,
    update_block_page_signature,
};
pub use investigation::{
    cancel_investigation, create_investigation, delete_investigation, get_investigation,
    list_investigations, start_investigation,
};
pub use operations::{add_domain_to_targets, clear_network_operations, get_domain_suggestions, get_network_operation, query_failed_requests, query_network_operations};
pub use profiles::{
    create_network_profile, delete_network_profile, get_network_profiles,
    set_default_network_profile, update_network_profile,
};
pub use schedules::{
    create_monitoring_schedule, delete_monitoring_schedule, duplicate_monitoring_schedule,
    get_scheduler_status, list_monitoring_schedules, pause_scheduled_monitoring,
    resume_scheduled_monitoring, run_schedule_now, set_monitoring_schedule_enabled,
    update_monitoring_schedule,
};
pub use settings::{get_settings, reset_application, save_settings};
pub use targets::{
    create_target, delete_target, duplicate_target, get_targets, reorder_targets,
    set_target_enabled, toggle_target_pin, update_target,
};
pub use traceroute::{cancel_traceroute, start_traceroute};

pub mod performance_commands;
pub mod privacy_commands;

pub use performance_commands::{
    get_daily_data_budget, query_performance_history, start_performance_run,
};
pub use privacy_commands::{
    get_privacy_expectation, query_privacy_assessments, record_webrtc_candidate,
    save_privacy_expectation, start_privacy_assessment,
};
