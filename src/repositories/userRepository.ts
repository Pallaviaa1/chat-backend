import type { RowDataPacket } from 'mysql2/promise';
import { mapDbError } from '../errors/dbError.js';
import { placeholderDisplayName, uniqueIds } from '../domain/ids.js';
import { execute, queryRows, type Db } from '../db/pool.js';
import type { UserStore } from '../stores/userStore.js';
import type { User } from '../types.js';

interface UserRow extends RowDataPacket {
  id: string;
  display_name: string;
  email: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export class MysqlUserRepository implements UserStore {
  constructor(private readonly pool: Db) {}

  async findById(id: string): Promise<User | null> {
    try {
      const rows = await queryRows<UserRow>(this.pool, 'SELECT * FROM users WHERE id = ?', [id]);
      const row = rows[0];
      return row ? mapUser(row) : null;
    } catch (err) {
      throw mapDbError(err);
    }
  }

  async insert(input: { id: string; displayName: string; email: string | null }): Promise<User> {
    try {
      await execute(
        this.pool,
        `INSERT INTO users (id, display_name, email)
         VALUES (?, ?, ?)`,
        [input.id, input.displayName, input.email],
      );
      const user = await this.findById(input.id);
      if (!user) {
        throw new Error('Insert did not return a user');
      }
      return user;
    } catch (err) {
      throw mapDbError(err);
    }
  }

  async update(input: { id: string; displayName: string; email: string | null }): Promise<User> {
    try {
      const result = await execute(
        this.pool,
        `UPDATE users
         SET display_name = ?, email = ?, updated_at = UTC_TIMESTAMP(3)
         WHERE id = ?`,
        [input.displayName, input.email, input.id],
      );
      if (result.affectedRows === 0) {
        throw new Error('Update did not return a user');
      }
      const user = await this.findById(input.id);
      if (!user) {
        throw new Error('Update did not return a user');
      }
      return user;
    } catch (err) {
      throw mapDbError(err);
    }
  }

  async insertIfMissing(ids: readonly string[]): Promise<void> {
    const unique = uniqueIds(ids);
    if (unique.length === 0) {
      return;
    }
    const placeholders = unique.map(() => '(?, ?)').join(', ');
    const params = unique.flatMap((id) => [id, placeholderDisplayName(id)]);
    try {
      await execute(
        this.pool,
        `INSERT INTO users (id, display_name)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE id = users.id`,
        params,
      );
    } catch (err) {
      throw mapDbError(err);
    }
  }
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toIso(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Stored timestamp is invalid');
  }
  return parsed.toISOString();
}
