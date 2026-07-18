# User Guide

This guide walks you through the primary workflows and monitoring tools in CanIReach.

---

## ⚡ Running Connectivity Diagnostics

### 1. Execute Checks
* Click the global **Retest All** button at the top right of the dashboard.
* Click the individual play button on any specific Target card to diagnose that endpoint in isolation.

### 2. Understand Status Identifiers
* **Reachable (Green)**: The endpoint returned a successful TCP connection and HTTP status code (`200 OK` to `399 Redirect`).
* **Failed (Red)**: The socket query encountered a connection failure, DNS resolution failure, network timeout, SSL/TLS handshake error, or a server error (`400` to `599`).
* **Degraded (Yellow)**: The endpoint is reachable but is responding with high latency or packet loss.
* **Testing (Blue/Spinning)**: An active diagnostic task is currently querying the server.

---

## 🗺️ Performing Traceroute Inspections

The **Path Diagnostics** view helps you trace the exact hop-by-hop route taken by packets to reach a server:

1. Select a target from the dropdown list or enter a custom domain/IP address.
2. Click **Start Traceroute**.
3. View the visual node-to-node path mapping:
   * **Hop Number**: Incremental count of intermediate routers.
   * **Node Address**: IP address and resolved hostname of the router.
   * **Round-Trip Time (RTT)**: Latency in milliseconds for packet round-trips.
   * **Packet Loss**: Timed-out router nodes are highlighted as `* * *`.

---

## 📜 Using the Live Logs Stream Console

The bottom console streams real-time developer-level output from the probe engines:

* **Open Console**: Click the **Live Logs Stream** toggle bar at the bottom of the screen.
* **Level Filters**: Filter output by selecting **All Levels**, **INFO**, **WARN**, or **ERROR**.
* **Search**: Type query keywords to instantly isolate specific targets or error codes.
* **Auto-Scroll**: Toggle the checkbox to pin log feeds to the latest incoming records.
* **Clear Console**: Click the trash icon to wipe the in-memory display buffer.

---

## 📅 Scheduled Background Monitoring

CanIReach includes a background execution loop to query endpoints automatically:

1. Navigate to **Settings -> Endpoint Schedules**.
2. Construct custom intervals (e.g. every 5 minutes, hourly).
3. Toggle schedules on or off. Active loops run quietly in the background, updating the dashboard gauges and logging stability scores.

---

## 🔄 Resetting the Application Configuration

If you encounter corrupt configurations or wish to wipe all data:

1. Navigate to **Settings -> Reset App** tab.
2. Review the list of configurations and databases to be deleted.
3. Type `RESET CANIREACH` in the safety verification text field.
4. Click **Reset CanIReach & Restart**. The app will wipe AppData configurations, clean SQLite databases, and reboot immediately with fresh defaults.
