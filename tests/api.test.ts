import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AppDeps } from '../src/routes/index.js';
import type { Chat } from '../src/types.js';

const chatId = '11111111-1111-4111-8111-111111111111';

function deps(overrides: Partial<AppDeps> = {}): AppDeps {
  const chat: Chat = {
    id: chatId,
    type: 'direct',
    title: null,
    directKey: 'key',
    createdBy: 'asha',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    members: [
      { userId: 'asha', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z' },
      { userId: 'vikram', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z' },
    ],
  };
  return {
    health: { check: async () => ({ status: 'ok', mysql: 'up', firestore: 'up' }) },
    users: {
      save: async () => {
        throw new Error('not stubbed');
      },
      get: async () => {
        throw new Error('not stubbed');
      },
    },
    chats: {
      createOrGetDirect: async () => ({ chatId, created: true }),
      createGroup: async () => chat,
      getChat: async () => chat,
      updateGroup: async () => chat,
      addMember: async () => ({ added: true }),
      removeMember: async () => undefined,
      listForUser: async () => [
        {
          id: chatId,
          type: 'direct',
          title: null,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          memberIds: ['asha', 'vikram'],
        },
      ],
    },
    messages: {
      send: async () => ({
        id: 'msg1',
        chatId,
        senderId: 'asha',
        text: 'hello',
        createdAt: '2026-01-01T00:00:01.000Z',
        editedAt: null,
        deleted: false,
        readBy: [],
      }),
      list: async () => ({ messages: [], nextCursor: null }),
      markRead: async () => ({ readAt: '2026-01-01T00:00:02.000Z' }),
      updateLastSeen: async () => ({ updatedAt: '2026-01-01T00:00:03.000Z' }),
      getLastSeen: async () => ({ messageId: 'msg1', updatedAt: '2026-01-01T00:00:03.000Z' }),
      edit: async () => {
        throw new Error('not stubbed');
      },
      deleteMessage: async () => {
        throw new Error('not stubbed');
      },
    },
    ...overrides,
  };
}

describe('http api', () => {
  it('creates or returns a direct chat', async () => {
    const app = createApp(deps());
    const response = await request(app)
      .post('/chat/create')
      .send({ userAId: 'asha', userBId: 'vikram' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ chatId, created: true });
  });

  it('rejects a direct chat between one user', async () => {
    const app = createApp(deps());
    const response = await request(app).post('/chat/create').send({ userAId: 'asha', userBId: 'asha' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('sends a message and lists a user chats', async () => {
    const app = createApp(deps());
    const sent = await request(app)
      .post(`/chat/${chatId}/message/send`)
      .send({ senderId: 'asha', text: 'hello' });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ messageId: 'msg1', text: 'hello', senderId: 'asha' });

    const listed = await request(app).get('/user/asha/chats');
    expect(listed.status).toBe(200);
    expect(listed.body.chats[0]).toMatchObject({ chatId, memberIds: ['asha', 'vikram'] });
  });

  it('marks a message read and updates last seen', async () => {
    const app = createApp(deps());
    const read = await request(app)
      .post(`/chat/${chatId}/message/msg1/read`)
      .send({ userId: 'vikram' });
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ messageId: 'msg1', userId: 'vikram' });

    const seen = await request(app)
      .post(`/chat/${chatId}/lastseen`)
      .send({ userId: 'vikram', messageId: 'msg1' });
    expect(seen.status).toBe(200);
    expect(seen.body.messageId).toBe('msg1');
  });

  it('rejects a malformed chat id and unknown routes', async () => {
    const app = createApp(deps());
    const bad = await request(app).get('/chat/not-a-uuid/messages');
    expect(bad.status).toBe(400);
    const missing = await request(app).get('/missing');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  it('reports health', async () => {
    const app = createApp(deps());
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});
