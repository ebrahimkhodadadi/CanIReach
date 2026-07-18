# Getting Started with CanIReach

CanIReach is a local-first desktop application built for developers, network engineers, and system administrators. It lets you monitor network connectivity, diagnose request issues, trace paths, and analyze gateway stability with zero external tracking or data telemetry.

---

## 🚀 Key Features

* **High-Concurrency Probe Engine**: Orchestrated via Rust Tokio task pools with configurable worker queues.
* **Manual Redirect Isolation**: Tracks exact intermediate hops, loop patterns, and response codes.
* **Proxy Routing support**: Route probes individually via Direct, HTTP, SOCKS5, or SOCKS5H network paths.
* **Live Network Stability Index**: Visualizes latency jitter standard deviations and gateway metrics in real-time.
* **Background Monitoring**: Scheduled check loops utilizing lightweight AppData locking interfaces.

---

## 🎨 Interface Layout

The workspace pane consists of four main functional sections:

Here is a preview of the main interface dashboards:

| Overview Dashboard | Targets datagrid workspace |
|---|---|
| ![CanIReach Dashboard](assets/dashboard.png) | ![CanIReach Targets Table](assets/target_tables.png) |

1. **Destinations Sidebar (Left)**
   * **Overview**: Global reachability metrics, circular health gauges, active alerts, and category matrices.
   * **Targets Table**: Bounded datagrid listing endpoints with live search, filters, and status sorts.
   * **Problems**: Aggregated listing of failed targets, exposing HTTP codes, error messages, and trace references.
   * **Path Diagnostics**: Interactive path visualization containing hop offsets, latency, and router IPs.
   * **Configuration Center (Settings)**: Fine-tune latency bounds, create network profiles, and construct custom target groups.

2. **Main Workspace Control Pane (Center)**
   * Renders the current tab. Includes top-level controls to trigger checks globally, pause schedulers, or check connection state.

3. **Log Stream Drawer (Bottom)**
   * Collapsible terminal emulator streaming real-time diagnostic output, info, warnings, and trace details.

4. **Inspector Drawer (Right)**
   * Opens on target card click to show summary metrics, timing distributions, historical timeline lists, and raw probe payload structures.
