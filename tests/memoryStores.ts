import { randomUUID } from 'node:crypto';
import { AppError } from '../src/errors/AppError.js';
import { placeholderDisplayName, uniqueIds } from '../src/domain/ids.js';
import { pageMessages } from '../src/domain/pageMessages.js';
import type { ChatStore } from '../src/stores/chatStore.js';
import type { MessageStore } from '../src/stores/messageStore.js';
import type { UserStore } from '../src/stores/userStore.js';
import type { Chat, ChatSummary, Role, StoredMessage, User } from '../src/types.js';

function nowIso(): string {
  return new Date().toISOString();
}

export class MemoryUserStore implements UserStore {
  readonly users = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async insert(input: { id: string; displayName: string; email: string | null }): Promise<User> {
    if (this.users.has(input.id)) {
      throw new AppError(409, 'CONFLICT', 'User already exists');
    }
    if (input.email && [...this.users.values()].some((user) => user.email === input.email)) {
      throw new AppError(409, 'EMAIL_TAKEN', 'Email is already in use');
    }
    const timestamp = nowIso();
    const user: User = {
      id: input.id,
      displayName: input.displayName,
      email: input.email,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.users.set(user.id, user);
    return user;
  }

  async update(input: { id: string; displayName: string; email: string | null }): Promise<User> {
    const existing = this.users.get(input.id);
    if (!existing) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }
    if (
      input.email &&
      [...this.users.values()].some((user) => user.email === input.email && user.id !== input.id)
    ) {
      throw new AppError(409, 'EMAIL_TAKEN', 'Email is already in use');
    }
    const user: User = {
      ...existing,
      displayName: input.displayName,
      email: input.email,
      updatedAt: nowIso(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async insertIfMissing(ids: readonly string[]): Promise<void> {
    for (const id of uniqueIds(ids)) {
      if (!this.users.has(id)) {
        await this.insert({ id, displayName: placeholderDisplayName(id), email: null });
      }
    }
  }
}

export class MemoryChatStore implements ChatStore {
  readonly chats = new Map<string, Chat>();
  touchCount = 0;

  async createOrGetDirect(input: {
    directKey: string;
    createdBy: string;
    memberIds: [string, string];
  }): Promise<{ chat: Chat; created: boolean }> {
    const existing = [...this.chats.values()].find((chat) => chat.directKey === input.directKey);
    if (existing) {
      return { chat: existing, created: false };
    }
    const timestamp = nowIso();
    const chat = this.seed({
      id: randomUUID(),
      type: 'direct',
      title: null,
      directKey: input.directKey,
      createdBy: input.createdBy,
      createdAt: timestamp,
      updatedAt: timestamp,
      members: input.memberIds.map((userId) => ({ userId, role: 'member', joinedAt: timestamp })),
    });
    return { chat, created: true };
  }

  async insertGroup(input: {
    title: string;
    createdBy: string;
    members: { userId: string; role: Role }[];
  }): Promise<Chat> {
    const timestamp = nowIso();
    return this.seed({
      id: randomUUID(),
      type: 'group',
      title: input.title,
      directKey: null,
      createdBy: input.createdBy,
      createdAt: timestamp,
      updatedAt: timestamp,
      members: input.members.map((member) => ({ ...member, joinedAt: timestamp })),
    });
  }

  async findById(id: string): Promise<Chat | null> {
    const chat = this.chats.get(id);
    return chat ? structuredClone(chat) : null;
  }

  async listForUser(userId: string): Promise<ChatSummary[]> {
    return [...this.chats.values()]
      .filter((chat) => chat.members.some((member) => member.userId === userId))
      .sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1))
      .map((chat) => ({
        id: chat.id,
        type: chat.type,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        memberIds: chat.members.map((member) => member.userId),
      }));
  }

  async addMember(chatId: string, userId: string, role: Role): Promise<'added' | 'exists'> {
    const chat = this.require(chatId);
    if (chat.members.some((member) => member.userId === userId)) {
      return 'exists';
    }
    chat.members.push({ userId, role, joinedAt: nowIso() });
    chat.updatedAt = nowIso();
    return 'added';
  }

  async removeMember(chatId: string, userId: string): Promise<void> {
    const chat = this.require(chatId);
    const next = chat.members.filter((member) => member.userId !== userId);
    if (next.length === chat.members.length) {
      throw new AppError(404, 'MEMBER_NOT_FOUND', 'Chat member not found');
    }
    chat.members = next;
    chat.updatedAt = nowIso();
  }

  async updateTitle(chatId: string, title: string): Promise<void> {
    const chat = this.require(chatId);
    if (chat.type !== 'group') {
      throw new AppError(404, 'CHAT_NOT_FOUND', 'Group chat not found');
    }
    chat.title = title;
    chat.updatedAt = nowIso();
  }

  async touch(chatId: string): Promise<void> {
    const chat = this.chats.get(chatId);
    if (chat) {
      chat.updatedAt = nowIso();
    }
    this.touchCount += 1;
  }

  private seed(chat: Chat): Chat {
    this.chats.set(chat.id, chat);
    return chat;
  }

  private require(chatId: string): Chat {
    const chat = this.chats.get(chatId);
    if (!chat) {
      throw new AppError(404, 'CHAT_NOT_FOUND', 'Chat not found');
    }
    return chat;
  }
}

export class MemoryMessageStore implements MessageStore {
  readonly messages: StoredMessage[] = [];
  private readonly lastSeen = new Map<string, { messageId: string; updatedAt: string }>();

