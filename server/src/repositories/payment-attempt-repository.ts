import type { PaymentAttemptRow, SettledOutcome, TransactionClient } from '../types';

const ATTEMPT_COLUMNS = `id, booking_id, idempotency_key, amount_cents,
                         outcome, failure_reason, provider_ref, created_at`;

export interface InsertPendingInput {
   bookingId: string;
   idempotencyKey: string;
   amountCents: number;
   now: Date;
}

export const insertPending = async (
   db: TransactionClient,
   input: InsertPendingInput
): Promise<string | null | Error> => {
   const result = await db.query<{ id: string }>(
      `INSERT INTO payment_attempts
          (booking_id, idempotency_key, amount_cents, outcome, created_at)
       VALUES ($1, $2, $3, 'pending', $4)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [input.bookingId, input.idempotencyKey, input.amountCents, input.now]
   );

   if (result instanceof Error) return result;
   return result.rows[0]?.id ?? null;
};

export const findByIdempotencyKey = async (
   db: TransactionClient,
   idempotencyKey: string
): Promise<PaymentAttemptRow | null | Error> => {
   const result = await db.query<PaymentAttemptRow>(
      `SELECT ${ATTEMPT_COLUMNS} FROM payment_attempts WHERE idempotency_key = $1`,
      [idempotencyKey]
   );

   if (result instanceof Error) return result;
   return result.rows[0] ?? null;
};

export const findLiveByBooking = async (
   db: TransactionClient,
   bookingId: string
): Promise<PaymentAttemptRow | null | Error> => {
   const result = await db.query<PaymentAttemptRow>(
      `SELECT ${ATTEMPT_COLUMNS}
         FROM payment_attempts
        WHERE booking_id = $1
          AND outcome IN ('pending', 'succeeded')`,
      [bookingId]
   );

   if (result instanceof Error) return result;
   return result.rows[0] ?? null;
};

export const findLatestByBooking = async (
   db: TransactionClient,
   bookingId: string
): Promise<PaymentAttemptRow | null | Error> => {
   const result = await db.query<PaymentAttemptRow>(
      `SELECT ${ATTEMPT_COLUMNS}
         FROM payment_attempts
        WHERE booking_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [bookingId]
   );

   if (result instanceof Error) return result;
   return result.rows[0] ?? null;
};

export interface SettleInput {
   attemptId: string;
   outcome: SettledOutcome;
   failureReason: string | null;
   providerRef: string | null;
}

export const settle = async (
   tx: TransactionClient,
   input: SettleInput
): Promise<void | Error> => {
   const result = await tx.query(
      `UPDATE payment_attempts
          SET outcome = $2, failure_reason = $3, provider_ref = $4
        WHERE id = $1`,
      [input.attemptId, input.outcome, input.failureReason, input.providerRef]
   );

   if (result instanceof Error) return result;
};

export const countUnsettledForBooking = async (
   db: TransactionClient,
   bookingId: string
): Promise<number | Error> => {
   const result = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM payment_attempts
        WHERE booking_id = $1
          AND outcome = 'pending'`,
      [bookingId]
   );

   if (result instanceof Error) return result;
   return result.rows[0]?.count ?? 0;
};
