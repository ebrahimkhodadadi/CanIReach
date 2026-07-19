use rusqlite::{Connection, Result};

pub struct DbManager;

impl DbManager {
    pub fn get_connection() -> Result<Connection, rusqlite::Error> {
        let db_path = crate::config::get_db_path();

        let conn = Connection::open(&db_path)?;

        // Set busy timeout to prevent write lock collisions
        conn.busy_timeout(std::time::Duration::from_secs(5))?;

        // Enable foreign keys and WAL mode
        conn.execute("PRAGMA foreign_keys = ON;", [])?;
        let _ = conn.pragma_update(None, "journal_mode", "WAL");

        Self::run_migrations(&conn)?;
        let _ = Self::recover_abandoned_batches(&conn);

        Ok(conn)
    }

    fn recover_abandoned_batches(conn: &Connection) -> Result<(), rusqlite::Error> {
        let count = conn.execute(
            "UPDATE batches SET status = 'interrupted' WHERE status = 'running';",
            [],
        )?;
        if count > 0 {
            println!(
                "INFO: Crash recovery completed. Marked {} abandoned batches as 'interrupted'.",
                count
            );
        }
        Ok(())
    }

    fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
        // Create batches table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS batches (
                id TEXT PRIMARY KEY,
                schedule_id TEXT,
                status TEXT NOT NULL,
                target_count INTEGER NOT NULL,
                completed_count INTEGER NOT NULL,
                passed_count INTEGER NOT NULL,
                failed_count INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                duration_ms INTEGER
            );",
            [],
        )?;

        // Create target_runs table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS target_runs (
                id TEXT PRIMARY KEY,
                batch_id TEXT NOT NULL,
                target_id TEXT NOT NULL,
                status TEXT NOT NULL,
                latency_ms INTEGER,
                http_status INTEGER,
                profile_id TEXT NOT NULL,
                primary_failure_code TEXT,
                technical_evidence TEXT,
                started_at TEXT NOT NULL,
                FOREIGN KEY(batch_id) REFERENCES batches(id) ON DELETE CASCADE
            );",
            [],
        )?;

        // Create incidents table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY,
                target_id TEXT NOT NULL,
                profile_id TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                resolved_at TEXT,
                acknowledged_at TEXT,
                consecutive_failures INTEGER NOT NULL,
                last_observed_at TEXT NOT NULL,
                title TEXT NOT NULL,
                summary TEXT NOT NULL
            );",
            [],
        )?;

        // Create alert_deliveries table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS alert_deliveries (
                id TEXT PRIMARY KEY,
                incident_id TEXT NOT NULL,
                rule_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(incident_id) REFERENCES incidents(id) ON DELETE CASCADE
            );",
            [],
        )?;

        // Create notifications table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                severity TEXT NOT NULL,
                created_at TEXT NOT NULL,
                read_at TEXT,
                title TEXT NOT NULL,
                summary TEXT NOT NULL,
                target_id TEXT,
                profile_id TEXT,
                run_id TEXT,
                incident_id TEXT,
                problem_id TEXT,
                delivery_state TEXT NOT NULL,
                deduplication_key TEXT UNIQUE
            );",
            [],
        )?;

        // Create analyzer_samples table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS analyzer_samples (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                latency_ms REAL NOT NULL,
                jitter_ms REAL NOT NULL,
                dns_latency_ms REAL NOT NULL,
                packet_loss REAL NOT NULL,
                availability REAL NOT NULL,
                ipv4_available INTEGER NOT NULL,
                ipv6_available INTEGER NOT NULL,
                stability_score REAL NOT NULL
            );",
            [],
        )?;

        // Create analyzer_outages table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS analyzer_outages (
                id TEXT PRIMARY KEY,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                duration_ms INTEGER,
                consecutive_failures INTEGER NOT NULL
            );",
            [],
        )?;

        // Create network_operations table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS network_operations (
                id TEXT PRIMARY KEY,
                run_id TEXT,
                batch_id TEXT,
                target_id TEXT,
                profile_id TEXT,
                operation_type TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                duration_ms INTEGER,
                failure_code TEXT,
                summary TEXT NOT NULL,
                request_metadata TEXT,
                response_metadata TEXT
            );",
            [],
        )?;

        // Create investigations table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS investigations (
                id TEXT PRIMARY KEY,
                target_id TEXT NOT NULL,
                status TEXT NOT NULL,
                baseline_profile_id TEXT NOT NULL,
                comparison_profile_ids TEXT NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                overall_assessment TEXT
            );",
            [],
        )?;

        // Create block_page_signatures table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS block_page_signatures (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                enabled INTEGER NOT NULL,
                match_json TEXT NOT NULL
            );",
            [],
        )?;

        // Create performance_runs table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS performance_runs (
                id TEXT PRIMARY KEY,
                benchmark_id TEXT,
                profile_id TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                latency_ms INTEGER,
                jitter_ms INTEGER,
                loss_percent REAL,
                download_mbps REAL,
                upload_mbps REAL,
                bytes_downloaded INTEGER,
                bytes_uploaded INTEGER,
                loaded_latency_ms INTEGER,
                bufferbloat_ms INTEGER
            );",
            [],
        )?;

        // Alter table attempts for backwards compatibility
        let _ = conn.execute(
            "ALTER TABLE performance_runs ADD COLUMN loaded_latency_ms INTEGER;",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE performance_runs ADD COLUMN bufferbloat_ms INTEGER;",
            [],
        );

        // Create data_usage_ledger table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS data_usage_ledger (
                id TEXT PRIMARY KEY,
                date_str TEXT NOT NULL,
                bytes_downloaded INTEGER NOT NULL,
                bytes_uploaded INTEGER NOT NULL
            );",
            [],
        )?;

        // Create privacy_expectations table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS privacy_expectations (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                expected_routing TEXT NOT NULL,
                dns_expectation TEXT NOT NULL,
                ipv6_policy TEXT NOT NULL,
                webrtc_expectation TEXT NOT NULL
            );",
            [],
        )?;

        // Create privacy_assessments table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS privacy_assessments (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                overall_verdict TEXT,
                findings_json TEXT
            );",
            [],
        )?;

        // Create indexes for fast queries
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_target_runs_target_id ON target_runs(target_id);",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_target_runs_started_at ON target_runs(started_at);",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_incidents_target_profile ON incidents(target_id, profile_id);",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_network_ops_run_id ON network_operations(run_id);",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_network_ops_started_at ON network_operations(started_at);",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_perf_runs_started_at ON performance_runs(started_at);",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_privacy_assess_started_at ON privacy_assessments(started_at);",
            [],
        )?;
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_data_usage_date ON data_usage_ledger(date_str);",
            [],
        )?;

        // Phase 1: Enriched network_operations columns
        let _ = conn.execute("ALTER TABLE network_operations ADD COLUMN source_type TEXT DEFAULT 'canireach_probe';", []);
        let _ = conn.execute("ALTER TABLE network_operations ADD COLUMN visibility_level TEXT DEFAULT 'application_instrumented';", []);
        let _ = conn.execute("ALTER TABLE network_operations ADD COLUMN host TEXT;", []);
        let _ = conn.execute("ALTER TABLE network_operations ADD COLUMN registrable_domain TEXT;", []);
        let _ = conn.execute("ALTER TABLE network_operations ADD COLUMN destination_ip TEXT;", []);
        let _ = conn.execute("ALTER TABLE network_operations ADD COLUMN destination_port INTEGER;", []);
        let _ = conn.execute("ALTER TABLE network_operations ADD COLUMN protocol TEXT;", []);
        let _ = conn.execute("ALTER TABLE network_operations ADD COLUMN http_status_code INTEGER;", []);
        let _ = conn.execute("ALTER TABLE network_operations ADD COLUMN failure_category TEXT DEFAULT 'unknown';", []);
        let _ = conn.execute("ALTER TABLE network_operations ADD COLUMN failure_reason TEXT;", []);
        let _ = conn.execute("ALTER TABLE network_operations ADD COLUMN severity TEXT DEFAULT 'medium';", []);
        let _ = conn.execute("ALTER TABLE network_operations ADD COLUMN occurrence_count INTEGER DEFAULT 1;", []);
        let _ = conn.execute("ALTER TABLE network_operations ADD COLUMN first_seen_at TEXT;", []);
        let _ = conn.execute("ALTER TABLE network_operations ADD COLUMN last_seen_at TEXT;", []);
        let _ = conn.execute("ALTER TABLE network_operations ADD COLUMN related_target_id TEXT;", []);
        let _ = conn.execute("ALTER TABLE network_operations ADD COLUMN metadata_json TEXT;", []);

        // Indexes for new fields
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_network_ops_host ON network_operations(host);", []);
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_network_ops_failure_category ON network_operations(failure_category);", []);
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_network_ops_severity ON network_operations(severity);", []);
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_network_ops_source_type ON network_operations(source_type);", []);

        // Phase 2: Continuous monitor tables
        conn.execute(
            "CREATE TABLE IF NOT EXISTS continuous_monitor_sessions (
                id TEXT PRIMARY KEY,
                target_id TEXT NOT NULL,
                config_json TEXT NOT NULL,
                state TEXT NOT NULL,
                started_at TEXT,
                stopped_at TEXT,
                total_runs INTEGER DEFAULT 0,
                successful_runs INTEGER DEFAULT 0,
                failed_runs INTEGER DEFAULT 0,
                consecutive_failures INTEGER DEFAULT 0,
                last_run_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS continuous_monitor_runs (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                target_id TEXT NOT NULL,
                run_index INTEGER NOT NULL,
                status TEXT NOT NULL,
                latency_ms INTEGER,
                http_status INTEGER,
                error_category TEXT,
                error_message TEXT,
                profile_id TEXT,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                FOREIGN KEY(session_id) REFERENCES continuous_monitor_sessions(id) ON DELETE CASCADE
            );",
            [],
        )?;

        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_cm_runs_session ON continuous_monitor_runs(session_id);", []);
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_cm_runs_target ON continuous_monitor_runs(target_id);", []);

        Ok(())
    }
}
