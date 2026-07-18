use rusqlite::{params, Connection};
use uuid::Uuid;

pub struct DataBudgetManager;

impl DataBudgetManager {
    pub fn get_daily_usage(
        conn: &Connection,
        date_str: &str,
    ) -> Result<(u64, u64), rusqlite::Error> {
        let mut stmt = conn.prepare(
            "SELECT bytes_downloaded, bytes_uploaded FROM data_usage_ledger WHERE date_str = ?1",
        )?;
        let mut rows = stmt.query(params![date_str])?;

        if let Some(row) = rows.next()? {
            let dl: i64 = row.get(0)?;
            let ul: i64 = row.get(1)?;
            Ok((dl as u64, ul as u64))
        } else {
            Ok((0, 0))
        }
    }

    pub fn record_usage(
        conn: &Connection,
        date_str: &str,
        download_bytes: u64,
        upload_bytes: u64,
    ) -> Result<(), rusqlite::Error> {
        let (existing_dl, existing_ul) = Self::get_daily_usage(conn, date_str)?;
        let new_dl = existing_dl + download_bytes;
        let new_ul = existing_ul + upload_bytes;

        conn.execute(
            "INSERT INTO data_usage_ledger (id, date_str, bytes_downloaded, bytes_uploaded)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(date_str) DO UPDATE SET
                bytes_downloaded = excluded.bytes_downloaded,
                bytes_uploaded = excluded.bytes_uploaded",
            params![
                Uuid::new_v4().to_string(),
                date_str,
                new_dl as i64,
                new_ul as i64
            ],
        )?;

        Ok(())
    }

    pub fn check_budget_exceeded(
        conn: &Connection,
        date_str: &str,
        max_total_bytes: u64,
    ) -> Result<bool, rusqlite::Error> {
        let (dl, ul) = Self::get_daily_usage(conn, date_str)?;
        Ok((dl + ul) >= max_total_bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_data_budget() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE data_usage_ledger (
                id TEXT PRIMARY KEY,
                date_str TEXT NOT NULL,
                bytes_downloaded INTEGER NOT NULL,
                bytes_uploaded INTEGER NOT NULL
            );",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE UNIQUE INDEX idx_data_usage_date ON data_usage_ledger(date_str);",
            [],
        )
        .unwrap();

        let date_str = "2026-07-17";
        let (dl, ul) = DataBudgetManager::get_daily_usage(&conn, date_str).unwrap();
        assert_eq!(dl, 0);
        assert_eq!(ul, 0);

        DataBudgetManager::record_usage(&conn, date_str, 5000, 3000).unwrap();
        let (dl, ul) = DataBudgetManager::get_daily_usage(&conn, date_str).unwrap();
        assert_eq!(dl, 5000);
        assert_eq!(ul, 3000);

        assert!(!DataBudgetManager::check_budget_exceeded(&conn, date_str, 10000).unwrap());
        assert!(DataBudgetManager::check_budget_exceeded(&conn, date_str, 8000).unwrap());
    }
}
