import {
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
  type Firestore,
  type Query,
} from 'firebase-admin/firestore';
import { AppError } from '../errors/AppError.js';
import type { MessageStore } from '../stores/messageStore.js';
import type { StoredMessage } from '../types.js';

interface MessageDocument {
  senderId: string;
  text: string;
  createdAt?: Timestamp;
  editedAt?: Timestamp | null;
  deleted?: boolean;
  readBy?: string[];
}

interface ReadDocument {
  userId: string;
  readAt?: Timestamp;
}

interface LastSeenDocument {
  userId: string;
  messageId: string;
  updatedAt?: Timestamp;
}

export class FirestoreMessageRepository implements MessageStore {
  constructor(private readonly db: Firestore) {}

  async create(input: { chatId: string; senderId: string; text: string }): Promise<StoredMessage> {
    const ref = this.messages(input.chatId).doc();
    await ref.set({
      senderId: input.senderId,
      text: input.text,
      createdAt: FieldValue.serverTimestamp(),
      editedAt: null,
      deleted: false,
      readBy: [],
    });
    const snap = await ref.get();
    return this.toMessage(input.chatId, snap);
  }

  async findById(chatId: string, messageId: string): Promise<StoredMessage | null> {
    const snap = await this.messages(chatId).doc(messageId).get();
    if (!snap.exists) {
      return null;
    }
    return this.toMessage(chatId, snap);
  }

  async list(input: { chatId: string; limit: number; before?: string }): Promise<StoredMessage[]> {
    let query: Query = this.messages(input.chatId).orderBy('createdAt', 'desc').limit(input.limit);
    if (input.before) {
      query = query.startAfter(Timestamp.fromDate(new Date(input.before)));
    }
    const snap = await query.get();
    return snap.docs.map((doc) => this.toMessage(input.chatId, doc)).reverse();
  }

  async updateText(chatId: string, messageId: string, text: string): Promise<StoredMessage> {
    const ref = this.messages(chatId).doc(messageId);
    await ref.update({
      text,
      editedAt: FieldValue.serverTimestamp(),
    });
    const snap = await ref.get();
    return this.toMessage(chatId, snap);
  }

  async softDelete(chatId: string, messageId: string): Promise<StoredMessage> {
    const ref = this.messages(chatId).doc(messageId);
    await ref.update({
      text: '',
      deleted: true,
      editedAt: FieldValue.serverTimestamp(),
    });
    const snap = await ref.get();
    return this.toMessage(chatId, snap);
  }

  async markRead(chatId: string, messageId: string, userId: string): Promise<{ readAt: string }> {
    const messageRef = this.messages(chatId).doc(messageId);
    const readRef = messageRef.collection('reads').doc(userId);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(messageRef);
      if (!snap.exists) {
        throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
      }
      tx.set(readRef, { userId, readAt: FieldValue.serverTimestamp() });
      tx.update(messageRef, { readBy: FieldValue.arrayUnion(userId) });
    });
    const saved = await readRef.get();
    const data = saved.data() as ReadDocument | undefined;
    return { readAt: toIso(data?.readAt) };
  }

  async setLastSeen(
    chatId: string,
    userId: string,
    messageId: string,
  ): Promise<{ updatedAt: string }> {
    const ref = this.db.collection('chats').doc(chatId).collection('lastSeen').doc(userId);
    await ref.set({
      userId,
      messageId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const saved = await ref.get();
    const data = saved.data() as LastSeenDocument | undefined;
    return { updatedAt: toIso(data?.updatedAt) };
  }

  async getLastSeen(
    chatId: string,
    userId: string,
  ): Promise<{ messageId: string; updatedAt: string } | null> {
    const snap = await this.db.collection('chats').doc(chatId).collection('lastSeen').doc(userId).get();
    if (!snap.exists) {
      return null;
    }
    const data = snap.data() as LastSeenDocument | undefined;
    if (!data?.messageId) {
      return null;
    }
    return { messageId: data.messageId, updatedAt: toIso(data.updatedAt) };
  }

  private messages(chatId: string) {
    return this.db.collection('chats').doc(chatId).collection('messages');
  }

  private toMessage(chatId: string, snap: DocumentSnapshot): StoredMessage {
    const data = snap.data() as MessageDocument | undefined;
    if (!data || typeof data.senderId !== 'string') {
      throw new AppError(500, 'INVALID_MESSAGE', 'Stored message is invalid');
    }
    const deleted = data.deleted === true;
    return {
      id: snap.id,
      chatId,
      senderId: data.senderId,
      text: deleted ? null : data.text,
      createdAt: toIso(data.createdAt),
      editedAt: data.editedAt ? toIso(data.editedAt) : null,
      deleted,
      readBy: Array.isArray(data.readBy) ? data.readBy.filter((id) => typeof id === 'string') : [],
    };
  }
}

function toIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  throw new AppError(500, 'INVALID_TIMESTAMP', 'Stored timestamp is invalid');
}
