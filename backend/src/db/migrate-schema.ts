import { getDatabase, saveDatabase } from './connection.js';

export function migrateSchema() {
  const db = getDatabase();
  let migrated = false;
  
  // Check if password_hash column exists
  try {
    const result = db.exec("PRAGMA table_info(users)");
    const columns = result[0]?.values || [];
    const hasPasswordHash = columns.some((col: any[]) => col[1] === 'password_hash');
    
    if (!hasPasswordHash) {
      console.log('Adding password_hash column to users table...');
      db.run('ALTER TABLE users ADD COLUMN password_hash TEXT');
      saveDatabase();
      console.log('password_hash column added successfully');
      migrated = true;
    }
  } catch (error) {
    console.error('Error checking/migrating users schema:', error);
    throw error;
  }

  // Check if parent_id column exists in points table
  try {
    const result = db.exec("PRAGMA table_info(points)");
    const columns = result[0]?.values || [];
    const hasParentId = columns.some((col: any[]) => col[1] === 'parent_id');
    
    if (!hasParentId) {
      console.log('Adding parent_id column to points table...');
      db.run('ALTER TABLE points ADD COLUMN parent_id INTEGER');
      saveDatabase();
      console.log('parent_id column added successfully');
      migrated = true;
    }
  } catch (error) {
    console.error('Error checking/migrating points schema:', error);
    throw error;
  }
  
  return migrated;
}

