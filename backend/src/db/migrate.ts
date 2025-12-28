import { getDatabase, saveDatabase, queryToObjects } from './connection.js';
import { hashPassword } from '../utils/auth.js';
import type { User } from '../../../shared/src/types.js';

export async function migratePasswords() {
  const db = getDatabase();
  
  // Get all users
  const allUsersResult = db.exec('SELECT * FROM users');
  const allUsers = queryToObjects<User & { password_hash?: string }>(allUsersResult);
  
  // Filter users without passwords
  const usersWithoutPasswords = allUsers.filter(
    (user) => !user.password_hash || user.password_hash.trim() === ''
  );

  if (usersWithoutPasswords.length === 0) {
    return;
  }

  console.log(`Found ${usersWithoutPasswords.length} user(s) without passwords, adding default passwords...`);

  // Update each user with a default password
  for (const user of usersWithoutPasswords) {
    let password: string;
    
    if (user.role === 'parent') {
      password = 'password';
    } else if (user.role === 'child') {
      password = user.name.toLowerCase();
    } else {
      password = 'password'; // Default for family or other roles
    }

    const passwordHash = await hashPassword(password);
    const updateStmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    updateStmt.bind([passwordHash, user.id]);
    updateStmt.step();
    updateStmt.free();
    
    console.log(`Added password for user: ${user.name} (${user.role})`);
  }

  saveDatabase();
  console.log('Password migration completed');
}

