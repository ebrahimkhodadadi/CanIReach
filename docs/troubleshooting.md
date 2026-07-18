# Troubleshooting Manual

Common error conditions and recovery steps for CanIReach development and production.

---

## 🔒 1. "Database is Locked" Errors
* **Symptoms**: UI or background scheduler throws database write failures or locks.
* **Cause**: Multiple write operations colliding on the SQLite `history.db` file.
* **Resolution**: The backend sets a 5-second busy timeout which automatically retries locks. If locks persist, restart the GUI application. Alternatively, navigate to **Settings -> Reset App** to clean the database and start fresh.

---

## 🚪 2. "listen EACCES: permission denied ::1:1420"
* **Symptoms**: Vite web dev server fails to bind on startup.
* **Cause**: Port `1420` is already in use or restricted by your OS.
* **Resolution**: CanIReach uses port `5173` (HMR on `5174`) for improved stability. If port conflicts persist, configure alternative ports inside `vite.config.ts` and update the `devUrl` key in `src-tauri/tauri.conf.json`.

---

## ⚡ 3. "No reactor running" Rust panic
* **Symptoms**: Rust compiler panic crashes the app immediately on launch.
* **Cause**: Spawning Tokio tasks using `tokio::spawn` outside of an active asynchronous thread context during synchronous Tauri setup events.
* **Resolution**: Use `tauri::async_runtime::spawn` instead. This uses Tauri's global runtime pool, which is safe to call from both synchronous and asynchronous contexts.

---

## 🌐 4. VPN & Network Switch Issues
* **Symptoms**: Targets appear unreachable immediately after connecting or disconnecting a VPN.
* **Cause**: Operating system routing table switches invalidating active connection handles.
* **Resolution**: The warning banner "Network Connection Changed" will pop up automatically. Click **Retest Now** to force-refresh connection handles and re-run diagnostics over the new network paths.
