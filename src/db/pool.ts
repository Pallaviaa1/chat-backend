import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';

export type Db = Pool | PoolConnection;

export function createPool(databaseUrl: string): Pool {
  const pool = mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 10,
    timezone: 'Z',
    charset: 'utf8mb4',
    waitForConnections: true,
    enableKeepAlive: true,
  });
  pool.on('connection', (connection) => {
    connection.query("SET time_zone = '+00:00'");
    connection.query('SET SESSION group_concat_max_len = 100000');
  });
  return pool;
}

export async function queryRows<T extends RowDataPacket>(
  db: Db,
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const [rows] = await db.query<T[]>(sql, params as never);
  return rows;
}

export async function execute(
  db: Db,
  sql: string,
  params: readonly unknown[] = [],
): Promise<ResultSetHeader> {
  const [result] = await db.query<ResultSetHeader>(sql, params as never);
  return result;
}
