const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src/extension');
const chromeDestDir = path.join(__dirname, '../jw-subtitle-tester');
const firefoxDestDir = path.join(__dirname, '../jw-subtitle-tester-firefox');

const filesToCopy = [
  'popup.html',
  'popup.css',
  'guide.html',
  'guide.js'
];

// Helper to recursively copy directories
function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  fs.readdirSync(from).forEach(element => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    const stat = fs.lstatSync(fromPath);
    if (stat.isFile()) {
      fs.copyFileSync(fromPath, toPath);
    } else if (stat.isDirectory()) {
      copyFolderSync(fromPath, toPath);
    }
  });
}

// 1. Ensure destination directories exist
if (!fs.existsSync(chromeDestDir)) {
  fs.mkdirSync(chromeDestDir, { recursive: true });
}
if (!fs.existsSync(firefoxDestDir)) {
  fs.mkdirSync(firefoxDestDir, { recursive: true });
}

// 2. Copy static files to Chrome destination
filesToCopy.forEach(file => {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(chromeDestDir, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${file} to jw-subtitle-tester/`);
  } else {
    console.warn(`Warning: Source file ${srcPath} does not exist.`);
  }
});

// 3. Process Manifests
const manifestPath = path.join(srcDir, 'manifest.json');
const packageJsonPath = path.join(__dirname, '../package.json');
if (fs.existsSync(manifestPath)) {
  const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);

  // Sync version with package.json
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    manifest.version = packageJson.version;
  }

  // Generate Chrome Manifest (Remove scripts fallback & browser_specific_settings)
  const chromeManifest = JSON.parse(JSON.stringify(manifest));
  if (chromeManifest.background) {
    delete chromeManifest.background.scripts;
  }
  delete chromeManifest.browser_specific_settings;

  fs.writeFileSync(
    path.join(chromeDestDir, 'manifest.json'),
    JSON.stringify(chromeManifest, null, 2),
    'utf8'
  );
  console.log('Generated Chrome manifest.json in jw-subtitle-tester/');

  // Generate Firefox Manifest (Keep fallback & browser_specific_settings)
  fs.writeFileSync(
    path.join(firefoxDestDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );
  console.log('Generated Firefox manifest.json in jw-subtitle-tester-firefox/');
} else {
  console.error('Error: Source manifest.json not found!');
}

// 4. Copy all compiled/static files from Chrome build folder to Firefox build folder
console.log('Copying assets from jw-subtitle-tester to jw-subtitle-tester-firefox...');
fs.readdirSync(chromeDestDir).forEach(element => {
  if (element === 'manifest.json') return; // Skip manifest since we wrote a custom one
  const srcPath = path.join(chromeDestDir, element);
  const destPath = path.join(firefoxDestDir, element);
  const stat = fs.lstatSync(srcPath);
  if (stat.isFile()) {
    fs.copyFileSync(srcPath, destPath);
  } else if (stat.isDirectory()) {
    copyFolderSync(srcPath, destPath);
  }
});
console.log('Firefox build sync completed.');
