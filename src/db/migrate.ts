import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type pg from 'pg';
import { loadEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { createPool } from './pool.js';

export async function migrate(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const dir = path.resolve(process.cwd(), 'migrations');
  const files = (await readdir(dir))
    .filter((file) => file.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  for (const file of files) {
    const existing = await pool.query<{ version: string }>(
      'SELECT version FROM schema_migrations WHERE version = $1',
      [file],
    );
    if (existing.rows[0]) {
      continue;
    }

    const sql = await readFile(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      logger.info({ version: file }, 'applied migration');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const pool = createPool(env.databaseUrl);
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  main().catch((err: unknown) => {
    logger.error({ err }, 'migration failed');
    process.exit(1);
  });
}
