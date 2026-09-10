import type { SeatCount, TransactionClient, TrialClassRow } from '../types';

export interface TrialClassWithSeatsRow extends TrialClassRow {
   confirmed: number;
   held: number;
}

export const lockClass = async (
   tx: TransactionClient,
   trialClassId: string
): Promise<TrialClassRow | null | Error> => {
   const result = await tx.query<TrialClassRow>(
      `SELECT id, subject, level_band, starts_at, capacity
         FROM trial_classes
        WHERE id = $1
          FOR UPDATE`,
      [trialClassId]
   );

   if (result instanceof Error) return result;
   return result.rows[0] ?? null;
};

export const findById = async (
   db: TransactionClient,
   trialClassId: string
): Promise<TrialClassRow | null | Error> => {
   const result = await db.query<TrialClassRow>(
      'SELECT id, subject, level_band, starts_at, capacity FROM trial_classes WHERE id = $1',
      [trialClassId]
   );

   if (result instanceof Error) return result;
   return result.rows[0] ?? null;
};

export const countSeats = async (
   tx: TransactionClient,
   trialClassId: string,
   now: Date,
   excludeBookingId?: string
): Promise<SeatCount | Error> => {
   const result = await tx.query<SeatCount>(
      `SELECT count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
              count(*) FILTER (WHERE status = 'pending_payment' AND hold_expires_at > $2)::int AS held
         FROM bookings
        WHERE trial_class_id = $1
          AND ($3::uuid IS NULL OR id <> $3)`,
      [trialClassId, now, excludeBookingId ?? null]
   );

   if (result instanceof Error) return result;
   return result.rows[0] ?? { confirmed: 0, held: 0 };
};

export const listUpcomingWithSeats = async (
   db: TransactionClient,
   now: Date
): Promise<TrialClassWithSeatsRow[] | Error> => {
   const result = await db.query<TrialClassWithSeatsRow>(
      `SELECT c.id,
              c.subject,
              c.level_band,
              c.starts_at,
              c.capacity,
              count(b.id) FILTER (WHERE b.status = 'confirmed')::int AS confirmed,
              count(b.id) FILTER (WHERE b.status = 'pending_payment' AND b.hold_expires_at > $1)::int AS held
         FROM trial_classes c
         LEFT JOIN bookings b ON b.trial_class_id = c.id
        WHERE c.starts_at > $1
        GROUP BY c.id, c.subject, c.level_band, c.starts_at, c.capacity
        ORDER BY c.starts_at`,
      [now]
   );

   if (result instanceof Error) return result;
   return result.rows;
};

export const findWithSeats = async (
   db: TransactionClient,
   trialClassId: string,
   now: Date
): Promise<TrialClassWithSeatsRow | null | Error> => {
   const result = await db.query<TrialClassWithSeatsRow>(
      `SELECT c.id,
              c.subject,
              c.level_band,
              c.starts_at,
              c.capacity,
              count(b.id) FILTER (WHERE b.status = 'confirmed')::int AS confirmed,
              count(b.id) FILTER (WHERE b.status = 'pending_payment' AND b.hold_expires_at > $2)::int AS held
         FROM trial_classes c
         LEFT JOIN bookings b ON b.trial_class_id = c.id
        WHERE c.id = $1
        GROUP BY c.id, c.subject, c.level_band, c.starts_at, c.capacity`,
      [trialClassId, now]
   );

   if (result instanceof Error) return result;
   return result.rows[0] ?? null;
};
