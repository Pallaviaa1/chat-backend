import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { Env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export function createFirestore(env: Env): Firestore {
  if (getApps().length === 0) {
    const useEmulator = Boolean(env.firestoreEmulatorHost);
    if (!useEmulator && env.firebaseClientEmail && env.firebasePrivateKey) {
      initializeApp({
        credential: cert({
          projectId: env.firebaseProjectId,
          clientEmail: env.firebaseClientEmail,
          privateKey: env.firebasePrivateKey.replace(/\\n/g, '\n'),
        }),
      });
      logger.info({ projectId: env.firebaseProjectId }, 'firestore using service account');
    } else {
      initializeApp({ projectId: env.firebaseProjectId });
      logger.info(
        { projectId: env.firebaseProjectId, emulatorHost: env.firestoreEmulatorHost },
        'firestore using emulator or application default credentials',
      );
    }
  }

  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}
