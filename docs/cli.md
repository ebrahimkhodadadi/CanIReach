# Command-Line Interface (CLI) Guide

CanIReach includes a professional network diagnostics command-line interface. It reuses the same high-concurrency Rust diagnostics prober as the desktop application.

---

## ⚡ Quick Start

### Default Command Fallback
If you specify a URL or domain directly without a subcommand, the CLI automatically falls back to executing the `test` command:

```bash
# These two commands execute the exact same test diagnostics:
canireach github.com
canireach test github.com
```

---

## 🛠️ Installation

Compile and install the executable directly via Cargo to place it on your system PATH:

```bash
# Navigate to the project root and install:
cargo install --path src-tauri --bin canireach
```

The compiled release binary is located at:
* **Windows**: `src-tauri/target/release/canireach.exe`
* **macOS/Linux**: `src-tauri/target/release/canireach`

---

## 📋 Global Options

Customize the prober engine parameters globally across all subcommands:

| Option | Description |
|---|---|
| `-f, --format <human\|json\|ndjson>` | Output format. Default: `human`. |
| `--color <auto\|always\|never>` | Control ANSI terminal colors. Default: `auto`. |
| `--timeout <duration>` | Custom prober timeouts (e.g. `500ms`, `5s`, `2m`). |
| `--retries <number>` | Number of times the prober retries failed stages. |
| `--proxy <url>` | Route queries via a custom HTTP/SOCKS5 proxy URL. |
| `--concurrency <number>` | Bounded concurrent workers for multiple targets. Default: `5`. |
| `-v, -vv, -vvv` | Verbose logging output levels. |
| `-q, --quiet` | Quiet mode. Suppresses progress text, returns data only. |
| `--no-progress` | Disables animated progress spinners. |
| `--no-unicode` | Fall back to ASCII characters instead of Unicode symbols. |
| `--config <path>` | Path to custom targets JSON database. |
| `--network <profile_id>` | Selected network profile ID or interface binding. |

---

## 📂 Subcommands

### 1. `test`
Run connectivity diagnostics on one or more target endpoints:
```bash
canireach test google.com pub.dev crates.io
```

### 2. `traceroute` (Alias: `trace`)
Trace path routing nodes to a host:
```bash
canireach trace github.com
```

### 3. `doctor`
Verify local database bindings, configurations, DNS connectivity, and interface profiles:
```bash
canireach doctor
```

### 4. `config`
Inspect local JSON configurations or validate schemas:
```bash
canireach config show
canireach config validate
```

### 5. `backup`
Create or restore ZIP backups of active databases and settings:
```bash
canireach backup create --file my_backup.zip
canireach backup restore --file my_backup.zip --force
```

### 6. `completion`
Generate shell auto-completion scripts to stdout:
```bash
# Example for PowerShell profile:
canireach completion powershell
```

---

## 🚪 Exit Codes

Script integrations and CI checks can rely on these stable exit codes:

| Code | Meaning |
|---|---|
| **`0`** | Diagnostics completed successfully. Targets are reachable. |
| **`1`** | Diagnostics completed, but one or more targets were unreachable or degraded. |
| **`2`** | Invalid command-line arguments or bad configurations. |
| **`3`** | Local network offline or precheck connection failure. |
| **`4`** | Connection or DNS resolution timed out. |
| **`5`** | Interrupted or cancelled (e.g., Ctrl+C). |
| **`6`** | Internal application error. |

---

## 🛡️ Security & Privacy
* **Credential Redaction**: Proxy URLs containing user authentication (e.g. `socks5://user:pass@127.0.0.1`) have passwords automatically redacted as `[redacted]` before print.
* **Header Redaction**: All request cookie headers, tokens, and authorization parameters are stripped out at the core engine layer.
* **No Telemetry**: Absolutely no network trace results, host metrics, or IP locations are transmitted to external cloud systems.
