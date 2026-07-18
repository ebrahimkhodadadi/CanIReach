const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist-npm');
const PKGS_DIR = path.join(DIST_DIR, 'packages');

const NPM_TOKEN = process.env.NPM_TOKEN;
if (!NPM_TOKEN) {
  console.error('Error: NPM_TOKEN environment variable not set.');
  process.exit(1);
}

if (!fs.existsSync(PKGS_DIR)) {
  console.error(`Error: Packages directory not found at ${PKGS_DIR}. Run build-npm first.`);
  process.exit(1);
}

const packageDirs = fs.readdirSync(PKGS_DIR).filter(f => fs.statSync(path.join(PKGS_DIR, f)).isDirectory());

// Main launcher package is named 'canireach', others have suffixes (e.g. 'canireach-win32-x64')
const platformDirs = packageDirs.filter(d => d !== 'canireach');
const mainDir = 'canireach';

function publishPkg(dirName) {
  const dirPath = path.join(PKGS_DIR, dirName);
  console.log(`Publishing ${dirName} from ${dirPath}...`);
  
  // Write .npmrc for authentication
  fs.writeFileSync(path.join(dirPath, '.npmrc'), `//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n`, 'utf8');
  
  try {
    execSync('npm publish --access public', { cwd: dirPath, stdio: 'inherit' });
    console.log(`Successfully published ${dirName}`);
  } catch (err) {
    // If it fails because the package version is already published, handle it gracefully
    console.warn(`Warning: Failed to publish ${dirName}. It might already be published. Error: ${err.message}`);
  }
}

// 1. Publish platform packages first so optionalDependencies resolve correctly on install
for (const dir of platformDirs) {
  publishPkg(dir);
}

// 2. Publish main launcher package
if (packageDirs.includes(mainDir)) {
  publishPkg(mainDir);
}

console.log('✅ NPM publication phase completed!');
