import { AppError } from '../errors/AppError.js';
import { buildDirectKey } from '../domain/directKey.js';
import { uniqueIds } from '../domain/ids.js';
import type { ChatStore } from '../stores/chatStore.js';
import type { UserStore } from '../stores/userStore.js';
import type { Chat, ChatSummary, Member } from '../types.js';

export interface ChatApi {
  createOrGetDirect(userAId: string, userBId: string): Promise<{ chatId: string; created: boolean }>;
  createGroup(input: { creatorId: string; title: string; memberIds: string[] }): Promise<Chat>;
  getChat(chatId: string): Promise<Chat>;
  updateGroup(chatId: string, actorId: string, title: string): Promise<Chat>;
  addMember(chatId: string, actorId: string, userId: string): Promise<{ added: boolean }>;
  removeMember(chatId: string, actorId: string, userId: string): Promise<void>;
  listForUser(userId: string): Promise<ChatSummary[]>;
}

export class ChatService implements ChatApi {
  constructor(
    private readonly chats: ChatStore,
    private readonly users: UserStore,
  ) {}

  async createOrGetDirect(
    userAId: string,
    userBId: string,
  ): Promise<{ chatId: string; created: boolean }> {
    if (userAId === userBId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'userAId and userBId must be different');
    }
    await this.users.insertIfMissing([userAId, userBId]);
    const result = await this.chats.createOrGetDirect({
      directKey: buildDirectKey(userAId, userBId),
      createdBy: userAId,
      memberIds: [userAId, userBId],
    });
    return { chatId: result.chat.id, created: result.created };
  }

  async createGroup(input: { creatorId: string; title: string; memberIds: string[] }): Promise<Chat> {
    const memberIds = uniqueIds([input.creatorId, ...input.memberIds]);
    await this.users.insertIfMissing(memberIds);
    return this.chats.insertGroup({
      title: input.title,
      createdBy: input.creatorId,
      members: memberIds.map((userId) => ({
        userId,
        role: userId === input.creatorId ? 'owner' : 'member',
      })),
    });
  }

  async getChat(chatId: string): Promise<Chat> {
    return this.requireChat(chatId);
  }

  async updateGroup(chatId: string, actorId: string, title: string): Promise<Chat> {
    const chat = await this.requireChat(chatId);
    this.assertGroup(chat);
    this.requireManager(this.requireMember(chat, actorId));
    await this.chats.updateTitle(chatId, title);
    return this.requireChat(chatId);
  }

  async addMember(chatId: string, actorId: string, userId: string): Promise<{ added: boolean }> {
    const chat = await this.requireChat(chatId);
    this.assertGroup(chat);
    this.requireManager(this.requireMember(chat, actorId));
    await this.users.insertIfMissing([userId]);
    const result = await this.chats.addMember(chatId, userId, 'member');
    return { added: result === 'added' };
  }

  async removeMember(chatId: string, actorId: string, userId: string): Promise<void> {
    const chat = await this.requireChat(chatId);
    this.assertGroup(chat);
    const actor = this.requireMember(chat, actorId);
    const target = this.requireMember(chat, userId);
    const leaving = actor.userId === target.userId;
    if (!leaving) {
      this.requireManager(actor);
    }
    if (target.role === 'owner') {
      throw new AppError(400, 'OWNER_REQUIRED', 'The group owner cannot be removed');
    }
    if (!leaving && actor.role === 'admin' && target.role === 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Admins cannot remove other admins');
    }
    await this.chats.removeMember(chatId, userId);
  }

  async listForUser(userId: string): Promise<ChatSummary[]> {
    return this.chats.listForUser(userId);
  }

  private async requireChat(chatId: string): Promise<Chat> {
    const chat = await this.chats.findById(chatId);
    if (!chat) {
      throw new AppError(404, 'CHAT_NOT_FOUND', 'Chat not found');
    }
    return chat;
  }

  private assertGroup(chat: Chat): void {
    if (chat.type !== 'group') {
      throw new AppError(400, 'DIRECT_CHAT_LOCKED', 'Direct chat membership cannot be changed');
    }
  }

  private requireMember(chat: Chat, userId: string): Member {
    const member = chat.members.find((candidate) => candidate.userId === userId);
    if (!member) {
      throw new AppError(403, 'NOT_A_MEMBER', 'User is not a member of this chat');
    }
    return member;
  }

  private requireManager(member: Member): void {
    if (member.role !== 'owner' && member.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Only an owner or admin can manage this group');
    }
  }
}
