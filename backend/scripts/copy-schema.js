import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcPath = path.resolve(__dirname, '../src/db/schema.sql');
const destPath = path.resolve(__dirname, '../dist/db/schema.sql');

if (fs.existsSync(srcPath)) {
  // Ensure destination directory exists
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  // Copy the file
  fs.copyFileSync(srcPath, destPath);
  console.log('✓ Copied schema.sql to dist/db/');
} else {
  console.warn('⚠ schema.sql not found at:', srcPath);
}





