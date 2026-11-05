import pg from 'pg';
import { logger } from '../lib/logger.js';

const { Pool } = pg;

export function createPool(databaseUrl: string): pg.Pool {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    application_name: 'chat-backend',
  });
  pool.on('error', (err) => {
    logger.error({ err }, 'unexpected postgres client error');
  });
  pool.on('connect', (client) => {
    client.query("SET TIME ZONE 'UTC'").catch((err: unknown) => {
      logger.error({ err }, 'failed to set postgres time zone');
    });
  });
  return pool;
}
