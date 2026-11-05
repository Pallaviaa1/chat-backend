import { describe, expect, it } from 'vitest';
import { buildDirectKey } from '../src/domain/directKey.js';

describe('buildDirectKey', () => {
  it('is stable regardless of argument order', () => {
    expect(buildDirectKey('user-b', 'user-a')).toBe(buildDirectKey('user-a', 'user-b'));
  });

  it('does not collide when ids contain the separator', () => {
    expect(buildDirectKey('a.b', 'c')).not.toBe(buildDirectKey('a', 'b.c'));
    expect(buildDirectKey('ab', 'c')).not.toBe(buildDirectKey('a', 'bc'));
  });
});
