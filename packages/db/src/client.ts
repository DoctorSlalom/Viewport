import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

function createDb() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = neon(url);
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof createDb>;

// Lazy singleton — the first import that calls db() creates the connection.
let _db: Db | undefined;
export function db(): Db {
  _db ??= createDb();
  return _db;
}
