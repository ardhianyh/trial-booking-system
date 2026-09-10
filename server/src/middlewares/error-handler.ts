import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { DomainError, type ErrorCode } from '../domain/errors';
import { logger } from '../utils/logger';

const statusByCode: Record<ErrorCode, number> = {
   invalid_request: 400,
   missing_parent: 401,
   not_your_child: 403,
   not_your_booking: 403,
   parent_not_found: 404,
   student_not_found: 404,
   class_not_found: 404,
   booking_not_found: 404,
   not_found: 404,
   already_booked: 409,
   class_full: 409,
   booking_not_payable: 409,
   payment_in_progress: 409,
   level_mismatch: 422,
   class_already_started: 422,
   idempotency_key_reused: 422,
   internal_error: 500,
};

export const respondError = (res: Response, error: Error): Response => {
   if (error instanceof DomainError) {
      return res.status(statusByCode[error.code]).json({
         error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
         },
      });
   }

   logger.error('Unhandled error', { message: error.message, stack: error.stack });
   return res.status(500).json({
      error: { code: 'internal_error', message: 'Something went wrong on our side.' },
   });
};

export const notFoundHandler: RequestHandler = (_req, res) => {
   respondError(res, new DomainError('not_found', 'Unknown endpoint.'));
};

export const globalErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
   respondError(res, error instanceof Error ? error : new Error(String(error)));
};
