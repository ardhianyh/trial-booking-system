import type {
   BookingRow,
   BookingStatus,
   LevelBand,
   Subject,
   TransactionClient,
} from '../types';

export interface BookingDetailRow extends BookingRow {
   student_name: string;
   student_level: number;
   parent_id: string;
   subject: Subject;
   level_band: LevelBand;
   starts_at: Date;
   capacity: number;
}

export interface RosterEntryRow {
   booking_id: string;
   student_name: string;
   level: number;
   parent_name: string;
   parent_email: string;
   status: BookingStatus;
   confirmed_at: Date | null;
}

const DETAIL_SELECT = `
   SELECT b.id,
          b.student_id,
          b.trial_class_id,
          b.status,
          b.price_cents,
          b.hold_expires_at,
          b.confirmed_at,
          b.created_at,
          b.updated_at,
          s.name  AS student_name,
          s.level AS student_level,
          s.parent_id,
          c.subject,
          c.level_band,
          c.starts_at,
          c.capacity
     FROM bookings b
     JOIN students s ON s.id = b.student_id
     JOIN trial_classes c ON c.id = b.trial_class_id`;

export const findDetailById = async (
   db: TransactionClient,
   bookingId: string
): Promise<BookingDetailRow | null | Error> => {
   const result = await db.query<BookingDetailRow>(`${DETAIL_SELECT} WHERE b.id = $1`, [bookingId]);

   if (result instanceof Error) return result;
   return result.rows[0] ?? null;
};

export const lockById = async (
   tx: TransactionClient,
   bookingId: string
): Promise<BookingRow | null | Error> => {
   const result = await tx.query<BookingRow>(
      `SELECT id, student_id, trial_class_id, status, price_cents,
              hold_expires_at, confirmed_at, created_at, updated_at
         FROM bookings
        WHERE id = $1
          FOR UPDATE`,
      [bookingId]
   );

   if (result instanceof Error) return result;
   return result.rows[0] ?? null;
};

export const findActiveForStudentAndClass = async (
   tx: TransactionClient,
   studentId: string,
   trialClassId: string
): Promise<BookingRow | null | Error> => {
   const result = await tx.query<BookingRow>(
      `SELECT id, student_id, trial_class_id, status, price_cents,
              hold_expires_at, confirmed_at, created_at, updated_at
         FROM bookings
        WHERE student_id = $1
          AND trial_class_id = $2
          AND status IN ('pending_payment', 'confirmed')`,
      [studentId, trialClassId]
   );

   if (result instanceof Error) return result;
   return result.rows[0] ?? null;
};

export const hasOtherActiveBooking = async (
   tx: TransactionClient,
   studentId: string,
   trialClassId: string,
   excludeBookingId: string
): Promise<boolean | Error> => {
   const result = await tx.query(
      `SELECT 1
         FROM bookings
        WHERE student_id = $1
          AND trial_class_id = $2
          AND id <> $3
          AND status IN ('pending_payment', 'confirmed')`,
      [studentId, trialClassId, excludeBookingId]
   );

   if (result instanceof Error) return result;
   return (result.rowCount ?? 0) > 0;
};

export const expireStaleHolds = async (
   tx: TransactionClient,
   trialClassId: string,
   now: Date
): Promise<number | Error> => {
   const result = await tx.query(
      `UPDATE bookings
          SET status = 'expired', updated_at = $2
        WHERE trial_class_id = $1
          AND status = 'pending_payment'
          AND hold_expires_at <= $2`,
      [trialClassId, now]
   );

   if (result instanceof Error) return result;
   return result.rowCount ?? 0;
};

export interface InsertHoldInput {
   studentId: string;
   trialClassId: string;
   priceCents: number;
   holdExpiresAt: Date;
   now: Date;
}

export const insertHold = async (
   tx: TransactionClient,
   input: InsertHoldInput
): Promise<string | Error> => {
   const result = await tx.query<{ id: string }>(
      `INSERT INTO bookings
          (student_id, trial_class_id, status, price_cents, hold_expires_at, created_at, updated_at)
       VALUES ($1, $2, 'pending_payment', $3, $4, $5, $5)
       RETURNING id`,
      [input.studentId, input.trialClassId, input.priceCents, input.holdExpiresAt, input.now]
   );

   if (result instanceof Error) return result;

   const row = result.rows[0];
   if (!row) return new Error('Insert of booking hold returned no row');
   return row.id;
};

export interface UpdateStatusInput {
   bookingId: string;
   status: BookingStatus;
   now: Date;
   confirmedAt?: Date | null;
}

export const updateStatus = async (
   tx: TransactionClient,
   input: UpdateStatusInput
): Promise<void | Error> => {
   const result = await tx.query(
      `UPDATE bookings
          SET status = $2,
              confirmed_at = CASE WHEN $2 = 'confirmed' THEN $3 ELSE confirmed_at END,
              updated_at = $4
        WHERE id = $1`,
      [input.bookingId, input.status, input.confirmedAt ?? null, input.now]
   );

   if (result instanceof Error) return result;
};

export const listRosterEntries = async (
   db: TransactionClient,
   trialClassId: string
): Promise<RosterEntryRow[] | Error> => {
   const result = await db.query<RosterEntryRow>(
      `SELECT b.id AS booking_id,
              s.name AS student_name,
              s.level,
              p.name AS parent_name,
              p.email AS parent_email,
              b.status,
              b.confirmed_at
         FROM bookings b
         JOIN students s ON s.id = b.student_id
         JOIN parents p ON p.id = s.parent_id
        WHERE b.trial_class_id = $1
          AND b.status IN ('confirmed', 'refund_required')
        ORDER BY b.confirmed_at NULLS LAST, s.name`,
      [trialClassId]
   );

   if (result instanceof Error) return result;
   return result.rows;
};

export const listActiveBookingsForParent = async (
   db: TransactionClient,
   studentId: string,
   now: Date
): Promise<Array<{ trial_class_id: string; status: BookingStatus }> | Error> => {
   const result = await db.query<{ trial_class_id: string; status: BookingStatus }>(
      `SELECT trial_class_id,
              CASE WHEN status = 'pending_payment' AND hold_expires_at <= $2
                   THEN 'expired' ELSE status END AS status
         FROM bookings
        WHERE student_id = $1
          AND status IN ('pending_payment', 'confirmed')`,
      [studentId, now]
   );

   if (result instanceof Error) return result;
   return result.rows;
};
