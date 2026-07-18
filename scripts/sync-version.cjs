const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const FILES = {
  packageJson: path.join(ROOT_DIR, 'package.json'),
  tauriConf: path.join(ROOT_DIR, 'src-tauri', 'tauri.conf.json'),
  tauriCargo: path.join(ROOT_DIR, 'src-tauri', 'Cargo.toml'),
  coreCargo: path.join(ROOT_DIR, 'crates', 'canireach-core', 'Cargo.toml'),
};

function getPackageJsonVersion() {
  const data = JSON.parse(fs.readFileSync(FILES.packageJson, 'utf8'));
  return data.version;
}

function getTauriConfVersion() {
  const data = JSON.parse(fs.readFileSync(FILES.tauriConf, 'utf8'));
  return data.version;
}

function getCargoVersion(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error(`Could not find version in Cargo manifest: ${filePath}`);
  }
  return match[1];
}

function setPackageJsonVersion(version) {
  const content = fs.readFileSync(FILES.packageJson, 'utf8');
  const data = JSON.parse(content);
  data.version = version;
  fs.writeFileSync(FILES.packageJson, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function setTauriConfVersion(version) {
  const content = fs.readFileSync(FILES.tauriConf, 'utf8');
  const data = JSON.parse(content);
  data.version = version;
  fs.writeFileSync(FILES.tauriConf, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function setCargoVersion(filePath, version) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
  fs.writeFileSync(filePath, content, 'utf8');
}

function checkVersions() {
  console.log('Auditing workspace versions...');
  const errors = [];
  
  let targetVersion;
  try {
    targetVersion = getPackageJsonVersion();
    console.log(`Reference version (package.json): ${targetVersion}`);
  } catch (err) {
    errors.push(`Failed to read package.json version: ${err.message}`);
  }

  if (targetVersion) {
    try {
      const tauriConfVer = getTauriConfVersion();
      if (tauriConfVer !== targetVersion) {
        errors.push(`Mismatch in tauri.conf.json: found "${tauriConfVer}", expected "${targetVersion}"`);
      }
    } catch (err) {
      errors.push(`Failed to read tauri.conf.json version: ${err.message}`);
    }

    try {
      const tauriCargoVer = getCargoVersion(FILES.tauriCargo);
      if (tauriCargoVer !== targetVersion) {
        errors.push(`Mismatch in src-tauri/Cargo.toml: found "${tauriCargoVer}", expected "${targetVersion}"`);
      }
    } catch (err) {
      errors.push(`Failed to read src-tauri/Cargo.toml version: ${err.message}`);
    }

    try {
      const coreCargoVer = getCargoVersion(FILES.coreCargo);
      if (coreCargoVer !== targetVersion) {
        errors.push(`Mismatch in crates/canireach-core/Cargo.toml: found "${coreCargoVer}", expected "${targetVersion}"`);
      }
    } catch (err) {
      errors.push(`Failed to read crates/canireach-core/Cargo.toml version: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    console.error('\n❌ Version verification failed:');
    errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  } else {
    console.log('\n✅ All workspace versions are in sync!');
  }
}

function updateVersions(version) {
  // Validate semver format briefly
  const cleanVersion = version.startsWith('v') ? version.substring(1) : version;
  if (!/^\d+\.\d+\.\d+(-\w+(\.\d+)?)?$/.test(cleanVersion)) {
    console.error(`Error: Invalid semver version pattern: "${version}"`);
    process.exit(1);
  }

  console.log(`Syncing all workspace versions to: ${cleanVersion}`);
  try {
    setPackageJsonVersion(cleanVersion);
    setTauriConfVersion(cleanVersion);
    setCargoVersion(FILES.tauriCargo, cleanVersion);
    setCargoVersion(FILES.coreCargo, cleanVersion);
    console.log('✅ Synchronization completed successfully!');
  } catch (err) {
    console.error(`❌ Failed to update versions: ${err.message}`);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
if (args[0] === '--check') {
  checkVersions();
} else if (args[0] === '--set' && args[1]) {
  updateVersions(args[1]);
} else {
  console.log(`CanIReach Version Synchronization Tool

Usage:
  node scripts/sync-version.cjs --check        Verifies that all version declarations match.
  node scripts/sync-version.cjs --set <ver>   Updates all version declarations to <ver>.
`);
  process.exit(1);
}
