import { describe, expect, it } from 'vitest';
import { pageMessages } from '../src/domain/pageMessages.js';

describe('pageMessages', () => {
  const messages = [
    { id: 'm1', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'm2', createdAt: '2026-01-01T00:00:01.000Z' },
    { id: 'm3', createdAt: '2026-01-01T00:00:02.000Z' },
  ];

  it('returns the newest page in chronological order', () => {
    expect(pageMessages(messages, 2).map((message) => message.id)).toEqual(['m2', 'm3']);
  });

  it('uses an exclusive cursor to walk toward older messages', () => {
    const first = pageMessages(messages, 2);
    const cursor = first[0]?.createdAt;
    expect(pageMessages(messages, 2, cursor).map((message) => message.id)).toEqual(['m1']);
  });
});
