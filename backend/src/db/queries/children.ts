import { getDatabase, queryToObjects, queryToObject } from '../connection.js';
import type { Child } from '../../types.js';

export function getAllChildren(): Child[] {
  const db = getDatabase();
  const result = db.exec('SELECT * FROM children');
  return queryToObjects<Child>(result);
}

export function getChildById(id: number): Child | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM children WHERE id = ?');
  stmt.bind([id]);
  const results: any[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({ columns: Object.keys(row), values: [Object.values(row)] });
  }
  stmt.free();
  return queryToObject<Child>(results);
}

export function getChildrenByHouseId(houseId: number): Child[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM children WHERE house_id = ?');
  stmt.bind([houseId]);
  const results: any[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({ columns: Object.keys(row), values: [Object.values(row)] });
  }
  stmt.free();
  return queryToObjects<Child>(results);
}

export function getChildByUserId(userId: number): Child | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM children WHERE user_id = ?');
  stmt.bind([userId]);
  const results: any[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({ columns: Object.keys(row), values: [Object.values(row)] });
  }
  stmt.free();
  return queryToObject<Child>(results);
}
