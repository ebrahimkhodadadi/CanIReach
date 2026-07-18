# Architecture Overview

This document details the modular architecture, component boundaries, data flows, and state ownership of **CanIReach**.

---

## 1. Workspace Crate Boundaries

The project is structured as a Cargo workspace containing two primary Rust crates and a decoupled frontend layer:

```
CanIReach/
├─ Cargo.toml                  # Workspace root
├─ crates/
│  └─ canireach-core/          # Pure domain & probe engine logic (No Tauri dependencies)
├─ src-tauri/                  # Desktop application integration (Tauri backend adapter)
└─ src/                        # React + TypeScript + Vite + Tailwind CSS frontend
```

### Dependency Graph Direction
```
[React/TS Frontend] 
     │ (Commands & Events)
     ▼
[Tauri Backend Adapter] (src-tauri)
     │ (Core APIs)
     ▼
[Core Probe Library] (canireach-core)
```

* **`canireach-core`**: A standalone, framework-agnostic crate. It has absolutely no knowledge of Tauri, React, or the UI. This enables easy packaging for CLIs or automated daemon tasks.
* **`tauri-app`**: Serves as the Tauri integration wrapper. It configures the shared state, translates backend errors to frontend DTOs, reads target files, and handles command-to-core orchestration.
* **Frontend**: A React presentation layer. It does not communicate with the core crate directly; instead, it uses a typed transport layer (`probeCommands.ts` and `probeEvents.ts`) which talks to the Tauri backend.

---

## 2. Core Probe Flow (`canireach-core`)

The probe engine operates concurrently with a bounded semaphore implementation:

```
[Target List] 
     │
     ▼  (Orchestrated via ProbeEngine)
[Tokio Tasks] ────► [Semaphore (Permit Check)] ───► [HttpProber] ───► [Redirect Tracker]
```

1. **`ProbeEngine`** manages a pool of concurrent probes utilizing a `tokio::sync::Semaphore`. It spawns parallel tasks up to the `concurrency_limit` specified in `ProbeConfig`.
2. **`HttpProber`** instantiates and reuses a single `reqwest::Client` instance (disabling automatic redirect following) to ensure connection keep-alive/pool reuse.
3. **`RedirectTracker`** performs request-isolated manual redirect resolution. If a redirection response is encountered, it tracks the URL history, ensures loop protection limits are respected, and issues follow-up requests.
4. Real-time updates are pushed upstream using a decoupled Rust closure callback `F: Fn(ProbeResult)`.

---

## 3. Tauri Adapter Flow (`src-tauri`)

The Tauri adapter maps frontend invocation to the core library:

```
[Frontend Command Invoke] ────► [Tauri Command Handler] ────► [AppState Retrieval]
                                                                     │
                                                                     ▼
[Tauri Emitter Event] ◄──────── [Realtime Callback] ◄──────── [ProbeEngine]
```

* **`AppState`** is registered on Tauri startup, holding the cached `Target` list (loaded once by `TargetLoader`) and the initialized `ProbeEngine`.
* Tauri command handlers in `src-tauri/src/commands/` retrieve `AppState` and delegate orchestration to the core engine.
* A callback passed to `ProbeEngine::probe_all` triggers `emit_probe_update` (which wraps `app_handle.emit("probe:update", result)`), streaming progress back to JS.

---

## 4. Frontend Event & State Flow

The React client manages state updates using a decoupled event-driven architecture:

```
[Tauri Event Listener] ───► [handleProbeUpdate Action] ───► [Zustand Store] ───► [Target Cards / Terminals]
```

* **Event Subscription**: Registered inside a React `useEffect` hook in `src/app/App.tsx` on startup, resolving to an `UnlistenFn` which is executed on component unmount.
* **Zustand Store (`useProbeStore`)**: Owns the centralized reachability state. State updates (e.g. `handleProbeUpdate`) write immutable changes back to the store.
* **Subscribed Selectors (`selectors.ts`)**: Components subscribe to specific slices of the state rather than the entire store, preventing redundant React renders.
