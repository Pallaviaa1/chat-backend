import { AppError } from './AppError.js';

interface MysqlErrorShape {
  code: string;
  sqlMessage?: string;
}

function isMysqlError(err: unknown): err is MysqlErrorShape {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  );
}

export function mapDbError(err: unknown): never {
  if (err instanceof AppError) {
    throw err;
  }
  if (isMysqlError(err)) {
    const message = err.sqlMessage ?? '';
    if (err.code === 'ER_DUP_ENTRY' && message.includes('users_email_key')) {
      throw new AppError(409, 'EMAIL_TAKEN', 'Email is already in use');
    }
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError(409, 'CONFLICT', 'Record already exists');
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
      throw new AppError(400, 'INVALID_REFERENCE', 'Referenced user or chat does not exist');
    }
    if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || err.code === 'ER_DATA_TOO_LONG') {
      throw new AppError(400, 'CONSTRAINT', 'Data did not satisfy a database constraint');
    }
  }
  throw err;
}
