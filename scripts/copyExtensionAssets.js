const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src/extension');
const destDir = path.join(__dirname, '../jw-subtitle-tester');

const filesToCopy = [
  'popup.html',
  'popup.css',
  'guide.html',
  'guide.js',
  'manifest.json'
];

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

filesToCopy.forEach(file => {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(destDir, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${file} to jw-subtitle-tester/`);
  } else {
    console.warn(`Warning: Source file ${srcPath} does not exist.`);
  }
});
