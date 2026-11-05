import { Router } from 'express';
import { asyncHandler } from '../http/asyncHandler.js';
import { presentChatSummary, presentUser } from '../http/presenters.js';
import type { ChatApi } from '../services/chatService.js';
import type { UserApi } from '../services/userService.js';
import { parseBody, parseParams, saveUserBody, userIdParam } from '../validation/schemas.js';

export function userRoutes(users: UserApi, chats: ChatApi): Router {
  const router = Router();

  router.post(
    '/users',
    asyncHandler(async (req, res) => {
      const body = parseBody(saveUserBody, req.body);
      const result = await users.save(body);
      res.status(result.created ? 201 : 200).json(presentUser(result.user));
    }),
  );

  router.get(
    '/users/:userId',
    asyncHandler(async (req, res) => {
      const params = parseParams(userIdParam, req.params);
      const user = await users.get(params.userId);
      res.status(200).json(presentUser(user));
    }),
  );

  router.get(
    '/user/:userId/chats',
    asyncHandler(async (req, res) => {
      const params = parseParams(userIdParam, req.params);
      const chatsForUser = await chats.listForUser(params.userId);
      res.status(200).json({ chats: chatsForUser.map(presentChatSummary) });
    }),
  );

  return router;
}
