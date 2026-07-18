# Developer Reference Manual

This manual details the compiler toolchains, command lines, and quality gates for CanIReach code contributors.

---

## 📂 Repository Layout

* **`src/`**: React + TypeScript client code.
* **`src-tauri/`**: Tauri desktop integrations, settings commands, update handlers, and observer threads.
* **`crates/canireach-core/`**: Standalone core crate that runs high-concurrency target diagnostics.
* **`docs/`**: Markdown guides, architecture manuals, and indexes.

---

## 🛠️ Verification Commands

Perform the following verification steps locally before submitting pull requests:

### 1. Backend Compilation & Clippy
Verify Rust code compiles with zero warnings or styling errors:
```bash
# Run compiler checks
cargo check --workspace --all-targets

# Run strict clippy analysis
cargo clippy --workspace --all-targets -- -D warnings
```

### 2. Run Test Suites
Confirm that all backend and frontend unit tests pass cleanly:
```bash
# Execute Rust tests
cargo test --workspace --all-targets

# Execute React / Vitest tests
npm run test
```

### 3. Frontend Types & Linting
Verify TypeScript type definitions and styling standards:
```bash
# Compile and build Vite production bundle
npm run build
```

---

## 🔌 Adding a Custom Tauri Command

To expose a new Rust feature as a front-end command:

1. **Implement Command**: Add the Rust function under `src-tauri/src/commands/` and decorate it with `#[tauri::command]`.
2. **Export Command**: Add the function to `src-tauri/src/commands/mod.rs`.
3. **Register Command**: Add the function to the `generate_handler!` list inside `src-tauri/src/lib.rs`.
4. **Invoke Command**: Trigger the function from the frontend TypeScript files:
   ```typescript
   import { invoke } from "@tauri-apps/api/core";
   await invoke("my_custom_command", { argName: value });
   ```
