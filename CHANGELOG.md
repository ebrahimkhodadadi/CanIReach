# Changelog

All notable changes to the **CanIReach** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
* Bounded concurrent request loop (reqwest + tokio task pools).
* Manual HTTP redirect interception and loop tracking.
* Proxy profiling (SOCKS5, SOCKS5H, HTTP proxy supports).
* Real-time Progress streaming utilizing Tauri events emitter.
* Multi-layer diagnostics panel: DNS, TCP connect, TLS handshakes, HTTP payload queries.
* Path Diagnostics tab rendering traceroute node latency plots.
* Live Network Stability Analyzer calculating standard deviation jitter.
* Gateway IP Address observers emitting connection switch events.
* Settings panel tab to verify typed verification `RESET CANIREACH` and restart app configuration.
* Over 50+ pre-defined developer endpoints populated inside target loader.
* Solid dark theme backgrounds and contrast enhancements for the logging stream console.
