import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const emptyToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

const schema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().min(1),
    LOG_LEVEL: z.string().min(1).default('info'),
    AUTO_MIGRATE: z.enum(['true', 'false']).default('true'),
    FIREBASE_PROJECT_ID: z.preprocess(emptyToUndefined, z.string().min(1).default('demo-chat')),
    FIREBASE_CLIENT_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
    FIREBASE_PRIVATE_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    FIRESTORE_EMULATOR_HOST: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  })
  .superRefine((value, ctx) => {
    const hasEmulator = Boolean(value.FIRESTORE_EMULATOR_HOST);
    const hasCredentials = Boolean(value.FIREBASE_CLIENT_EMAIL && value.FIREBASE_PRIVATE_KEY);
    if (!hasEmulator && !hasCredentials) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Set FIRESTORE_EMULATOR_HOST for local development, or FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY for a live project',
        path: ['FIRESTORE_EMULATOR_HOST'],
      });
    }
  });

export interface Env {
  port: number;
  databaseUrl: string;
  logLevel: string;
  autoMigrate: boolean;
  firebaseProjectId: string;
  firebaseClientEmail?: string;
  firebasePrivateKey?: string;
  firestoreEmulatorHost?: string;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${details}`);
  }

  const value = parsed.data;
  const env: Env = {
    port: value.PORT,
    databaseUrl: value.DATABASE_URL,
    logLevel: value.LOG_LEVEL,
    autoMigrate: value.AUTO_MIGRATE === 'true',
    firebaseProjectId: value.FIREBASE_PROJECT_ID,
  };
  if (value.FIREBASE_CLIENT_EMAIL) {
    env.firebaseClientEmail = value.FIREBASE_CLIENT_EMAIL;
  }
  if (value.FIREBASE_PRIVATE_KEY) {
    env.firebasePrivateKey = value.FIREBASE_PRIVATE_KEY;
  }
  if (value.FIRESTORE_EMULATOR_HOST) {
    env.firestoreEmulatorHost = value.FIRESTORE_EMULATOR_HOST;
  }
  return env;
}
