# Contributing Guidelines

Thank you for contributing to CanIReach! We welcome bug reports, feature suggestions, code refactors, and diagnostic enhancements.

---

## 🐛 Submitting Issue Reports

* Check open issues before creating new reports.
* Use the provided issue templates.
* **Privacy Warning**: Sanitize all logs, IP addresses, domains, and proxy credentials before pasting console output.

---

## 💻 Code Quality Gates

We enforce strict compilation and linting rules:

1. **Rust Workspace**: Code must compile warning-free:
   ```bash
   cargo clippy --workspace --all-targets -- -D warnings
   cargo fmt --all -- --check
   ```
2. **TypeScript & Build**: The Vite production bundler must compile cleanly:
   ```bash
   npm run build
   ```
3. **Unit Tests**: All test suites must pass:
   ```bash
   cargo test --workspace --all-targets
   npm run test
   ```

---

## 📂 Suggesting Default Targets

To suggest new built-in default endpoints:
1. Open `src-tauri/src/config/target_loader.rs`.
2. Locate the `get_defaults()` function.
3. Add a new entry to the `default_domains` list using the triple format: `("target_id", "https://example.com", "Category Name")`.
4. Ensure the domain is highly available, stable, and useful for other developers.
