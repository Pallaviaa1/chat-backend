import { Router } from 'express';
import { asyncHandler } from '../http/asyncHandler.js';
import type { HealthChecker } from '../services/healthService.js';

export function healthRoutes(health: HealthChecker): Router {
  const router = Router();

  router.get(
    '/health',
    asyncHandler(async (_req, res) => {
      const report = await health.check();
      res.status(report.status === 'ok' ? 200 : 503).json(report);
    }),
  );

  return router;
}
