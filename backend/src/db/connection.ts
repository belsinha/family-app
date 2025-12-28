import type { Database } from 'sql.js';
import { config } from '../config.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve database path relative to backend directory (where this file is located)
// If config.databasePath is relative, resolve it from the backend directory
const dbPath = path.isAbsolute(config.databasePath) 
  ? config.databasePath 
  : path.resolve(__dirname, '..', config.databasePath);
const dbDir = path.dirname(dbPath);

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db: Database | null = null;
let SQL: { Database: new (data?: Uint8Array) => Database } | null = null;

export async function initDatabaseConnection(): Promise<Database> {
  if (db) {
    return db;
  }

  // Dynamic import to handle workspace module resolution
  // For sql.js in Node.js ESM, we need to resolve from workspace root
  // since node_modules is hoisted to the root in npm workspaces
  let initSqlJs: any;
  
  // Try multiple paths: workspace root (monorepo) and current working directory (Render)
  const workspaceRoot = path.resolve(__dirname, '../../..');
  const cwdRoot = process.cwd();
  const possiblePaths = [
    path.join(workspaceRoot, 'node_modules', 'sql.js', 'dist', 'sql-wasm.js'),
    path.join(cwdRoot, 'node_modules', 'sql.js', 'dist', 'sql-wasm.js'),
  ];
  
  let sqlJsPath: string | null = null;
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      sqlJsPath = possiblePath;
      break;
    }
  }
  
  try {
    // Try importing from the resolved file path using file URL
    if (sqlJsPath) {
      const sqlJsUrl = pathToFileURL(sqlJsPath).href;
      const sqlJsModule = await import(sqlJsUrl);
      initSqlJs = sqlJsModule.default || sqlJsModule;
    } else {
      // Fallback: Try package import (might work if module resolution finds it)
      try {
        const sqlJsModule = await import('sql.js/dist/sql-wasm.js');
        initSqlJs = sqlJsModule.default || sqlJsModule;
      } catch (error2) {
        throw new Error(`sql.js WASM file not found in any of: ${possiblePaths.join(', ')} and package import also failed: ${error2 instanceof Error ? error2.message : String(error2)}`);
      }
    }
  } catch (error1) {
    throw new Error(`Failed to import sql.js: ${error1 instanceof Error ? error1.message : String(error1)}`);
  }
  
  // sql.js in Node.js - download WASM file if not present locally
  // Use the same directory where sql-wasm.js was found, or fallback to cwd
  const wasmDir = sqlJsPath 
    ? path.dirname(sqlJsPath)
    : path.join(cwdRoot, 'node_modules', 'sql.js', 'dist');
  const wasmPath = path.join(wasmDir, 'sql-wasm.wasm');
  
  // If WASM doesn't exist, download it
  if (!fs.existsSync(wasmPath)) {
    console.log('Downloading sql.js WASM file...');
    try {
      const response = await fetch('https://sql.js.org/dist/sql-wasm.wasm');
      if (!response.ok) {
        throw new Error(`Failed to download WASM: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Ensure directory exists
      if (!fs.existsSync(wasmDir)) {
        fs.mkdirSync(wasmDir, { recursive: true });
      }
      
      fs.writeFileSync(wasmPath, buffer);
      console.log('WASM file downloaded successfully');
    } catch (error) {
      console.error('Failed to download WASM file:', error);
      throw new Error('Could not initialize sql.js - WASM file not available');
    }
  }

  SQL = await initSqlJs({
    locateFile: () => wasmPath
  });

  if (!SQL) {
    throw new Error('Failed to initialize SQL.js');
  }

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  return db;
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabaseConnection() first.');
  }
  return db;
}

export function saveDatabase(): void {
  if (!db) {
    throw new Error('Database not initialized.');
  }
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    // Ensure directory exists before writing
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    fs.writeFileSync(dbPath, buffer);
    console.log(`Database saved to: ${dbPath}`);
  } catch (error) {
    console.error(`Failed to save database to ${dbPath}:`, error);
    throw error;
  }
}

// Helper function to convert sql.js results to objects
export function queryToObjects<T>(results: any[]): T[] {
  if (!results || results.length === 0) {
    return [];
  }

  const columns = results[0].columns;
  const values = results[0].values;

  return values.map((row: any[]) => {
    const obj: any = {};
    columns.forEach((col: string, index: number) => {
      obj[col] = row[index];
    });
    return obj as T;
  });
}

// Helper function to get single object
export function queryToObject<T>(results: any[]): T | null {
  const objects = queryToObjects<T>(results);
  return objects.length > 0 ? objects[0] : null;
}
