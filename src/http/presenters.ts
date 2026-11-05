import type { Chat, ChatSummary, StoredMessage, User } from '../types.js';

export function presentUser(user: User): {
  id: string;
  displayName: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function presentChatSummary(chat: ChatSummary): {
  chatId: string;
  type: ChatSummary['type'];
  title: string | null;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
} {
  return {
    chatId: chat.id,
    type: chat.type,
    title: chat.title,
    memberIds: chat.memberIds,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

export function presentChat(chat: Chat): {
  chatId: string;
  type: Chat['type'];
  title: string | null;
  memberIds: string[];
  members: { userId: string; role: string; joinedAt: string }[];
  createdAt: string;
  updatedAt: string;
} {
  return {
    chatId: chat.id,
    type: chat.type,
    title: chat.title,
    memberIds: chat.members.map((member) => member.userId),
    members: chat.members.map((member) => ({
      userId: member.userId,
      role: member.role,
      joinedAt: member.joinedAt,
    })),
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

export function presentMessage(message: StoredMessage): {
  messageId: string;
  chatId: string;
  senderId: string;
  text: string | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  readBy: string[];
} {
  return {
    messageId: message.id,
    chatId: message.chatId,
    senderId: message.senderId,
    text: message.text,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    deleted: message.deleted,
    readBy: message.readBy,
  };
}
