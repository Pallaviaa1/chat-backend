import { Router } from 'express';
import { asyncHandler } from '../http/asyncHandler.js';
import { presentChat, presentMessage } from '../http/presenters.js';
import type { ChatApi } from '../services/chatService.js';
import type { MessageApi } from '../services/messageService.js';
import {
  actorQuery,
  addMemberBody,
  chatIdParam,
  createDirectChatBody,
  createGroupBody,
  deleteMessageBody,
  editMessageBody,
  lastSeenBody,
  lastSeenQuery,
  listMessagesQuery,
  markReadBody,
  memberParam,
  messageParam,
  parseBody,
  parseParams,
  parseQuery,
  sendMessageBody,
  updateGroupBody,
} from '../validation/schemas.js';

export function chatRoutes(chats: ChatApi, messages: MessageApi): Router {
  const router = Router();

  router.post(
    '/chat/create',
    asyncHandler(async (req, res) => {
      const body = parseBody(createDirectChatBody, req.body);
      const result = await chats.createOrGetDirect(body.userAId, body.userBId);
      res.status(200).json(result);
    }),
  );

  router.post(
    '/chat/group',
    asyncHandler(async (req, res) => {
      const body = parseBody(createGroupBody, req.body);
      const chat = await chats.createGroup(body);
      res.status(201).json(presentChat(chat));
    }),
  );

  router.get(
    '/chat/:chatId',
    asyncHandler(async (req, res) => {
      const params = parseParams(chatIdParam, req.params);
      const chat = await chats.getChat(params.chatId);
      res.status(200).json(presentChat(chat));
    }),
  );

  router.patch(
    '/chat/:chatId',
    asyncHandler(async (req, res) => {
      const params = parseParams(chatIdParam, req.params);
      const body = parseBody(updateGroupBody, req.body);
      const chat = await chats.updateGroup(params.chatId, body.actorId, body.title);
      res.status(200).json(presentChat(chat));
    }),
  );

  router.post(
    '/chat/:chatId/members',
    asyncHandler(async (req, res) => {
      const params = parseParams(chatIdParam, req.params);
      const body = parseBody(addMemberBody, req.body);
      const result = await chats.addMember(params.chatId, body.actorId, body.userId);
      res.status(result.added ? 201 : 200).json({ chatId: params.chatId, userId: body.userId, ...result });
    }),
  );

  router.delete(
    '/chat/:chatId/members/:userId',
    asyncHandler(async (req, res) => {
      const params = parseParams(memberParam, req.params);
      const query = parseQuery(actorQuery, req.query);
      await chats.removeMember(params.chatId, query.actorId, params.userId);
      res.status(204).send();
    }),
  );

  router.post(
    '/chat/:chatId/message/send',
    asyncHandler(async (req, res) => {
      const params = parseParams(chatIdParam, req.params);
      const body = parseBody(sendMessageBody, req.body);
      const message = await messages.send(params.chatId, body.senderId, body.text);
      res.status(201).json(presentMessage(message));
    }),
  );

  router.get(
    '/chat/:chatId/messages',
    asyncHandler(async (req, res) => {
      const params = parseParams(chatIdParam, req.params);
      const query = parseQuery(listMessagesQuery, req.query);
      const page = await messages.list(params.chatId, query.limit, query.before);
      res.status(200).json({
        messages: page.messages.map(presentMessage),
        nextCursor: page.nextCursor,
      });
    }),
  );

  router.post(
    '/chat/:chatId/message/:messageId/read',
    asyncHandler(async (req, res) => {
      const params = parseParams(messageParam, req.params);
      const body = parseBody(markReadBody, req.body);
      const receipt = await messages.markRead(params.chatId, params.messageId, body.userId);
      res.status(200).json({
        chatId: params.chatId,
        messageId: params.messageId,
        userId: body.userId,
        readAt: receipt.readAt,
      });
    }),
  );

  router.patch(
    '/chat/:chatId/message/:messageId',
    asyncHandler(async (req, res) => {
      const params = parseParams(messageParam, req.params);
      const body = parseBody(editMessageBody, req.body);
      const message = await messages.edit(params.chatId, params.messageId, body.senderId, body.text);
      res.status(200).json(presentMessage(message));
    }),
  );

  router.delete(
    '/chat/:chatId/message/:messageId',
    asyncHandler(async (req, res) => {
      const params = parseParams(messageParam, req.params);
      const body = parseBody(deleteMessageBody, req.body);
      const message = await messages.deleteMessage(
        params.chatId,
        params.messageId,
        body.senderId,
      );
      res.status(200).json(presentMessage(message));
    }),
  );

  router.post(
    '/chat/:chatId/lastseen',
    asyncHandler(async (req, res) => {
      const params = parseParams(chatIdParam, req.params);
      const body = parseBody(lastSeenBody, req.body);
      const lastSeen = await messages.updateLastSeen(params.chatId, body.userId, body.messageId);
      res.status(200).json({
        chatId: params.chatId,
        userId: body.userId,
        messageId: body.messageId,
        updatedAt: lastSeen.updatedAt,
      });
    }),
  );

  router.get(
    '/chat/:chatId/lastseen',
    asyncHandler(async (req, res) => {
      const params = parseParams(chatIdParam, req.params);
      const query = parseQuery(lastSeenQuery, req.query);
      const lastSeen = await messages.getLastSeen(params.chatId, query.userId);
      res.status(200).json({
        chatId: params.chatId,
        userId: query.userId,
        messageId: lastSeen.messageId,
        updatedAt: lastSeen.updatedAt,
      });
    }),
  );

  return router;
}
