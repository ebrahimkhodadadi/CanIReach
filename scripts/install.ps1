# CanIReach Windows PowerShell Installation Script
# https://github.com/ebrahimkhodadadi/CanIReach

$ErrorActionPreference = "Stop"

$Repo = "ebrahimkhodadadi/CanIReach"
$DefaultInstallDir = Join-Path $env:USERPROFILE ".local\bin"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "      CanIReach CLI Installer" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Force TLS 1.2 for download
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

# Check architecture
$Arch = $env:PROCESSOR_ARCHITECTURE
if ($Arch -ne "AMD64") {
    Write-Error "Unsupported architecture: $Arch. Only AMD64 (x64) is supported on Windows."
    exit 1
}

Write-Host "Fetching latest version information..."
$ReleasesUrl = "https://api.github.com/repos/$Repo/releases/latest"
try {
    $ReleaseInfo = Invoke-RestMethod -Uri $ReleasesUrl -Method Get -UserAgent "CanIReachInstaller"
    $LatestTag = $ReleaseInfo.tag_name
} catch {
    Write-Warning "Could not retrieve latest release version. Using fallback..."
    $LatestTag = "v1.0.0-rc.1"
}

$Version = $LatestTag.TrimStart('v')
$ArchiveName = "canireach-v${Version}-x86_64-pc-windows-msvc.zip"
$DownloadUrl = "https://github.com/$Repo/releases/download/${LatestTag}/${ArchiveName}"
$ChecksumsUrl = "https://github.com/$Repo/releases/download/${LatestTag}/checksums.txt"

Write-Host "OS: Windows"
Write-Host "Architecture: x64"
Write-Host "Target Release: $LatestTag"
Write-Host "Installing to: $DefaultInstallDir"
Write-Host "------------------------------------------"

# Create temp directory
$TempDir = Join-Path [System.IO.Path]::GetTempPath() ([System.Guid]::NewGuid().ToString())
$null = New-Item -ItemType Directory -Path $TempDir -Force

try {
    Write-Host "Downloading checksums.txt..."
    $ChecksumsPath = Join-Path $TempDir "checksums.txt"
    Invoke-WebRequest -Uri $ChecksumsUrl -OutFile $ChecksumsPath -UseBasicParsing

    Write-Host "Downloading $ArchiveName..."
    $ArchivePath = Join-Path $TempDir $ArchiveName
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $ArchivePath -UseBasicParsing

    # Verify Checksum
    Write-Host "Verifying checksum..."
    $ChecksumsContent = Get-Content -Path $ChecksumsPath
    $ExpectedHash = $null
    foreach ($Line in $ChecksumsContent) {
        if ($Line -match $ArchiveName) {
            $ExpectedHash = ($Line -split '\s+')[0].Trim().ToLower()
            break
        }
    }

    if ($null -eq $ExpectedHash) {
        Write-Warning "Checksum for $ArchiveName not found in checksums.txt. Proceeding with caution..."
    } else {
        $ActualHash = (Get-FileHash -Path $ArchivePath -Algorithm SHA256).Hash.ToLower()
        if ($ExpectedHash -ne $ActualHash) {
            Write-Error "SHA-256 Checksum validation failed!`nExpected: $ExpectedHash`nActual:   $ActualHash"
            exit 1
        }
        Write-Host "✅ Checksum verification succeeded!" -ForegroundColor Green
    }

    # Extract
    Write-Host "Extracting binary..."
    Expand-Archive -Path $ArchivePath -DestinationPath $TempDir -Force

    # Ensure destination path exists
    if (!(Test-Path -Path $DefaultInstallDir)) {
        $null = New-Item -ItemType Directory -Path $DefaultInstallDir -Force
    }

    Copy-Item -Path (Join-Path $TempDir "canireach.exe") -Destination (Join-Path $DefaultInstallDir "canireach.exe") -Force

    Write-Host "------------------------------------------"
    Write-Host "🎉 CanIReach CLI installed successfully to $DefaultInstallDir\canireach.exe!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Please make sure your User PATH contains the install directory."
    Write-Host "You can add it permanently in PowerShell by running:"
    Write-Host "  [Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User') + ';$DefaultInstallDir', 'User')"
    Write-Host ""
    Write-Host "Restart your terminal and run 'canireach --help' to verify."
    Write-Host "==========================================" -ForegroundColor Cyan

} finally {
    # Clean up temp
    if (Test-Path -Path $TempDir) {
        Remove-Item -Path $TempDir -Recurse -Force
    }
}
