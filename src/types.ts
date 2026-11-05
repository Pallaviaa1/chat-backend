export type Role = 'owner' | 'admin' | 'member';
export type ChatType = 'direct' | 'group';

export interface User {
  id: string;
  displayName: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  userId: string;
  role: Role;
  joinedAt: string;
}

export interface Chat {
  id: string;
  type: ChatType;
  title: string | null;
  directKey: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  members: Member[];
}

export interface ChatSummary {
  id: string;
  type: ChatType;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  memberIds: string[];
}

export interface StoredMessage {
  id: string;
  chatId: string;
  senderId: string;
  text: string | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  readBy: string[];
}
