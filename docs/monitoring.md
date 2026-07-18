# Live Network Monitoring

CanIReach features automated background loops to measure overall internet quality and notify you upon connection changes.

---

## ⚡ Live Network Stability Analyzer

The stability analyzer is a lightweight, background worker service that runs concurrently with the user's dashboard view:

### 1. Canary Target Loops
* Queries highly-available public DNS and CDNs (Google DNS, Cloudflare canary endpoints) every few seconds.
* Tracks latency offsets, packet drop ratios, and transaction results.

### 2. Standard Deviation Jitter
* Calculates latency **Jitter** by measuring the standard deviation of latency values across a rolling buffer of 30 samples.
* High variance in latency indicators is reported as unstable network paths.

### 3. Stability Score Calculation
* Computes a global **Stability Score** from `0%` to `100%`:
  * **90% - 100% (Excellent)**: Low latencies, zero packet drops, and steady response variances.
  * **70% - 89% (Fair)**: Minor variations or slow resolve handshakes.
  * **0% - 69% (Critical)**: Intermittent packet losses, high latency jitter, or offline gateways.

---

## 🔍 Network Change Observer

The application runs a lightweight background routing socket checker to capture connection state changes:

* **Active Observer**: Connects a local UdpSocket handle to a public canary IP (`8.8.8.8`). This retrieves the primary gateway interface's local IP address without initiating real network traffic.
* **Debounced Trigger**: Monitors changes to the local IP address. If a gateway change, interface swap, or VPN tunnel swap is detected:
  * Emits a `"network-change-detected"` event to the React layer.
  * The frontend displays a warning banner at the top of the Overview panel, informing the user that test results might be stale and offering a **Retest Now** trigger.
