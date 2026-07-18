#!/usr/bin/env bash
set -euo pipefail

# CanIReach Unix Installation Script
# https://github.com/ebrahimkhodadadi/CanIReach

REPO="ebrahimkhodadadi/CanIReach"
DEFAULT_INSTALL_DIR="$HOME/.local/bin"

echo "=========================================="
echo "      CanIReach CLI Installer"
echo "=========================================="

# Detect OS and Arch
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  darwin)
    PLATFORM="apple-darwin"
    ;;
  linux)
    PLATFORM="unknown-linux-gnu"
    ;;
  *)
    echo "Error: Unsupported OS: $OS"
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64)
    TARGET_ARCH="x86_64"
    ;;
  arm64|aarch64)
    TARGET_ARCH="aarch64"
    ;;
  *)
    echo "Error: Unsupported CPU architecture: $ARCH"
    exit 1
    ;;
esac

# Get the latest release tag from GitHub API
echo "Fetching latest version information..."
LATEST_TAG=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST_TAG" ]; then
  echo "Error: Could not retrieve latest release version. Checking fallback..."
  LATEST_TAG="v1.0.0-rc.1"
fi

VERSION="${LATEST_TAG#v}"
ARCHIVE_NAME="canireach-v${VERSION}-${TARGET_ARCH}-${PLATFORM}.tar.gz"
DOWNLOAD_URL="https://github.com/$REPO/releases/download/${LATEST_TAG}/${ARCHIVE_NAME}"
CHECKSUMS_URL="https://github.com/$REPO/releases/download/${LATEST_TAG}/checksums.txt"

echo "OS: $OS"
echo "Architecture: $ARCH"
echo "Target Release: $LATEST_TAG"
echo "Installing to: $DEFAULT_INSTALL_DIR"
echo "------------------------------------------"

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

echo "Downloading checksums.txt..."
curl -sSL "$CHECKSUMS_URL" -o "$TEMP_DIR/checksums.txt"

echo "Downloading $ARCHIVE_NAME..."
curl -sSL "$DOWNLOAD_URL" -o "$TEMP_DIR/$ARCHIVE_NAME"

# Verify Checksum
echo "Verifying checksum..."
EXPECTED_SHA=$(grep "$ARCHIVE_NAME" "$TEMP_DIR/checksums.txt" | cut -d' ' -f1 || true)

if [ -z "$EXPECTED_SHA" ]; then
  echo "Warning: Checksum for $ARCHIVE_NAME not found in checksums.txt."
  echo "Proceeding with caution..."
else
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_SHA=$(sha256sum "$TEMP_DIR/$ARCHIVE_NAME" | cut -d' ' -f1)
  elif command -v shasum >/dev/null 2>&1; then
    ACTUAL_SHA=$(shasum -a 256 "$TEMP_DIR/$ARCHIVE_NAME" | cut -d' ' -f1)
  else
    echo "Error: Neither sha256sum nor shasum is installed. Cannot verify archive integrity."
    exit 1
  fi

  if [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
    echo "Error: SHA-256 Checksum validation failed!"
    echo "Expected: $EXPECTED_SHA"
    echo "Actual:   $ACTUAL_SHA"
    exit 1
  fi
  echo "✅ Checksum verification succeeded!"
fi

# Extract and install
echo "Extracting binary..."
tar -xzf "$TEMP_DIR/$ARCHIVE_NAME" -C "$TEMP_DIR"

mkdir -p "$DEFAULT_INSTALL_DIR"
cp "$TEMP_DIR/canireach" "$DEFAULT_INSTALL_DIR/canireach"
chmod +x "$DEFAULT_INSTALL_DIR/canireach"

echo "------------------------------------------"
echo "🎉 CanIReach CLI installed successfully to $DEFAULT_INSTALL_DIR/canireach!"
echo ""
echo "Please make sure your PATH contains the install directory."
echo "You can check or add this to your shell profile (.bashrc, .zshrc, or .profile):"
echo "  export PATH=\$PATH:$DEFAULT_INSTALL_DIR"
echo ""
echo "Run 'canireach --help' to verify installation."
echo "=========================================="
