import { initDatabaseConnection, getDatabase, saveDatabase } from './connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { seedDatabase } from './seed.js';
import { migratePasswords } from './migrate.js';
import { migrateSchema } from './migrate-schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, 'schema.sql');

export async function initDatabase() {
  console.log('Initializing database...');
  
  await initDatabaseConnection();
  const db = getDatabase();
  
  // Read and execute schema
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
