import { AppError } from '../errors/AppError.js';
import { logger } from '../lib/logger.js';
import type { ChatStore } from '../stores/chatStore.js';
import type { MessageStore } from '../stores/messageStore.js';
import type { Chat, Member, StoredMessage } from '../types.js';

export interface MessageApi {
  send(chatId: string, senderId: string, text: string): Promise<StoredMessage>;
  list(
    chatId: string,
    limit: number,
    before?: string,
  ): Promise<{ messages: StoredMessage[]; nextCursor: string | null }>;
  markRead(chatId: string, messageId: string, userId: string): Promise<{ readAt: string }>;
  updateLastSeen(chatId: string, userId: string, messageId: string): Promise<{ updatedAt: string }>;
  getLastSeen(chatId: string, userId: string): Promise<{ messageId: string; updatedAt: string }>;
  edit(chatId: string, messageId: string, senderId: string, text: string): Promise<StoredMessage>;
  deleteMessage(chatId: string, messageId: string, senderId: string): Promise<StoredMessage>;
}

export class MessageService implements MessageApi {
  constructor(
    private readonly messages: MessageStore,
    private readonly chats: ChatStore,
  ) {}

  async send(chatId: string, senderId: string, text: string): Promise<StoredMessage> {
    const chat = await this.requireChat(chatId);
    this.requireMember(chat, senderId);
    const message = await this.messages.create({ chatId, senderId, text });
    await this.safeTouch(chatId);
    return message;
  }

  async list(
    chatId: string,
    limit: number,
    before?: string,
  ): Promise<{ messages: StoredMessage[]; nextCursor: string | null }> {
    await this.requireChat(chatId);
    const messages = await this.messages.list(
      before === undefined ? { chatId, limit } : { chatId, limit, before },
    );
    const oldest = messages[0];
    const nextCursor = messages.length === limit && oldest ? oldest.createdAt : null;
    return { messages, nextCursor };
  }

  async markRead(chatId: string, messageId: string, userId: string): Promise<{ readAt: string }> {
    const chat = await this.requireChat(chatId);
    this.requireMember(chat, userId);
    await this.requireMessage(chatId, messageId);
    return this.messages.markRead(chatId, messageId, userId);
  }

  async updateLastSeen(
    chatId: string,
    userId: string,
    messageId: string,
  ): Promise<{ updatedAt: string }> {
    const chat = await this.requireChat(chatId);
    this.requireMember(chat, userId);
    await this.requireMessage(chatId, messageId);
    return this.messages.setLastSeen(chatId, userId, messageId);
  }

  async getLastSeen(chatId: string, userId: string): Promise<{ messageId: string; updatedAt: string }> {
    const chat = await this.requireChat(chatId);
    this.requireMember(chat, userId);
    const lastSeen = await this.messages.getLastSeen(chatId, userId);
    if (!lastSeen) {
      throw new AppError(404, 'LAST_SEEN_NOT_FOUND', 'Last seen message is not set');
    }
    return lastSeen;
  }

  async edit(
    chatId: string,
    messageId: string,
    senderId: string,
    text: string,
  ): Promise<StoredMessage> {
    const chat = await this.requireChat(chatId);
    this.requireMember(chat, senderId);
    const existing = await this.requireMessage(chatId, messageId);
    this.assertSender(existing, senderId);
    if (existing.deleted) {
      throw new AppError(409, 'MESSAGE_DELETED', 'Deleted messages cannot be edited');
    }
    const updated = await this.messages.updateText(chatId, messageId, text);
    await this.safeTouch(chatId);
    return updated;
  }

  async deleteMessage(chatId: string, messageId: string, senderId: string): Promise<StoredMessage> {
    const chat = await this.requireChat(chatId);
    this.requireMember(chat, senderId);
    const existing = await this.requireMessage(chatId, messageId);
    this.assertSender(existing, senderId);
    if (existing.deleted) {
      return existing;
    }
    const deleted = await this.messages.softDelete(chatId, messageId);
    await this.safeTouch(chatId);
    return deleted;
  }

  private async requireChat(chatId: string): Promise<Chat> {
    const chat = await this.chats.findById(chatId);
    if (!chat) {
      throw new AppError(404, 'CHAT_NOT_FOUND', 'Chat not found');
    }
    return chat;
  }

  private requireMember(chat: Chat, userId: string): Member {
    const member = chat.members.find((candidate) => candidate.userId === userId);
    if (!member) {
      throw new AppError(403, 'NOT_A_MEMBER', 'User is not a member of this chat');
    }
    return member;
  }

  private async requireMessage(chatId: string, messageId: string): Promise<StoredMessage> {
    const message = await this.messages.findById(chatId, messageId);
    if (!message) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }
    return message;
  }

  private assertSender(message: StoredMessage, senderId: string): void {
    if (message.senderId !== senderId) {
      throw new AppError(403, 'NOT_SENDER', 'Only the sender can change this message');
    }
  }

  private async safeTouch(chatId: string): Promise<void> {
    try {
      await this.chats.touch(chatId);
    } catch (err) {
      logger.warn({ err, chatId }, 'failed to bump chat activity time');
    }
  }
}