  async create(input: { chatId: string; senderId: string; text: string }): Promise<StoredMessage> {
    const message: StoredMessage = {
      id: randomUUID().replaceAll('-', ''),
      chatId: input.chatId,
      senderId: input.senderId,
      text: input.text,
      createdAt: nowIso(),
      editedAt: null,
      deleted: false,
      readBy: [],
    };
    this.messages.push(message);
    return message;
  }

  async findById(chatId: string, messageId: string): Promise<StoredMessage | null> {
    return this.messages.find((message) => message.chatId === chatId && message.id === messageId) ?? null;
  }

  async list(input: { chatId: string; limit: number; before?: string }): Promise<StoredMessage[]> {
    return pageMessages(
      this.messages.filter((message) => message.chatId === input.chatId),
      input.limit,
      input.before,
    );
  }

  async updateText(chatId: string, messageId: string, text: string): Promise<StoredMessage> {
    const message = await this.require(chatId, messageId);
    message.text = text;
    message.editedAt = nowIso();
    return message;
  }

  async softDelete(chatId: string, messageId: string): Promise<StoredMessage> {
    const message = await this.require(chatId, messageId);
    message.text = null;
    message.deleted = true;
    message.editedAt = nowIso();
    return message;
  }

  async markRead(chatId: string, messageId: string, userId: string): Promise<{ readAt: string }> {
    const message = await this.require(chatId, messageId);
    if (!message.readBy.includes(userId)) {
      message.readBy.push(userId);
    }
    return { readAt: nowIso() };
  }

  async setLastSeen(
    chatId: string,
    userId: string,
    messageId: string,
  ): Promise<{ updatedAt: string }> {
    const updatedAt = nowIso();
    this.lastSeen.set(`${chatId}:${userId}`, { messageId, updatedAt });
    return { updatedAt };
  }

  async getLastSeen(
    chatId: string,
    userId: string,
  ): Promise<{ messageId: string; updatedAt: string } | null> {
    return this.lastSeen.get(`${chatId}:${userId}`) ?? null;
  }

  private async require(chatId: string, messageId: string): Promise<StoredMessage> {
    const message = await this.findById(chatId, messageId);
    if (!message) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }
    return message;
  }
}
