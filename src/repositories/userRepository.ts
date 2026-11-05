import type pg from 'pg';
import { mapPgError } from '../errors/pg.js';
import { placeholderDisplayName, uniqueIds } from '../domain/ids.js';
import type { UserStore } from '../stores/userStore.js';
import type { User } from '../types.js';

interface UserRow {
  id: string;
  display_name: string;
  email: string | null;
  created_at: Date;
  updated_at: Date;
}

export class PgUserRepository implements UserStore {
  constructor(private readonly pool: pg.Pool) {}

  async findById(id: string): Promise<User | null> {
    try {
      const result = await this.pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
      const row = result.rows[0];
      return row ? mapUser(row) : null;
    } catch (err) {
      throw mapPgError(err);
    }
  }

  async insert(input: { id: string; displayName: string; email: string | null }): Promise<User> {
    try {
      const result = await this.pool.query<UserRow>(
        `INSERT INTO users (id, display_name, email)
         VALUES ($1, $2, $3)
         RETURNING id, display_name, email, created_at, updated_at`,
        [input.id, input.displayName, input.email],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error('Insert did not return a user');
      }
      return mapUser(row);
    } catch (err) {
      throw mapPgError(err);
    }
  }

  async update(input: { id: string; displayName: string; email: string | null }): Promise<User> {
    try {
      const result = await this.pool.query<UserRow>(
        `UPDATE users
         SET display_name = $2, email = $3, updated_at = now()
         WHERE id = $1
         RETURNING id, display_name, email, created_at, updated_at`,
        [input.id, input.displayName, input.email],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error('Update did not return a user');
      }
      return mapUser(row);
    } catch (err) {
      throw mapPgError(err);
    }
  }

  async insertIfMissing(ids: readonly string[]): Promise<void> {
    const unique = uniqueIds(ids);
    if (unique.length === 0) {
      return;
    }
    try {
      await this.pool.query(
        `INSERT INTO users (id, display_name)
         SELECT * FROM UNNEST($1::text[], $2::text[]) AS seed(id, display_name)
         ON CONFLICT (id) DO NOTHING`,
        [unique, unique.map((id) => placeholderDisplayName(id))],
      );
    } catch (err) {
      throw mapPgError(err);
    }
  }
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
