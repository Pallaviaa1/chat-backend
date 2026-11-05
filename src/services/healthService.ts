import type { Firestore } from 'firebase-admin/firestore';
import type pg from 'pg';

export interface HealthReport {
  status: 'ok' | 'degraded';
  postgres: 'up' | 'down';
  firestore: 'up' | 'down';
}

export interface HealthChecker {
  check(): Promise<HealthReport>;
}

export class HealthService implements HealthChecker {
  constructor(
    private readonly pool: pg.Pool,
    private readonly firestore: Firestore,
  ) {}

  async check(): Promise<HealthReport> {
    const [postgres, firestore] = await Promise.all([this.pingPostgres(), this.pingFirestore()]);
    return {
      status: postgres === 'up' && firestore === 'up' ? 'ok' : 'degraded',
      postgres,
      firestore,
    };
  }

  private async pingPostgres(): Promise<'up' | 'down'> {
    try {
      await withTimeout(this.pool.query('SELECT 1'), 2000);
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async pingFirestore(): Promise<'up' | 'down'> {
    try {
      await withTimeout(this.firestore.collection('_health').limit(1).get(), 2000);
      return 'up';
    } catch {
      return 'down';
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error('health check failed'));
      },
    );
  });
}
