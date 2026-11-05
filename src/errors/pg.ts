import { AppError } from './AppError.js';

interface PgErrorShape {
  code: string;
  constraint?: string;
}

export function isPgError(err: unknown): err is PgErrorShape {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  );
}

export function mapPgError(err: unknown): never {
  if (err instanceof AppError) {
    throw err;
  }
  if (isPgError(err)) {
    if (err.code === '22P02') {
      throw new AppError(400, 'INVALID_ID', 'Invalid identifier');
    }
    if (err.code === '23503') {
      throw new AppError(400, 'INVALID_REFERENCE', 'Referenced user or chat does not exist');
    }
    if (err.code === '23514') {
      throw new AppError(400, 'CONSTRAINT', 'Data did not satisfy a database constraint');
    }
    if (err.code === '23505' && err.constraint === 'users_email_key') {
      throw new AppError(409, 'EMAIL_TAKEN', 'Email is already in use');
    }
    if (err.code === '23505') {
      throw new AppError(409, 'CONFLICT', 'Record already exists');
    }
  }
  throw err;
}
