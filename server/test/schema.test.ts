import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { postgresErrorCode } from '../src/utils/postgres';
import {
   IDS,
   assertInvariants,
   createStudents,
   createTestContext,
   resetData,
   seatsOf,
} from './helpers';

const context = createTestContext();
const { database } = context;

const insertBooking = async (
   studentId: string,
   trialClassId: string,
   status: string,
   overrides: { confirmedAt?: string | null; priceCents?: number } = {}
) =>
   database.query(
      `INSERT INTO bookings (student_id, trial_class_id, status, price_cents, hold_expires_at, confirmed_at)
       VALUES ($1, $2, $3, $4, now() + interval '10 minutes', $5)`,
      [
         studentId,
         trialClassId,
         status,
         overrides.priceCents ?? 5000,
         overrides.confirmedAt === undefined ? new Date() : overrides.confirmedAt,
      ]
   );

beforeEach(() => resetData(context));
afterEach(() => assertInvariants(database));
afterAll(() => database.shutdown());

describe('schema constraints', () => {
   it('T01 rejects a second active booking for the same student and class', async () => {
      const result = await insertBooking(IDS.students.ethanTan, IDS.classes.lowerMath, 'pending_payment', {
         confirmedAt: null,
      });

      expect(result).toBeInstanceOf(Error);
      expect(postgresErrorCode(result as Error)).toBe('23505');
   });

   it('T02 allows a new booking once the previous one failed', async () => {
      const result = await insertBooking(IDS.students.zoeGoh, IDS.classes.upperMath, 'pending_payment', {
         confirmedAt: null,
      });

      expect(result).not.toBeInstanceOf(Error);
   });

   it('T03 rejects invalid capacity, status, confirmed_at and failure_reason values', async () => {
      const capacity = await database.query(
         `INSERT INTO trial_classes (subject, level_band, starts_at, capacity)
          VALUES ('math', 'lower', now() + interval '1 day', 5)`
      );
      expect(postgresErrorCode(capacity as Error)).toBe('23514');

      const unknownStatus = await insertBooking(
         IDS.students.chloeTan,
         IDS.classes.upperScience,
         'half_booked'
      );
      expect(postgresErrorCode(unknownStatus as Error)).toBe('23514');

      const confirmedWithoutTimestamp = await insertBooking(
         IDS.students.chloeTan,
         IDS.classes.upperScience,
         'confirmed',
         { confirmedAt: null }
      );
      expect(postgresErrorCode(confirmedWithoutTimestamp as Error)).toBe('23514');

      const failureReasonOnSuccess = await database.query(
         `INSERT INTO payment_attempts (booking_id, idempotency_key, amount_cents, outcome, failure_reason)
          VALUES ($1, 'schema-check-1', 5000, 'succeeded', 'card_declined')`,
         [IDS.bookings.zoeUpperMath]
      );
      expect(postgresErrorCode(failureReasonOnSuccess as Error)).toBe('23514');
   });

   it('T03b rejects a second live payment attempt for the same booking', async () => {
      const first = await database.query(
         `INSERT INTO payment_attempts (booking_id, idempotency_key, amount_cents, outcome)
          VALUES ($1, 'schema-live-1', 5000, 'pending')`,
         [IDS.bookings.zoeUpperMath]
      );
      expect(first).not.toBeInstanceOf(Error);

      const second = await database.query(
         `INSERT INTO payment_attempts (booking_id, idempotency_key, amount_cents, outcome)
          VALUES ($1, 'schema-live-2', 5000, 'succeeded')`,
         [IDS.bookings.zoeUpperMath]
      );
      expect(postgresErrorCode(second as Error)).toBe('23505');
   });

   it('T03c rejects a fifth confirmed booking even when the service layer is bypassed', async () => {
      const [student] = await createStudents(database, 1, 2);
      expect(student).toBeDefined();

      const result = await insertBooking(student!.studentId, IDS.classes.lowerScience, 'confirmed');

      expect(result).toBeInstanceOf(Error);
      expect(postgresErrorCode(result as Error)).toBe('23514');
      expect((result as Error).message).toContain('at capacity');
   });

   it('T04 seeds the four documented class states', async () => {
      expect(await seatsOf(database, IDS.classes.lowerMath)).toEqual({ confirmed: 1, held: 0 });
      expect(await seatsOf(database, IDS.classes.upperScience)).toEqual({ confirmed: 3, held: 0 });
      expect(await seatsOf(database, IDS.classes.lowerScience)).toEqual({ confirmed: 4, held: 0 });
      expect(await seatsOf(database, IDS.classes.upperMath)).toEqual({ confirmed: 0, held: 0 });
   });
});
