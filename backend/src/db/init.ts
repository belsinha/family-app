import { initDatabaseConnection, getDatabase, saveDatabase } from './connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { seedDatabase } from './seed.js';
import { migratePasswords } from './migrate.js';
import { migrateSchema } from './migrate-schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve schema.sql path
// In production, __dirname is backend/dist/db, so we need to go to backend/src/db/schema.sql
// In development with tsx, __dirname is backend/src/db, so schema.sql is in the same directory
function resolveSchemaPath(): string {
  // Try dist/db first (if file was copied there)
  const distPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(distPath)) {
    return distPath;
  }
  
  // Otherwise, go up to backend root and into src/db
  // __dirname is either backend/dist/db or backend/src/db
  // Go up to backend root, then into src/db
  const backendRoot = path.resolve(__dirname, '../..');
  const srcPath = path.join(backendRoot, 'src', 'db', 'schema.sql');
  
  if (fs.existsSync(srcPath)) {
    return srcPath;
  }
  
  // Fallback: try same directory (for development)
  return distPath;
}

const schemaPath = resolveSchemaPath();

export async function initDatabase() {
  console.log('Initializing database...');
  console.log('Schema path:', schemaPath);
  console.log('Schema file exists:', fs.existsSync(schemaPath));
  
  await initDatabaseConnection();
  const db = getDatabase();
  
  // Read and execute schema
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at: ${schemaPath}`);
  }
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.run(schema);
  
  console.log('Database schema initialized');
  
  // Migrate schema if needed (add missing columns)
  migrateSchema();
  
  // Check if database is empty and seed if needed
  const result = db.exec("SELECT COUNT(*) as count FROM houses");
  const houseCount = result.length > 0 && result[0].values.length > 0 
    ? result[0].values[0][0] as number 
    : 0;
  
  if (houseCount === 0) {
    console.log('Database is empty, seeding data...');
    await seedDatabase();
    saveDatabase();
    console.log('Seed data created');
  } else {
    console.log('Database already contains data, skipping seed');
    // Migrate existing users to have passwords
    await migratePasswords();
  }
  
  saveDatabase();
}
