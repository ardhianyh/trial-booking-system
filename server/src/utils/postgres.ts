export const UNIQUE_VIOLATION = '23505';
export const CHECK_VIOLATION = '23514';

export const postgresErrorCode = (error: Error): string | undefined =>
   (error as { code?: unknown }).code as string | undefined;

export const isUniqueViolation = (error: Error): boolean =>
   postgresErrorCode(error) === UNIQUE_VIOLATION;
