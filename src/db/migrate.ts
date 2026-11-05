import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { loadEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { execute, queryRows, createPool } from './pool.js';

interface VersionRow extends RowDataPacket {
  version: string;
}

export async function migrate(pool: Pool): Promise<void> {
  await execute(
    pool,
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) NOT NULL,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (version)
    )`,
  );

  const dir = path.resolve(process.cwd(), 'migrations');
  const files = (await readdir(dir))
    .filter((file) => file.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  for (const file of files) {
    const existing = await queryRows<VersionRow>(
      pool,
      'SELECT version FROM schema_migrations WHERE version = ?',
      [file],
    );
    if (existing[0]) {
      continue;
    }

    const sql = await readFile(path.join(dir, file), 'utf8');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const statement of splitSql(sql)) {
        await connection.query(statement);
      }
      await connection.query('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
      await connection.commit();
      logger.info({ version: file }, 'applied migration');
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}

export function splitSql(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
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
