const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist-npm');
const PKGS_DIR = path.join(DIST_DIR, 'packages');

const SCOPE = '@ebrahimkhodadadi';
const BASE_NAME = 'canireach';

const PLATFORMS = [
  {
    pkgSuffix: 'win32-x64',
    os: ['win32'],
    cpu: ['x64'],
    binarySrcName: 'canireach-x86_64-pc-windows-msvc.exe',
    binaryDestName: 'canireach.exe',
  },
  {
    pkgSuffix: 'darwin-x64',
    os: ['darwin'],
    cpu: ['x64'],
    binarySrcName: 'canireach-x86_64-apple-darwin',
    binaryDestName: 'canireach',
  },
  {
    pkgSuffix: 'darwin-arm64',
    os: ['darwin'],
    cpu: ['arm64'],
    binarySrcName: 'canireach-aarch64-apple-darwin',
    binaryDestName: 'canireach',
  },
  {
    pkgSuffix: 'linux-x64',
    os: ['linux'],
    cpu: ['x64'],
    binarySrcName: 'canireach-x86_64-unknown-linux-gnu',
    binaryDestName: 'canireach',
  },
  {
    pkgSuffix: 'linux-arm64',
    os: ['linux'],
    cpu: ['arm64'],
    binarySrcName: 'canireach-aarch64-unknown-linux-gnu',
    binaryDestName: 'canireach',
  },
];

function getVersion() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  return packageJson.version;
}

function cleanAndPrepare() {
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.mkdirSync(PKGS_DIR, { recursive: true });
}

function buildPlatformPackages(version, binariesDir) {
  for (const plat of PLATFORMS) {
    const pkgName = `${BASE_NAME}-${plat.pkgSuffix}`;
    const fullPkgName = SCOPE ? `${SCOPE}/${pkgName}` : pkgName;
    const pkgDir = path.join(PKGS_DIR, pkgName);
    const binDir = path.join(pkgDir, 'bin');
    
    fs.mkdirSync(binDir, { recursive: true });
    
    // Copy binary
    const srcPath = path.join(binariesDir, plat.binarySrcName);
    const destPath = path.join(binDir, plat.binaryDestName);
    
    if (!fs.existsSync(srcPath)) {
      console.warn(`Warning: Binary not found at ${srcPath}. Skipping package ${fullPkgName}`);
      continue;
    }
    
    fs.copyFileSync(srcPath, destPath);
    if (process.platform !== 'win32') {
      fs.chmodSync(destPath, 0o755);
    }
    
    // Write package.json
    const packageJson = {
      name: fullPkgName,
      version: version,
      description: `Prebuilt binary for CanIReach on ${plat.pkgSuffix}`,
      os: plat.os,
      cpu: plat.cpu,
      preferUnplugged: true,
      publishConfig: {
        access: 'public'
      }
    };
    
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify(packageJson, null, 2) + '\n',
      'utf8'
    );
    
    console.log(`Created platform package: ${fullPkgName}`);
  }
}

function buildLauncherPackage(version) {
  const pkgName = BASE_NAME;
  const fullPkgName = SCOPE ? `${SCOPE}/${pkgName}` : pkgName;
  const pkgDir = path.join(PKGS_DIR, pkgName);
  const binDir = path.join(pkgDir, 'bin');
  
  fs.mkdirSync(binDir, { recursive: true });
  
  // Write launcher.js
  const launcherCode = `#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const platform = process.platform;
const arch = process.arch;

const supported = {
  'win32-x64': { pkg: '${BASE_NAME}-win32-x64', exe: 'canireach.exe' },
  'darwin-x64': { pkg: '${BASE_NAME}-darwin-x64', exe: 'canireach' },
  'darwin-arm64': { pkg: '${BASE_NAME}-darwin-arm64', exe: 'canireach' },
  'linux-x64': { pkg: '${BASE_NAME}-linux-x64', exe: 'canireach' },
  'linux-arm64': { pkg: '${BASE_NAME}-linux-arm64', exe: 'canireach' },
};

const key = \`\${platform}-\${arch}\`;
const target = supported[key];

if (!target) {
  console.error(\`Error: CanIReach is not supported on platform: \${platform}, architecture: \${arch}\`);
  process.exit(1);
}

const scope = '${SCOPE}';
const fullPkgName = scope ? \`\${scope}/\${target.pkg}\` : target.pkg;

let binPath;
try {
  binPath = require.resolve(\`\${fullPkgName}/bin/\${target.exe}\`);
} catch (err) {
  binPath = path.join(__dirname, '..', '..', target.pkg, 'bin', target.exe);
  if (!fs.existsSync(binPath)) {
    binPath = path.join(__dirname, 'node_modules', fullPkgName, 'bin', target.exe);
  }
}

if (!fs.existsSync(binPath)) {
  console.error(\`Error: CanIReach binary not found. Please try re-installing the package.\`);
  process.exit(1);
}

const result = spawnSync(binPath, process.argv.slice(2), {
  stdio: 'inherit',
  windowsHide: true,
});

process.exit(result.status ?? 0);
`;

  fs.writeFileSync(path.join(binDir, 'launcher.js'), launcherCode, 'utf8');
  
  // Write package.json
  const optionalDependencies = {};
  for (const plat of PLATFORMS) {
    const depName = `${BASE_NAME}-${plat.pkgSuffix}`;
    const fullDepName = SCOPE ? `${SCOPE}/${depName}` : depName;
    optionalDependencies[fullDepName] = version;
  }
  
  const packageJson = {
    name: fullPkgName,
    version: version,
    description: 'Local-first, zero-telemetry network diagnostics and reachability monitoring console CLI.',
    bin: {
      canireach: 'bin/launcher.js'
    },
    optionalDependencies: optionalDependencies,
    publishConfig: {
      access: 'public'
    }
  };
  
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify(packageJson, null, 2) + '\n',
    'utf8'
  );
  
  // Copy LICENSE and README
  const licensePath = path.join(ROOT_DIR, 'LICENSE');
  if (fs.existsSync(licensePath)) {
    fs.copyFileSync(licensePath, path.join(pkgDir, 'LICENSE'));
  }
  
  const readmePath = path.join(ROOT_DIR, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.copyFileSync(readmePath, path.join(pkgDir, 'README.md'));
  }
  
  console.log(`Created launcher package: ${fullPkgName}`);
}

const args = process.argv.slice(2);
let binariesDir = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--binaries-dir' && args[i + 1]) {
    binariesDir = path.resolve(args[i + 1]);
  }
}

if (!binariesDir) {
  console.error('Error: Please provide --binaries-dir <path>');
  process.exit(1);
}

const version = getVersion();
cleanAndPrepare();
buildPlatformPackages(version, binariesDir);
buildLauncherPackage(version);

console.log('✅ NPM packaging build complete!');
