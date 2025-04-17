import fs from 'fs';
import path from 'path';

const sourceDir = path.join(import.meta.dirname, '..');
const targetDir = path.join(import.meta.dirname, '..', 'build', 'Release');

// Ensure target directory exists
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Find and copy .node files
fs.readdirSync(sourceDir).forEach((file) => {
  if (
    file.endsWith('.node') ||
    file.endsWith('.dll') ||
    file.endsWith('.dylib')
  ) {
    const sourceFile = path.join(sourceDir, file);
    const targetFile = path.join(targetDir, file);
    fs.copyFileSync(sourceFile, targetFile);
    fs.unlinkSync(sourceFile);
  }
});

console.log('Files have been copied successfully.');
