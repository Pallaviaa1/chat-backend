import type { Chat, ChatSummary, Role } from '../types.js';

export interface ChatStore {
  createOrGetDirect(input: {
    directKey: string;
    createdBy: string;
    memberIds: [string, string];
  }): Promise<{ chat: Chat; created: boolean }>;
  insertGroup(input: {
    title: string;
    createdBy: string;
    members: { userId: string; role: Role }[];
  }): Promise<Chat>;
  findById(id: string): Promise<Chat | null>;
  listForUser(userId: string): Promise<ChatSummary[]>;
  addMember(chatId: string, userId: string, role: Role): Promise<'added' | 'exists'>;
  removeMember(chatId: string, userId: string): Promise<void>;
  updateTitle(chatId: string, title: string): Promise<void>;
  touch(chatId: string): Promise<void>;
}
