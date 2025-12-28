import { getDatabase, queryToObjects, queryToObject } from '../connection.js';
import type { User, Role } from '../../types.js';

export function getAllUsers(): User[] {
  const db = getDatabase();
  const result = db.exec('SELECT * FROM users');
  return queryToObjects<User>(result);
}

export function getUserById(id: number): User | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  stmt.bind([id]);
  const results: any[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({ columns: Object.keys(row), values: [Object.values(row)] });
  }
  stmt.free();
  return queryToObject<User>(results);
}

export function getUsersByRole(role: Role): User[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM users WHERE role = ?');
  stmt.bind([role]);
  const results: any[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({ columns: Object.keys(row), values: [Object.values(row)] });
  }
  stmt.free();
  return queryToObjects<User>(results);
}

export function getUserByName(name: string): (User & { password_hash?: string }) | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM users WHERE name = ?');
  stmt.bind([name]);
  const results: any[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({ columns: Object.keys(row), values: [Object.values(row)] });
  }
  stmt.free();
  const user = queryToObject<User & { password_hash?: string }>(results);
  return user;
}

export function getUserByIdWithPassword(id: number): (User & { password_hash?: string }) | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  stmt.bind([id]);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  
  if (rows.length === 0) {
    return null;
  }
  
  const columns = Object.keys(rows[0]);
  const values = rows.map(row => Object.values(row));
  const results = [{ columns, values }];
  const user = queryToObject<User & { password_hash?: string }>(results);
  return user;
}

export function updateUserPassword(userId: number, passwordHash: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
  stmt.bind([passwordHash, userId]);
  stmt.step();
  stmt.free();
  // For UPDATE statements, step() doesn't reliably indicate success
  // Verify the update by checking if the user exists and password was changed
  const updatedUser = getUserByIdWithPassword(userId);
  return updatedUser !== null && updatedUser.password_hash === passwordHash;
}
