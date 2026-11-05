import type { StoredMessage } from '../types.js';

export interface MessageStore {
  create(input: { chatId: string; senderId: string; text: string }): Promise<StoredMessage>;
  findById(chatId: string, messageId: string): Promise<StoredMessage | null>;
  list(input: { chatId: string; limit: number; before?: string }): Promise<StoredMessage[]>;
  updateText(chatId: string, messageId: string, text: string): Promise<StoredMessage>;
  softDelete(chatId: string, messageId: string): Promise<StoredMessage>;
  markRead(chatId: string, messageId: string, userId: string): Promise<{ readAt: string }>;
  setLastSeen(chatId: string, userId: string, messageId: string): Promise<{ updatedAt: string }>;
  getLastSeen(chatId: string, userId: string): Promise<{ messageId: string; updatedAt: string } | null>;
}
