import { getDatabase, saveDatabase } from './connection.js';
import { hashPassword } from '../utils/auth.js';

/**
 * Legacy SQLite dev seeder — superseded by seed-supabase.ts, which is what the app actually
 * boots against (see server.ts / db/init-supabase.ts). Kept around only for local
 * experimentation with the old sql.js backend, so it's hard-gated out of production rather
 * than deleted outright.
 */
export async function seedDatabase() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'seed.ts (legacy SQLite dev seeder) must not run in production. It seeds a shared ' +
        'default parent password and is not wired into the app\'s normal boot path — see ' +
        'seed-supabase.ts for the production seeder.'
    );
  }

  const db = getDatabase();

  const houses = [
    'Campo Bom',
    'Morro Grande 149',
    'Morro Grande 177',
    'Tubarao',
    'Brooksville',
    'Terrenos'
  ];

  const houseIds: { [key: string]: number } = {};

  // Insert houses
  for (const houseName of houses) {
    db.run('INSERT INTO houses (name) VALUES (?)', [houseName]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    if (result.length > 0 && result[0].values.length > 0) {
      houseIds[houseName] = result[0].values[0][0] as number;
    }
  }

  // Insert parents with passwords (default password: "password")
  const parentHouseId = houseIds['Campo Bom'] || houseIds[houses[0]];
  const parentPassword = await hashPassword('password');
  
  db.run('INSERT INTO users (name, role, house_id, password_hash) VALUES (?, ?, ?, ?)', 
    ['Rommel', 'parent', parentHouseId, parentPassword]);
  
  const rommelResult = db.exec('SELECT last_insert_rowid() as id');
  const rommelId = rommelResult.length > 0 && rommelResult[0].values.length > 0 
    ? rommelResult[0].values[0][0] as number 
    : null;
  
  db.run('INSERT INTO users (name, role, house_id, password_hash) VALUES (?, ?, ?, ?)', 
    ['Celiane', 'parent', parentHouseId, parentPassword]);
  
  const celianeResult = db.exec('SELECT last_insert_rowid() as id');
  const celianeId = celianeResult.length > 0 && celianeResult[0].values.length > 0 
    ? celianeResult[0].values[0][0] as number 
    : null;

  // Insert children with passwords (default password: their name lowercase)
  const children = [
    { name: 'Isabel', houseId: parentHouseId },
    { name: 'Nicholas', houseId: parentHouseId },
    { name: 'Laura', houseId: parentHouseId }
  ];

  for (const child of children) {
    const childPassword = await hashPassword(child.name.toLowerCase());
    db.run('INSERT INTO users (name, role, house_id, password_hash) VALUES (?, ?, ?, ?)', 
      [child.name, 'child', child.houseId, childPassword]);
    const userResult = db.exec('SELECT last_insert_rowid() as id');
    const childUserId = userResult.length > 0 && userResult[0].values.length > 0 
      ? userResult[0].values[0][0] as number 
      : null;
    
    if (childUserId) {
      db.run('INSERT INTO children (name, user_id, house_id) VALUES (?, ?, ?)', [child.name, childUserId, child.houseId]);
    }
  }
  
  saveDatabase();
}
