# Installation Guide

CanIReach is built using **Tauri**, combining a lightweight Rust engine backend with a React + TypeScript frontend.

---

## 📋 Prerequisites

Before compiling or packaging CanIReach, ensure your machine satisfies the following environment prerequisites:

### 1. Node.js & Package Manager
* **Node.js**: v18.0.0 or higher.
* **npm** (included with Node.js) or **pnpm** (preferred for faster module linking).

### 2. Rust Toolchain
* **Rust compiler**: v1.75.0 or higher.
* **Cargo**: Included with the Rust toolchain.
* Installation instructions: Follow [rustup.rs](https://rustup.rs/) to setup stable channels.

### 3. Platform System Dependencies

#### 🪟 Windows
* **Build Tools**: Install [C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-loop/) via Visual Studio Installer.
* **WebView2 Runtime**: Standard on Windows 10/11. Download standalone installer if running older builds.

#### 🍏 macOS
* **Command Line Tools**: Run the terminal setup command:
  ```bash
  xcode-select --install
  ```

#### 🐧 Linux (Experimental Support)
* Packages required (Debian/Ubuntu):
  ```bash
  sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libgtk-3-dev libayumu-dev
  ```

---

## 🛠️ Local Startup & Development

Follow these steps to run CanIReach locally:

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/ebrahimkhodadadi/CanIReach.git
   cd CanIReach
   ```

2. **Install Node Packages**:
   ```bash
   npm install
   ```

3. **Launch Development Environment**:
   ```bash
   npm run tauri dev
   ```
   *This starts the Vite web dev server and compiles the Rust binary in debug mode, enabling Hot Module Replacement (HMR) and real-time Rust rebuild watchers.*

---

## 📦 Production Builds & Bundling

To generate a standalone platform installer (e.g. `.exe` on Windows, `.app`/`.dmg` on macOS):

```bash
npm run tauri build
```

The resulting build bundles are placed in:
* **Windows**: `target/release/bundle/msi/CanIReach_*.msi` and `target/release/bundle/nsis/CanIReach_*.exe`
* **macOS**: `target/release/bundle/dmg/CanIReach_*.dmg`
