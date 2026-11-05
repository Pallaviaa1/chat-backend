import { z } from 'zod';
import { AppError } from '../errors/AppError.js';

export const DEFAULT_MESSAGE_PAGE = 50;
export const MAX_MESSAGE_PAGE = 100;

export const userIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.:@|-]+$/, 'User id contains unsupported characters');

export const messageIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'Message id contains unsupported characters');

export const chatIdSchema = z.string().uuid();

export const messageTextSchema = z.string().trim().min(1).max(4000);
export const displayNameSchema = z.string().trim().min(1).max(80);
export const titleSchema = z.string().trim().min(1).max(80);

export const createDirectChatBody = z
  .object({
    userAId: userIdSchema,
    userBId: userIdSchema,
  })
  .superRefine((value, ctx) => {
    if (value.userAId === value.userBId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['userBId'],
        message: 'userAId and userBId must be different',
      });
    }
  });

export const createGroupBody = z.object({
  creatorId: userIdSchema,
  title: titleSchema,
  memberIds: z.array(userIdSchema).max(100).default([]),
});

export const updateGroupBody = z.object({
  actorId: userIdSchema,
  title: titleSchema,
});

export const addMemberBody = z.object({
  actorId: userIdSchema,
  userId: userIdSchema,
});

export const actorQuery = z.object({
  actorId: userIdSchema,
});

export const sendMessageBody = z.object({
  senderId: userIdSchema,
  text: messageTextSchema,
});

export const editMessageBody = z.object({
  senderId: userIdSchema,
  text: messageTextSchema,
});

export const deleteMessageBody = z.object({
  senderId: userIdSchema,
});

export const markReadBody = z.object({
  userId: userIdSchema,
});

export const lastSeenBody = z.object({
  userId: userIdSchema,
  messageId: messageIdSchema,
});

export const lastSeenQuery = z.object({
  userId: userIdSchema,
});

export const listMessagesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_MESSAGE_PAGE).default(DEFAULT_MESSAGE_PAGE),
  before: z.string().datetime({ offset: true }).optional(),
});

export const saveUserBody = z.object({
  id: userIdSchema.optional(),
  displayName: displayNameSchema,
  email: z.string().trim().email().optional(),
});

export const userIdParam = z.object({
  userId: userIdSchema,
});

export const chatIdParam = z.object({
  chatId: chatIdSchema,
});

export const messageParam = z.object({
  chatId: chatIdSchema,
  messageId: messageIdSchema,
});

export const memberParam = z.object({
  chatId: chatIdSchema,
  userId: userIdSchema,
});

export function formatZodError(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

export function parseBody<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  return parse(schema, value, 'Invalid request body');
}

export function parseQuery<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  return parse(schema, value, 'Invalid query string');
}

export function parseParams<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  return parse(schema, value, 'Invalid path parameter');
}

function parse<S extends z.ZodTypeAny>(schema: S, value: unknown, message: string): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', message, formatZodError(parsed.error));
  }
  return parsed.data;
}
