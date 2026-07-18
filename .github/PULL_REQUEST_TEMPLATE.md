## 📝 Description

Please provide a summary of the changes made and the problem resolved.

---

## 🛠️ Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Code refactor / optimization
- [ ] Documentation update
- [ ] Diagnostic target addition

---

## 📋 Pull Request Checklist

Before submitting this PR, please check the following:

- [ ] **Code Compiles**: Backend compiles cleanly with `cargo check`.
- [ ] **Zero Warnings**: Rust workspace passes `cargo clippy --workspace --all-targets -- -D warnings`.
- [ ] **Tests Pass**: `cargo test --workspace --all-targets` and `npm run test` run successfully.
- [ ] **Production Build**: Front-end compiles without error using `npm run build`.
- [ ] **Branding Check**: I have not altered the original logo (`src/assets/logo.png`) or introduced unapproved icons.
- [ ] **Sanitized Code**: No absolute paths, secrets, API tokens, or credentials are left in the repository.
- [ ] **Phase-Free Comments**: Removed references to internal phases ("Phase 1", "P0", etc.) or AI workflows.
