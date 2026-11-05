import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors/AppError.js';
import { ChatService } from '../src/services/chatService.js';
import { MessageService } from '../src/services/messageService.js';
import { UserService } from '../src/services/userService.js';
import type { StoredMessage } from '../src/types.js';
import { MemoryChatStore, MemoryMessageStore, MemoryUserStore } from './memoryStores.js';

function stores(): {
  users: MemoryUserStore;
  chats: MemoryChatStore;
  messages: MemoryMessageStore;
  chatService: ChatService;
  messageService: MessageService;
  userService: UserService;
} {
  const users = new MemoryUserStore();
  const chats = new MemoryChatStore();
  const messages = new MemoryMessageStore();
  return {
    users,
    chats,
    messages,
    chatService: new ChatService(chats, users),
    messageService: new MessageService(messages, chats),
    userService: new UserService(users),
  };
}

describe('users and direct chats', () => {
  it('keeps an existing profile when a chat is created for that user', async () => {
    const { userService, chatService, users } = stores();
    const saved = await userService.save({ id: 'asha', displayName: 'Asha', email: 'Asha@Example.com' });
    expect(saved.created).toBe(true);
    expect(saved.user.email).toBe('asha@example.com');

    await chatService.createOrGetDirect('asha', 'vikram');
    expect(users.users.get('asha')?.displayName).toBe('Asha');
    expect(users.users.get('vikram')?.displayName).toBe('vikram');
  });

  it('returns the same direct chat for either argument order', async () => {
    const { chatService } = stores();
    const first = await chatService.createOrGetDirect('vikram', 'asha');
    const second = await chatService.createOrGetDirect('asha', 'vikram');
    expect(first.created).toBe(true);
    expect(second).toEqual({ chatId: first.chatId, created: false });
  });

  it('rejects a chat with one user', async () => {
    const { chatService } = stores();
    await expect(chatService.createOrGetDirect('asha', 'asha')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('group management', () => {
  it('makes the creator the owner and ignores duplicate members', async () => {
    const { chatService } = stores();
    const chat = await chatService.createGroup({
      creatorId: 'asha',
      title: 'Launch',
      memberIds: ['vikram', 'asha', 'vikram'],
    });
    expect(chat.members).toEqual([
      expect.objectContaining({ userId: 'asha', role: 'owner' }),
      expect.objectContaining({ userId: 'vikram', role: 'member' }),
    ]);
  });

  it('lets an owner rename and add a member, and blocks ordinary members', async () => {
    const { chatService } = stores();
    const chat = await chatService.createGroup({
      creatorId: 'asha',
      title: 'Launch',
      memberIds: ['vikram'],
    });

    await expect(chatService.updateGroup(chat.id, 'vikram', 'Renamed')).rejects.toBeInstanceOf(AppError);
    const renamed = await chatService.updateGroup(chat.id, 'asha', 'Renamed');
    expect(renamed.title).toBe('Renamed');

    const added = await chatService.addMember(chat.id, 'asha', 'meera');
    expect(added.added).toBe(true);
    const again = await chatService.addMember(chat.id, 'asha', 'meera');
    expect(again.added).toBe(false);
  });

  it('lets a member leave, and refuses to remove the owner', async () => {
    const { chatService } = stores();
    const chat = await chatService.createGroup({
      creatorId: 'asha',
      title: 'Launch',
      memberIds: ['vikram'],
    });
    await chatService.removeMember(chat.id, 'vikram', 'vikram');
    await expect(chatService.removeMember(chat.id, 'asha', 'asha')).rejects.toMatchObject({
      code: 'OWNER_REQUIRED',
    });
  });

  it('does not change membership of a direct chat', async () => {
    const { chatService } = stores();
    const direct = await chatService.createOrGetDirect('asha', 'vikram');
    await expect(chatService.addMember(direct.chatId, 'asha', 'meera')).rejects.toMatchObject({
      code: 'DIRECT_CHAT_LOCKED',
    });
  });

  it('lists only chats the user belongs to', async () => {
    const { chatService } = stores();
    await chatService.createOrGetDirect('asha', 'vikram');
    await chatService.createGroup({ creatorId: 'meera', title: 'Other', memberIds: [] });
    const chats = await chatService.listForUser('asha');
    expect(chats).toHaveLength(1);
    expect(chats[0]?.memberIds.sort()).toEqual(['asha', 'vikram']);
  });
});

describe('messages', () => {
  it('rejects a sender who is not a member and bumps activity for a member', async () => {
    const { chatService, messageService, chats } = stores();
    const direct = await chatService.createOrGetDirect('asha', 'vikram');
    await expect(messageService.send(direct.chatId, 'meera', 'hello')).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
    const sent = await messageService.send(direct.chatId, 'asha', 'hello');
    expect(sent.text).toBe('hello');
    expect(chats.touchCount).toBe(1);
  });

  it('pages newest messages and only lets the sender edit or delete', async () => {
    const { chatService, messageService, messages } = stores();
    const direct = await chatService.createOrGetDirect('asha', 'vikram');
    const chat = await chatService.getChat(direct.chatId);
    const seeded: StoredMessage[] = ['2026-01-01T00:00:00.000Z', '2026-01-01T00:00:01.000Z', '2026-01-01T00:00:02.000Z'].map(
      (createdAt, index) => ({
        id: `m${index + 1}`,
        chatId: chat.id,
        senderId: index === 2 ? 'vikram' : 'asha',
        text: `text-${index + 1}`,
        createdAt,
        editedAt: null,
        deleted: false,
        readBy: [],
      }),
    );
    messages.messages.push(...seeded);

    const page = await messageService.list(chat.id, 2);
    expect(page.messages.map((message) => message.id)).toEqual(['m2', 'm3']);
    expect(page.nextCursor).toBe('2026-01-01T00:00:01.000Z');
    const older = await messageService.list(chat.id, 2, page.nextCursor ?? undefined);
    expect(older.messages.map((message) => message.id)).toEqual(['m1']);
    expect(older.nextCursor).toBeNull();

    await expect(messageService.edit(chat.id, 'm3', 'asha', 'nope')).rejects.toMatchObject({
      code: 'NOT_SENDER',
    });
    const edited = await messageService.edit(chat.id, 'm1', 'asha', 'changed');
    expect(edited.text).toBe('changed');
    expect(edited.editedAt).not.toBeNull();

    const removed = await messageService.deleteMessage(chat.id, 'm1', 'asha');
    expect(removed.deleted).toBe(true);
    expect(removed.text).toBeNull();
    const again = await messageService.deleteMessage(chat.id, 'm1', 'asha');
    expect(again.deleted).toBe(true);
    await expect(messageService.edit(chat.id, 'm1', 'asha', 'later')).rejects.toMatchObject({
      code: 'MESSAGE_DELETED',
    });
  });

  it('records a read receipt and last seen only for members and real messages', async () => {
    const { chatService, messageService } = stores();
    const direct = await chatService.createOrGetDirect('asha', 'vikram');
    const sent = await messageService.send(direct.chatId, 'asha', 'hello');

    await expect(messageService.markRead(direct.chatId, sent.id, 'meera')).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
    const receipt = await messageService.markRead(direct.chatId, sent.id, 'vikram');
    expect(receipt.readAt).toEqual(expect.any(String));
    const visible = await messageService.list(direct.chatId, 10);
    expect(visible.messages[0]?.readBy).toEqual(['vikram']);

    await expect(
      messageService.updateLastSeen(direct.chatId, 'vikram', 'missing-message'),
    ).rejects.toMatchObject({ code: 'MESSAGE_NOT_FOUND' });
    await messageService.updateLastSeen(direct.chatId, 'vikram', sent.id);
    const lastSeen = await messageService.getLastSeen(direct.chatId, 'vikram');
    expect(lastSeen.messageId).toBe(sent.id);
  });
});

describe('schema migration', () => {
  it('creates the relational tables for users and chats', () => {
    const sql = readFileSync(path.resolve('migrations/001_init.sql'), 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS users');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS chats');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS chat_members');
    expect(sql).toContain('chats_direct_key_key');
  });
});
