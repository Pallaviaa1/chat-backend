import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler } from './http/errorHandler.js';
import { logger } from './lib/logger.js';
import { apiRouter, type AppDeps } from './routes/index.js';

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    const started = Date.now();
    res.on('finish', () => {
      logger.info(
        {
          requestId,
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          ms: Date.now() - started,
        },
        'request',
      );
    });
    next();
  });
  app.use(apiRouter(deps));
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
  app.use(errorHandler);
  return app;
}
