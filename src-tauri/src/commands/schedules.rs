use crate::app_state::AppState;
use crate::config::SchedulesLoader;
use crate::error::AppError;
use crate::monitoring::models::schedule::MonitoringSchedule;
use std::sync::atomic::Ordering;
use tauri::State;

#[tauri::command]
pub fn list_monitoring_schedules() -> Result<Vec<MonitoringSchedule>, AppError> {
    SchedulesLoader::load()
}

#[tauri::command]
pub fn create_monitoring_schedule(
    state: State<'_, AppState>,
    mut schedule: MonitoringSchedule,
) -> Result<Vec<MonitoringSchedule>, AppError> {
    if schedule.name.trim().is_empty() {
        return Err(AppError::Generic(
            "Schedule name cannot be empty".to_string(),
        ));
    }

    let mut schedules = SchedulesLoader::load()?;
    if schedules.iter().any(|s| s.id == schedule.id) {
        return Err(AppError::Generic(
            "Schedule with this ID already exists".to_string(),
        ));
    }

    schedule.created_at = chrono::Utc::now().to_rfc3339();
    schedule.updated_at = chrono::Utc::now().to_rfc3339();
    schedule.next_run_at = schedule
        .calculate_next_run(chrono::Utc::now())
        .map(|t| t.to_rfc3339());

    schedules.push(schedule);
    SchedulesLoader::save(&schedules)?;

    // Wake up scheduler background task to recalculate timings
    if let Some(ref tx) = *state.scheduler_wake_tx.lock().unwrap() {
        let _ = tx.send(());
    }

    Ok(schedules)
}

#[tauri::command]
pub fn update_monitoring_schedule(
    state: State<'_, AppState>,
    mut schedule: MonitoringSchedule,
) -> Result<Vec<MonitoringSchedule>, AppError> {
    if schedule.name.trim().is_empty() {
        return Err(AppError::Generic(
            "Schedule name cannot be empty".to_string(),
        ));
    }

    let mut schedules = SchedulesLoader::load()?;
    let index = schedules
        .iter()
        .position(|s| s.id == schedule.id)
        .ok_or_else(|| AppError::Generic("Schedule not found".to_string()))?;

    schedule.updated_at = chrono::Utc::now().to_rfc3339();
    schedule.next_run_at = schedule
        .calculate_next_run(chrono::Utc::now())
        .map(|t| t.to_rfc3339());

    schedules[index] = schedule;
    SchedulesLoader::save(&schedules)?;

    // Wake up scheduler background task to recalculate timings
    if let Some(ref tx) = *state.scheduler_wake_tx.lock().unwrap() {
        let _ = tx.send(());
    }

    Ok(schedules)
}

#[tauri::command]
pub fn delete_monitoring_schedule(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<MonitoringSchedule>, AppError> {
    let mut schedules = SchedulesLoader::load()?;
    let index = schedules
        .iter()
        .position(|s| s.id == id)
        .ok_or_else(|| AppError::Generic("Schedule not found".to_string()))?;

    schedules.remove(index);
    SchedulesLoader::save(&schedules)?;

    // Wake up scheduler background task to recalculate timings
    if let Some(ref tx) = *state.scheduler_wake_tx.lock().unwrap() {
        let _ = tx.send(());
    }

    Ok(schedules)
}

#[tauri::command]
pub fn duplicate_monitoring_schedule(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<MonitoringSchedule>, AppError> {
    let mut schedules = SchedulesLoader::load()?;
    let schedule_to_copy = schedules
        .iter()
        .find(|s| s.id == id)
        .ok_or_else(|| AppError::Generic("Schedule not found".to_string()))?
        .clone();

    let mut new_schedule = schedule_to_copy;
    new_schedule.id = format!(
        "{}-copy-{}",
        new_schedule.id,
        chrono::Utc::now().timestamp()
    );
    new_schedule.name = format!("{} (Copy)", new_schedule.name);
    new_schedule.created_at = chrono::Utc::now().to_rfc3339();
    new_schedule.updated_at = chrono::Utc::now().to_rfc3339();
    new_schedule.next_run_at = new_schedule
        .calculate_next_run(chrono::Utc::now())
        .map(|t| t.to_rfc3339());

    schedules.push(new_schedule);
    SchedulesLoader::save(&schedules)?;

    // Wake up scheduler background task to recalculate timings
    if let Some(ref tx) = *state.scheduler_wake_tx.lock().unwrap() {
        let _ = tx.send(());
    }

    Ok(schedules)
}

#[tauri::command]
pub fn set_monitoring_schedule_enabled(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<Vec<MonitoringSchedule>, AppError> {
    let mut schedules = SchedulesLoader::load()?;
    let index = schedules
        .iter()
        .position(|s| s.id == id)
        .ok_or_else(|| AppError::Generic("Schedule not found".to_string()))?;

    schedules[index].enabled = enabled;
    schedules[index].updated_at = chrono::Utc::now().to_rfc3339();
    schedules[index].next_run_at = schedules[index]
        .calculate_next_run(chrono::Utc::now())
        .map(|t| t.to_rfc3339());

    SchedulesLoader::save(&schedules)?;

    // Wake up scheduler background task to recalculate timings
    if let Some(ref tx) = *state.scheduler_wake_tx.lock().unwrap() {
        let _ = tx.send(());
    }

    Ok(schedules)
}

#[tauri::command]
pub fn run_schedule_now(app: tauri::AppHandle, id: String) -> Result<(), AppError> {
    let schedules = SchedulesLoader::load()?;
    let schedule = schedules
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| AppError::Generic("Schedule not found".to_string()))?;

    tokio::spawn(async move {
        let _ =
            crate::monitoring::scheduler::SchedulerService::execute_schedule(Some(app), schedule)
                .await;
    });
    Ok(())
}

#[tauri::command]
pub fn pause_scheduled_monitoring(state: State<'_, AppState>) -> Result<(), AppError> {
    state.monitoring_paused.store(true, Ordering::Relaxed);
    if let Some(ref tx) = *state.scheduler_wake_tx.lock().unwrap() {
        let _ = tx.send(());
    }
    Ok(())
}

#[tauri::command]
pub fn resume_scheduled_monitoring(state: State<'_, AppState>) -> Result<(), AppError> {
    state.monitoring_paused.store(false, Ordering::Relaxed);
    if let Some(ref tx) = *state.scheduler_wake_tx.lock().unwrap() {
        let _ = tx.send(());
    }
    Ok(())
}

#[tauri::command]
pub fn get_scheduler_status(state: State<'_, AppState>) -> Result<serde_json::Value, AppError> {
    Ok(serde_json::json!({
        "paused": state.monitoring_paused.load(Ordering::Relaxed)
    }))
}
