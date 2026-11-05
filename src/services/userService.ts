import { randomUUID } from 'node:crypto';
import { AppError } from '../errors/AppError.js';
import type { UserStore } from '../stores/userStore.js';
import type { User } from '../types.js';

export interface SaveUserInput {
  id?: string;
  displayName: string;
  email?: string;
}

export interface UserApi {
  save(input: SaveUserInput): Promise<{ user: User; created: boolean }>;
  get(id: string): Promise<User>;
}

export class UserService implements UserApi {
  constructor(private readonly users: UserStore) {}

  async save(input: SaveUserInput): Promise<{ user: User; created: boolean }> {
    const email = input.email === undefined ? undefined : input.email.toLowerCase();
    if (input.id) {
      const existing = await this.users.findById(input.id);
      if (existing) {
        const user = await this.users.update({
          id: input.id,
          displayName: input.displayName,
          email: email === undefined ? existing.email : email,
        });
        return { user, created: false };
      }
    }

    const user = await this.users.insert({
      id: input.id ?? randomUUID(),
      displayName: input.displayName,
      email: email ?? null,
    });
    return { user, created: true };
  }

  async get(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }
    return user;
  }
}
