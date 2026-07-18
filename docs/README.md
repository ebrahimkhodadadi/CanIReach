# CanIReach Documentation Index

Welcome to the official documentation for **CanIReach**, a local-first, zero-telemetry network diagnostics and reachability monitoring console.

---

## 📖 User Documentation

Discover how to set up, customize, and navigate the application:

* **[Getting Started](getting-started.md)**: Quick introduction, features overview, and basic layout guide.
* **[Installation](installation.md)**: Platform-specific guides, dependencies, and bundle setups.
* **[Usage Guide](usage.md)**: Run connectivity checks, trace paths, view live network logs, and configure scheduled checks.
* **[CLI Guide](cli.md)**: Detailed manual for executing command-line tests, shell completions, and formats.
* **[Configuration Reference](configuration.md)**: Customize concurrency, timeouts, headers, and manage local endpoint lists.
* **[Diagnostics Details](diagnostics.md)**: Learn about the internal probe engine, DNS resolves, TLS checks, HTTP status codes, and traceroute logic.
* **[Live Monitoring](monitoring.md)**: Background monitors, stability rating meters, and interface observers.
* **[Proxy & Network Selection](proxy-and-network-selection.md)**: Route traffic via SOCKS5, HTTP proxies, or bind target checks to specific active local interfaces.

---

## 🛠️ Contributor & Developer Documentation

Deep dive into the source code, architecture, and coding guides:

* **[Architecture Overview](architecture.md)**: Rust core engine workspace, Tauri IPC command layers, and React components flow.
* **[Development Guide](development.md)**: Compile commands, type checking, frontend unit tests, and code structure rules.
* **[Troubleshooting Manual](troubleshooting.md)**: Diagnose compile issues, local DB lock failures, and VPN/network state issues.
* **[Privacy & Security Policy](privacy-and-security.md)**: Privacy bounds, local SQLite details, and security auditing guidelines.
* **[Contributing Guidelines](contributing.md)**: Submit bugs, suggest default targets, and pull request rules.
* **[Release Process](release-process.md)**: Tauri bundler commands, versions tagging, and packaging pipelines.
