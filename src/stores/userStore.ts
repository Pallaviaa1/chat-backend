import type { User } from '../types.js';

export interface UserStore {
  findById(id: string): Promise<User | null>;
  insert(input: { id: string; displayName: string; email: string | null }): Promise<User>;
  update(input: { id: string; displayName: string; email: string | null }): Promise<User>;
  insertIfMissing(ids: readonly string[]): Promise<void>;
}
