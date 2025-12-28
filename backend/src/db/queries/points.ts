import { getDatabase, queryToObjects, queryToObject, saveDatabase } from '../connection.js';
import type { Point, PointType } from '../../types.js';

export function addPoints(
  childId: number,
  points: number,
  type: PointType,
  reason?: string,
  parentId?: number
): Point {
  const db = getDatabase();
  db.run(
    'INSERT INTO points (child_id, points, type, reason, parent_id) VALUES (?, ?, ?, ?, ?)',
    [childId, points, type, reason || null, parentId || null]
  );
  
  const result = db.exec('SELECT last_insert_rowid() as id');
  const pointId = result.length > 0 && result[0].values.length > 0 
    ? result[0].values[0][0] as number 
    : null;
  
  if (!pointId) {
    throw new Error('Failed to insert point');
  }
  
  const stmt = db.prepare(`
    SELECT 
      p.*,
      u.name as parent_name
    FROM points p
    LEFT JOIN users u ON p.parent_id = u.id
    WHERE p.id = ?
  `);
  stmt.bind([pointId]);
  const results: any[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({ columns: Object.keys(row), values: [Object.values(row)] });
  }
  stmt.free();
  
  const point = queryToObject<Point>(results);
  
  if (!point) {
    throw new Error('Failed to retrieve inserted point');
  }
  
  saveDatabase();
  return point;
}

export function getPointsByChildId(childId: number): Point[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT 
      p.*,
      u.name as parent_name
    FROM points p
    LEFT JOIN users u ON p.parent_id = u.id
    WHERE p.child_id = ?
    ORDER BY p.created_at DESC
  `);
  stmt.bind([childId]);
  const results: any[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({ columns: Object.keys(row), values: [Object.values(row)] });
  }
  stmt.free();
  return queryToObjects<Point>(results);
}

export function getChildBalance(childId: number): { bonus: number; demerit: number; balance: number } {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT 
      COALESCE(SUM(CASE WHEN type = 'bonus' THEN points ELSE 0 END), 0) as bonus,
      COALESCE(SUM(CASE WHEN type = 'demerit' THEN points ELSE 0 END), 0) as demerit
    FROM points
    WHERE child_id = ?
  `);
  stmt.bind([childId]);
  
  let bonus = 0;
  let demerit = 0;
  
  if (stmt.step()) {
    const row = stmt.getAsObject() as { bonus: number; demerit: number };
    bonus = row.bonus || 0;
    demerit = row.demerit || 0;
  }
  
  stmt.free();
  const balance = bonus - demerit;
  return { bonus, demerit, balance };
}

export function getMostRecentPoint(childId: number): Point | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT 
      p.*,
      u.name as parent_name
    FROM points p
    LEFT JOIN users u ON p.parent_id = u.id
    WHERE p.child_id = ? 
    ORDER BY p.created_at DESC, p.id DESC 
    LIMIT 1
  `);
  stmt.bind([childId]);
  const results: any[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({ columns: Object.keys(row), values: [Object.values(row)] });
  }
  stmt.free();
  return queryToObject<Point>(results);
}

export function getPointsByChildIdLast7Days(childId: number): Point[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT 
      p.*,
      u.name as parent_name
    FROM points p
    LEFT JOIN users u ON p.parent_id = u.id
    WHERE p.child_id = ? 
    AND p.created_at >= datetime('now', '-7 days')
    ORDER BY p.created_at DESC
  `);
  stmt.bind([childId]);
  const results: any[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({ columns: Object.keys(row), values: [Object.values(row)] });
  }
  stmt.free();
  return queryToObjects<Point>(results);
}

export function deletePoint(pointId: number): boolean {
  const db = getDatabase();
  
  // First check if the point exists
  const checkStmt = db.prepare('SELECT id FROM points WHERE id = ?');
  checkStmt.bind([pointId]);
  const exists = checkStmt.step();
  checkStmt.free();
  
  if (!exists) {
    return false;
  }
  
  // Delete the point
  const stmt = db.prepare('DELETE FROM points WHERE id = ?');
  stmt.bind([pointId]);
  stmt.step();
  stmt.free();
  
  saveDatabase();
  return true;
}
