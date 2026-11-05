import { Router } from 'express';
import { chatRoutes } from './chatRoutes.js';
import { healthRoutes } from './healthRoutes.js';
import { userRoutes } from './userRoutes.js';
import type { ChatApi } from '../services/chatService.js';
import type { HealthChecker } from '../services/healthService.js';
import type { MessageApi } from '../services/messageService.js';
import type { UserApi } from '../services/userService.js';

export interface AppDeps {
  users: UserApi;
  chats: ChatApi;
  messages: MessageApi;
  health: HealthChecker;
}

export function apiRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(healthRoutes(deps.health));
  router.use(userRoutes(deps.users, deps.chats));
  router.use(chatRoutes(deps.chats, deps.messages));
  return router;
}
