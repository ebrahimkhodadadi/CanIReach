# Configuration Reference

CanIReach stores all targets, network profiles, schedules, and engine configurations locally on your machine.

---

## 📂 Configuration Storage Locations

All user settings are saved as JSON config files inside your system's roaming application data folder:

* **Windows**: `%APPDATA%\CanIReach\`
  * Default: `C:\Users\<Username>\AppData\Roaming\CanIReach\`
* **macOS**: `~/Library/Application Support/CanIReach/`
* **Linux**: `~/.config/CanIReach/`

### Primary Configuration Files:
1. **`settings.json`**: Holds engine timing thresholds, concurrent task bounds, and user-agent parameters.
2. **`targets.json`**: Contains the complete collection of target endpoints, descriptions, categories, and tags.
3. **`history.db`**: SQLite database storing rolling latency records, outages, and scheduler histories.

---

## ⚙️ Engine Settings Parameters

Customize these engine thresholds in **Settings -> Engine Settings**:

| Parameter | Default | Min / Max | Description |
|---|---|---|---|
| **Concurrency Limit** | `5` | `1` / `50` | Maximum number of concurrent Tokio tasks spawned by the prober. |
| **Max Redirects** | `10` | `0` / `50` | Maximum depth of HTTP redirect links resolved before loop error. |
| **Connect Timeout** | `5000 ms` | `100 ms` / `60000 ms` | Maximum time allowed to establish a raw TCP connection. |
| **Total Timeout** | `10000 ms` | `100 ms` / `60000 ms` | Bounded duration limit for the entire HTTP transaction. |
| **DNS Timeout** | `3000 ms` | `100 ms` / `60000 ms` | Maximum time threshold allowed for name resolution queries. |
| **TCP Timeout** | `3000 ms` | `100 ms` / `60000 ms` | Max timeout verifying intermediate TCP handshakes. |
| **TLS Timeout** | `3000 ms` | `100 ms` / `60000 ms` | Timeout threshold allowed to perform secure TLS handshakes. |
| **Retry Count** | `1` | `0` / `5` | Number of probe retries executed upon encountering errors. |
| **Retry Delay** | `500 ms` | `100 ms` / `10000 ms` | Waiting interval (cooldown) before executing target retries. |

---

## 🏷️ Endpoint Targets JSON Schema

Endpoints are mapped inside `targets.json` using the following model:

```json
[
  {
    "id": "github_homepage",
    "name": "github_homepage",
    "url": "https://github.com",
    "description": "GitHub Repository Landing Page",
    "category": "GitHub",
    "group_ids": [],
    "tags": [],
    "enabled": true,
    "network_profile_id": null,
    "diagnostic_overrides": null,
    "created_at": "2026-07-18T18:40:00Z",
    "updated_at": "2026-07-18T18:40:00Z"
  }
]
```
