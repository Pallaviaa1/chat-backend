import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { migrate } from './db/migrate.js';
import { createPool } from './db/pool.js';
import { createFirestore } from './firebase/client.js';
import { logger } from './lib/logger.js';
import { MysqlChatRepository } from './repositories/chatRepository.js';
import { FirestoreMessageRepository } from './repositories/messageRepository.js';
import { MysqlUserRepository } from './repositories/userRepository.js';
import { ChatService } from './services/chatService.js';
import { HealthService } from './services/healthService.js';
import { MessageService } from './services/messageService.js';
import { UserService } from './services/userService.js';

async function main(): Promise<void> {
  const env = loadEnv();
  logger.level = env.logLevel;

  const pool = createPool(env.databaseUrl);
  if (env.autoMigrate) {
    await migrate(pool);
  }

  const firestore = createFirestore(env);
  const userRepository = new MysqlUserRepository(pool);
  const chatRepository = new MysqlChatRepository(pool);
  const messageRepository = new FirestoreMessageRepository(firestore);

  const app = createApp({
    users: new UserService(userRepository),
    chats: new ChatService(chatRepository, userRepository),
    messages: new MessageService(messageRepository, chatRepository),
    health: new HealthService(pool, firestore),
  });

  const server = app.listen(env.port, '0.0.0.0', () => {
    logger.info({ port: env.port }, 'chat backend listening');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      pool
        .end()
        .catch((err: unknown) => {
          logger.error({ err }, 'failed to close mysql pool');
        })
        .finally(() => {
          process.exit(0);
        });
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
