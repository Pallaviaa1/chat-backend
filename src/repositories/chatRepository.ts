import { createHash, randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { execute, queryRows, type Db } from '../db/pool.js';
import { AppError } from '../errors/AppError.js';
import { mapDbError } from '../errors/dbError.js';
import type { ChatStore } from '../stores/chatStore.js';
import type { Chat, ChatSummary, ChatType, Member, Role } from '../types.js';

interface ChatMemberRow extends RowDataPacket {
  id: string;
  type: string;
  title: string | null;
  direct_key: string | null;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  user_id: string;
  role: string;
  joined_at: Date | string;
}

interface SummaryRow extends RowDataPacket {
  id: string;
  type: string;
  title: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  member_ids: string | null;
}

interface LockRow extends RowDataPacket {
  acquired: number | null;
}

export class MysqlChatRepository implements ChatStore {
  constructor(private readonly pool: Db) {}

  async createOrGetDirect(input: {
    directKey: string;
    createdBy: string;
    memberIds: [string, string];
  }): Promise<{ chat: Chat; created: boolean }> {
    const connection = await this.connection();
    const lock = lockName(input.directKey);
    let locked = false;
    let started = false;
    try {
      const rows = await queryRows<LockRow>(connection, 'SELECT GET_LOCK(?, 10) AS acquired', [lock]);
      if (rows[0]?.acquired !== 1) {
        throw new AppError(503, 'CHAT_CREATE_BUSY', 'Could not lock the direct chat pair');
      }
      locked = true;
      await connection.beginTransaction();
      started = true;

      const existing = await queryRows<RowDataPacket & { id: string }>(
        connection,
        'SELECT id FROM chats WHERE direct_key = ?',
        [input.directKey],
      );
      const existingId = existing[0]?.id;
      if (existingId) {
        const chat = await this.findByIdOn(connection, existingId);
        if (!chat) {
          throw new AppError(500, 'CHAT_CREATE_FAILED', 'Direct chat could not be loaded');
        }
        await connection.commit();
        started = false;
        return { chat, created: false };
      }

      const id = randomUUID();
      await execute(
        connection,
        `INSERT INTO chats (id, type, title, direct_key, created_by)
         VALUES (?, 'direct', NULL, ?, ?)`,
        [id, input.directKey, input.createdBy],
      );
      await execute(
        connection,
        `INSERT INTO chat_members (chat_id, user_id, role)
         VALUES (?, ?, 'member'), (?, ?, 'member')`,
        [id, input.memberIds[0], id, input.memberIds[1]],
      );
      const chat = await this.findByIdOn(connection, id);
      if (!chat) {
        throw new AppError(500, 'CHAT_CREATE_FAILED', 'Direct chat could not be loaded');
      }
      await connection.commit();
      started = false;
      return { chat, created: true };
    } catch (err) {
      if (started) {
        await connection.rollback();
      }
      throw mapDbError(err);
    } finally {
      if (locked) {
        await connection.query('SELECT RELEASE_LOCK(?)', [lock]).catch(() => undefined);
      }
      connection.release();
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
    const connection = await this.connection();
    let started = false;
    try {
      await connection.beginTransaction();
      started = true;
      const id = randomUUID();
      await execute(
        connection,
        `INSERT INTO chats (id, type, title, direct_key, created_by)
         VALUES (?, 'group', ?, NULL, ?)`,
        [id, input.title, input.createdBy],
      );
      const placeholders = input.members.map(() => '(?, ?, ?)').join(', ');
      const params = input.members.flatMap((member) => [id, member.userId, member.role]);
      await execute(
        connection,
        `INSERT INTO chat_members (chat_id, user_id, role) VALUES ${placeholders}`,
        params,
      );
      const chat = await this.findByIdOn(connection, id);
      if (!chat) {
        throw new AppError(500, 'CHAT_CREATE_FAILED', 'Group chat could not be loaded');
      }
      await connection.commit();
      started = false;
      return chat;
    } catch (err) {
      if (started) {
        await connection.rollback();
      }
      throw mapDbError(err);
    } finally {
      connection.release();
    }
  }

  async findById(id: string): Promise<Chat | null> {
    try {
      return await this.findByIdOn(this.pool, id);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  async listForUser(userId: string): Promise<ChatSummary[]> {
    try {
      const rows = await queryRows<SummaryRow>(
        this.pool,
        `SELECT c.id, c.type, c.title, c.created_at, c.updated_at,
                GROUP_CONCAT(m.user_id ORDER BY m.joined_at ASC, m.user_id ASC) AS member_ids
         FROM chats c
         INNER JOIN chat_members me ON me.chat_id = c.id AND me.user_id = ?
         INNER JOIN chat_members m ON m.chat_id = c.id
         GROUP BY c.id
         ORDER BY c.updated_at DESC, c.id DESC`,
        [userId],
      );
      return rows.map((row) => ({
        id: row.id,
        type: asChatType(row.type),
        title: row.title,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        memberIds: row.member_ids ? row.member_ids.split(',') : [],
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  async addMember(chatId: string, userId: string, role: Role): Promise<'added' | 'exists'> {
    try {
      const result = await execute(
        this.pool,
        `INSERT INTO chat_members (chat_id, user_id, role)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = chat_members.user_id`,
        [chatId, userId, role],
      );
      if (result.affectedRows > 0) {
        await this.touch(chatId);
        return 'added';
      }
      return 'exists';
    } catch (err) {
      throw mapDbError(err);
    }
  }

  async removeMember(chatId: string, userId: string): Promise<void> {
    try {
      const result = await execute(
        this.pool,
        'DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?',
        [chatId, userId],
      );
      if (result.affectedRows === 0) {
        throw new AppError(404, 'MEMBER_NOT_FOUND', 'Chat member not found');
      }
      await this.touch(chatId);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  async updateTitle(chatId: string, title: string): Promise<void> {
    try {
      const result = await execute(
        this.pool,
        `UPDATE chats
         SET title = ?, updated_at = UTC_TIMESTAMP(3)
         WHERE id = ? AND type = 'group'`,
        [title, chatId],
      );
      if (result.affectedRows === 0) {
        throw new AppError(404, 'CHAT_NOT_FOUND', 'Group chat not found');
      }
    } catch (err) {
      throw mapDbError(err);
    }
  }

  async touch(chatId: string): Promise<void> {
    try {
      await execute(this.pool, 'UPDATE chats SET updated_at = UTC_TIMESTAMP(3) WHERE id = ?', [chatId]);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  private async connection(): Promise<PoolConnection> {
    if (!isPool(this.pool)) {
      throw new Error('MySQL pool is required for transactions');
    }
    return this.pool.getConnection();
  }

  private async findByIdOn(db: Db, id: string): Promise<Chat | null> {
    const rows = await queryRows<ChatMemberRow>(
      db,
      `SELECT c.id, c.type, c.title, c.direct_key, c.created_by, c.created_at, c.updated_at,
              m.user_id, m.role, m.joined_at
       FROM chats c
       INNER JOIN chat_members m ON m.chat_id = c.id
       WHERE c.id = ?
       ORDER BY m.joined_at ASC, m.user_id ASC`,
      [id],
    );
    const first = rows[0];
    if (!first) {
      return null;
    }
    const members: Member[] = rows.map((row) => ({
      userId: row.user_id,
      role: asRole(row.role),
      joinedAt: toIso(row.joined_at),
    }));
    return {
      id: first.id,
      type: asChatType(first.type),
      title: first.title,
      directKey: first.direct_key,
      createdBy: first.created_by,
      createdAt: toIso(first.created_at),
      updatedAt: toIso(first.updated_at),
      members,
    };
  }
}

function isPool(db: Db): db is Exclude<Db, PoolConnection> {
  return 'getConnection' in db;
}

function lockName(directKey: string): string {
  return createHash('sha256').update(directKey).digest('hex');
}

function toIso(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(500, 'INVALID_TIMESTAMP', 'Stored timestamp is invalid');
  }
  return parsed.toISOString();
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
