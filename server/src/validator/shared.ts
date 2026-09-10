import { z } from 'zod';
import { DomainError } from '../domain/errors';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_PATTERN.test(value);

export const uuid = z.string().regex(UUID_PATTERN, 'must be a UUID');

export const parse = <T>(schema: z.ZodType<T>, input: unknown): T | DomainError => {
   const result = schema.safeParse(input);
   if (result.success) return result.data;

   const issues = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
   }));

   return new DomainError('invalid_request', 'Request payload is not valid.', { issues });
};
