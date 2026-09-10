export type ErrorCode =
   | 'invalid_request'
   | 'missing_parent'
   | 'not_your_child'
   | 'not_your_booking'
   | 'parent_not_found'
   | 'student_not_found'
   | 'class_not_found'
   | 'booking_not_found'
   | 'not_found'
   | 'already_booked'
   | 'class_full'
   | 'booking_not_payable'
   | 'payment_in_progress'
   | 'level_mismatch'
   | 'class_already_started'
   | 'idempotency_key_reused'
   | 'internal_error';

export class DomainError extends Error {
   constructor(
      public readonly code: ErrorCode,
      message: string,
      public readonly details?: Record<string, unknown>
   ) {
      super(message);
      this.name = 'DomainError';
   }
}

export const isDomainError = (error: unknown, code?: ErrorCode): error is DomainError =>
   error instanceof DomainError && (code === undefined || error.code === code);
