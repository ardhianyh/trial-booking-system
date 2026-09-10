import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBooking, getBooking } from '../src/services';
import {
   IDS,
   assertInvariants,
   createStudents,
   createTestContext,
   expectDomainError,
   expectOk,
   resetData,
   seatsOf,
} from './helpers';

const context = createTestContext();
const { database, clock, deps } = context;

beforeEach(() => resetData(context));
afterEach(() => assertInvariants(database));
afterAll(() => database.shutdown());

describe('createBooking', () => {
   it('T05 holds a seat for ten minutes', async () => {
      const before = clock.now();
      const result = expectOk(
         await createBooking(deps, {
            parentId: IDS.parents.meiLingTan,
            studentId: IDS.students.chloeTan,
            trialClassId: IDS.classes.upperScience,
         })
      );

      expect(result.resumed).toBe(false);
      expect(result.booking.status).toBe('pending_payment');
      expect(result.booking.amountCents).toBe(5000);
      expect(new Date(result.booking.holdExpiresAt).getTime()).toBe(before.getTime() + 600_000);
      expect(await seatsOf(database, IDS.classes.upperScience)).toEqual({ confirmed: 3, held: 1 });
   });

   it('T06 refuses a class the student is already confirmed in', async () => {
      const result = await createBooking(deps, {
         parentId: IDS.parents.meiLingTan,
         studentId: IDS.students.ethanTan,
         trialClassId: IDS.classes.lowerMath,
      });

      expectDomainError(result, 'already_booked');
   });

   it('T07 is idempotent for repeated and concurrent submissions', async () => {
      const input = {
         parentId: IDS.parents.meiLingTan,
         studentId: IDS.students.chloeTan,
         trialClassId: IDS.classes.upperScience,
      };

      const first = expectOk(await createBooking(deps, input));
      const second = expectOk(await createBooking(deps, input));

      expect(second.resumed).toBe(true);
      expect(second.booking.id).toBe(first.booking.id);

      const concurrent = await Promise.all(Array.from({ length: 5 }, () => createBooking(deps, input)));
      const ids = new Set(concurrent.map((result) => expectOk(result).booking.id));

      expect(ids).toEqual(new Set([first.booking.id]));
      expect(await seatsOf(database, IDS.classes.upperScience)).toEqual({ confirmed: 3, held: 1 });
   });

   it('T08 refuses a class that is already full', async () => {
      const [student] = await createStudents(database, 1, 2);

      const result = await createBooking(deps, {
         parentId: student!.parentId,
         studentId: student!.studentId,
         trialClassId: IDS.classes.lowerScience,
      });

      expectDomainError(result, 'class_full');
   });

   it('T09 rejects level mismatch, foreign children, missing rows and started classes', async () => {
      expectDomainError(
         await createBooking(deps, {
            parentId: IDS.parents.meiLingTan,
            studentId: IDS.students.ethanTan,
            trialClassId: IDS.classes.upperScience,
         }),
         'level_mismatch'
      );

      expectDomainError(
         await createBooking(deps, {
            parentId: IDS.parents.meiLingTan,
            studentId: IDS.students.zoeGoh,
            trialClassId: IDS.classes.upperMath,
         }),
         'not_your_child'
      );

      expectDomainError(
         await createBooking(deps, {
            parentId: IDS.parents.meiLingTan,
            studentId: '20000000-0000-4000-8000-0000000000ff',
            trialClassId: IDS.classes.upperScience,
         }),
         'student_not_found'
      );

      expectDomainError(
         await createBooking(deps, {
            parentId: IDS.parents.meiLingTan,
            studentId: IDS.students.chloeTan,
            trialClassId: '30000000-0000-4000-8000-0000000000ff',
         }),
         'class_not_found'
      );

      clock.advance(3 * 24 * 60 * 60);
      expectDomainError(
         await createBooking(deps, {
            parentId: IDS.parents.priyaNair,
            studentId: IDS.students.meeraNair,
            trialClassId: IDS.classes.lowerMath,
         }),
         'class_already_started'
      );
   });
});

describe('getBooking', () => {
   it('returns the effective status and the latest settled payment', async () => {
      const result = expectOk(
         await getBooking(deps, {
            parentId: IDS.parents.sarahGoh,
            bookingId: IDS.bookings.zoeUpperMath,
         })
      );

      expect(result.booking.status).toBe('payment_failed');
      expect(result.payment).toEqual({ outcome: 'failed', failureReason: 'card_declined' });
   });

   it('refuses to read another parent booking', async () => {
      expectDomainError(
         await getBooking(deps, {
            parentId: IDS.parents.meiLingTan,
            bookingId: IDS.bookings.zoeUpperMath,
         }),
         'not_your_booking'
      );
   });
});
