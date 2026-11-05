import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { AppError } from '../errors/AppError.js';
import { mapPgError } from '../errors/pg.js';
import type { ChatStore } from '../stores/chatStore.js';
import type { Chat, ChatSummary, ChatType, Member, Role } from '../types.js';

interface ChatMemberRow {
  id: string;
  type: string;
  title: string | null;
  direct_key: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  user_id: string;
  role: string;
  joined_at: Date;
}

interface SummaryRow {
  id: string;
  type: string;
  title: string | null;
  created_at: Date;
  updated_at: Date;
  member_ids: string[];
}

type Db = pg.Pool | pg.PoolClient;

export class PgChatRepository implements ChatStore {
  constructor(private readonly pool: pg.Pool) {}

  async createOrGetDirect(input: {
    directKey: string;
    createdBy: string;
    memberIds: [string, string];
  }): Promise<{ chat: Chat; created: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize creators of the same pair. hashtext is int4; the lock takes bigint.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [input.directKey]);

      const existing = await client.query<{ id: string }>(
        'SELECT id FROM chats WHERE direct_key = $1',
        [input.directKey],
      );
      const existingId = existing.rows[0]?.id;
      if (existingId) {
        const chat = await this.findByIdOn(client, existingId);
        if (!chat) {
          throw new AppError(500, 'CHAT_CREATE_FAILED', 'Direct chat could not be loaded');
        }
        await client.query('COMMIT');
        return { chat, created: false };
      }

      const id = randomUUID();
      await client.query(
        `INSERT INTO chats (id, type, title, direct_key, created_by)
         VALUES ($1, 'direct', NULL, $2, $3)`,
        [id, input.directKey, input.createdBy],
      );
      await client.query(
        `INSERT INTO chat_members (chat_id, user_id, role)
         VALUES ($1, $2, 'member'), ($1, $3, 'member')`,
        [id, input.memberIds[0], input.memberIds[1]],
      );
      const chat = await this.findByIdOn(client, id);
      if (!chat) {
        throw new AppError(500, 'CHAT_CREATE_FAILED', 'Direct chat could not be loaded');
      }
      await client.query('COMMIT');
      return { chat, created: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw mapPgError(err);
    } finally {
      client.release();
    }
  }

  async insertGroup(input: {
    title: string;
    createdBy: string;
    members: { userId: string; role: Role }[];
  }): Promise<Chat> {
    if (input.members.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'A group needs at least one member');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const id = randomUUID();
      await client.query(
        `INSERT INTO chats (id, type, title, direct_key, created_by)
         VALUES ($1, 'group', $2, NULL, $3)`,
        [id, input.title, input.createdBy],
      );

      const params: unknown[] = [];
      const values = input.members.map((member, index) => {
        const base = index * 3;
        params.push(id, member.userId, member.role);
        return `($${base + 1}, $${base + 2}, $${base + 3})`;
      });
      await client.query(
        `INSERT INTO chat_members (chat_id, user_id, role) VALUES ${values.join(', ')}`,
        params,
      );

      const chat = await this.findByIdOn(client, id);
      if (!chat) {
        throw new AppError(500, 'CHAT_CREATE_FAILED', 'Group chat could not be loaded');
      }
      await client.query('COMMIT');
      return chat;
    } catch (err) {
      await client.query('ROLLBACK');
      throw mapPgError(err);
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<Chat | null> {
    try {
      return await this.findByIdOn(this.pool, id);
    } catch (err) {
      throw mapPgError(err);
    }
  }

  async listForUser(userId: string): Promise<ChatSummary[]> {
    try {
      const result = await this.pool.query<SummaryRow>(
        `SELECT c.id, c.type, c.title, c.created_at, c.updated_at,
                array_agg(m.user_id ORDER BY m.joined_at ASC, m.user_id ASC) AS member_ids
         FROM chats c
         INNER JOIN chat_members me ON me.chat_id = c.id AND me.user_id = $1
         INNER JOIN chat_members m ON m.chat_id = c.id
         GROUP BY c.id
         ORDER BY c.updated_at DESC, c.id DESC`,
        [userId],
      );
      return result.rows.map((row) => ({
        id: row.id,
        type: asChatType(row.type),
        title: row.title,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        memberIds: row.member_ids,
      }));
    } catch (err) {
      throw mapPgError(err);
    }
  }

  async addMember(chatId: string, userId: string, role: Role): Promise<'added' | 'exists'> {
    try {
      const result = await this.pool.query(
        `INSERT INTO chat_members (chat_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (chat_id, user_id) DO NOTHING
         RETURNING user_id`,
        [chatId, userId, role],
      );
      if ((result.rowCount ?? 0) > 0) {
        await this.touch(chatId);
        return 'added';
      }
      return 'exists';
    } catch (err) {
      throw mapPgError(err);
    }
  }

  async removeMember(chatId: string, userId: string): Promise<void> {
    try {
      const result = await this.pool.query(
        'DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2',
        [chatId, userId],
      );
      if ((result.rowCount ?? 0) === 0) {
        throw new AppError(404, 'MEMBER_NOT_FOUND', 'Chat member not found');
      }
      await this.touch(chatId);
    } catch (err) {
      throw mapPgError(err);
    }
  }

  async updateTitle(chatId: string, title: string): Promise<void> {
    try {
      const result = await this.pool.query(
        `UPDATE chats
         SET title = $2, updated_at = now()
         WHERE id = $1 AND type = 'group'`,
        [chatId, title],
      );
      if ((result.rowCount ?? 0) === 0) {
        throw new AppError(404, 'CHAT_NOT_FOUND', 'Group chat not found');
      }
    } catch (err) {
      throw mapPgError(err);
    }
  }

  async touch(chatId: string): Promise<void> {
    try {
      await this.pool.query('UPDATE chats SET updated_at = now() WHERE id = $1', [chatId]);
    } catch (err) {
      throw mapPgError(err);
    }
  }

  private async findByIdOn(db: Db, id: string): Promise<Chat | null> {
    const result = await db.query<ChatMemberRow>(
      `SELECT c.id, c.type, c.title, c.direct_key, c.created_by, c.created_at, c.updated_at,
              m.user_id, m.role, m.joined_at
       FROM chats c
       INNER JOIN chat_members m ON m.chat_id = c.id
       WHERE c.id = $1
       ORDER BY m.joined_at ASC, m.user_id ASC`,
      [id],
    );
    const first = result.rows[0];
    if (!first) {
      return null;
    }
    const members: Member[] = result.rows.map((row) => ({
      userId: row.user_id,
      role: asRole(row.role),
      joinedAt: row.joined_at.toISOString(),
    }));
    return {
      id: first.id,
      type: asChatType(first.type),
      title: first.title,
      directKey: first.direct_key,
      createdBy: first.created_by,
      createdAt: first.created_at.toISOString(),
      updatedAt: first.updated_at.toISOString(),
      members,
    };
  }
}

function asChatType(value: string): ChatType {
  if (value === 'direct' || value === 'group') {
    return value;
  }
  throw new AppError(500, 'INVALID_CHAT_TYPE', 'Stored chat type is invalid');
}

function asRole(value: string): Role {
  if (value === 'owner' || value === 'admin' || value === 'member') {
    return value;
  }
  throw new AppError(500, 'INVALID_ROLE', 'Stored member role is invalid');
}
