import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '../src/domain/errors';
import { createBooking, getRoster, payForBooking } from '../src/services';
import {
   IDS,
   assertInvariants,
   createStudents,
   createTestContext,
   expectDomainError,
   expectOk,
   resetData,
   seatsOf,
   statusOf,
   withDeps,
} from './helpers';

const context = createTestContext();
const { database, clock, deps } = context;

const LAST_SEAT_CLASS = IDS.classes.upperScience;

const wait = (ms: number): Promise<void> =>
   new Promise<void>((resolve) => setTimeout(resolve, ms));

const holdLastSeat = async (parentId: string, studentId: string) =>
   expectOk(await createBooking(deps, { parentId, studentId, trialClassId: LAST_SEAT_CLASS })).booking;

const pay = (parentId: string, bookingId: string, idempotencyKey: string) =>
   payForBooking(deps, { parentId, bookingId, idempotencyKey, simulate: 'succeed' });

beforeEach(() => resetData(context));
afterEach(() => assertInvariants(database));
afterAll(() => database.shutdown());

describe('last-seat race', () => {
   it('T15 gives the last seat to exactly one of twenty concurrent parents', async () => {
      const students = await createStudents(database, 20, 5);
      const racingDeps = withDeps(context, { hooks: { afterSeatCount: () => wait(20) } });

      const results = await Promise.all(
         students.map((student) =>
            createBooking(racingDeps, {
               parentId: student.parentId,
               studentId: student.studentId,
               trialClassId: LAST_SEAT_CLASS,
            })
         )
      );

      const held = results.filter((result) => !(result instanceof Error));
      const rejected = results.filter((result) => result instanceof DomainError) as DomainError[];

      expect(held).toHaveLength(1);
      expect(rejected).toHaveLength(19);
      expect(rejected.every((error) => error.code === 'class_full')).toBe(true);
      expect(await seatsOf(database, LAST_SEAT_CLASS)).toEqual({ confirmed: 3, held: 1 });
   });

   it('T16 blocks the second parent while the first hold is still valid', async () => {
      const chloe = await holdLastSeat(IDS.parents.meiLingTan, IDS.students.chloeTan);

      expectDomainError(
         await createBooking(deps, {
            parentId: IDS.parents.sarahGoh,
            studentId: IDS.students.zoeGoh,
            trialClassId: LAST_SEAT_CLASS,
         }),
         'class_full'
      );

      const paid = expectOk(await pay(IDS.parents.meiLingTan, chloe.id, 'valid-hold-1'));
      expect(paid.booking.status).toBe('confirmed');

      const roster = expectOk(await getRoster(deps, { trialClassId: LAST_SEAT_CLASS }));
      expect(roster.confirmed).toHaveLength(4);
      expect(roster.refundRequired).toHaveLength(0);
   });

   it('T17 reproduces the brief scenario once the first hold has expired', async () => {
      const chloe = await holdLastSeat(IDS.parents.meiLingTan, IDS.students.chloeTan);

      clock.advance(601);

      const zoe = await holdLastSeat(IDS.parents.sarahGoh, IDS.students.zoeGoh);
      const zoePaid = expectOk(await pay(IDS.parents.sarahGoh, zoe.id, 'brief-zoe'));
      expect(zoePaid.booking.status).toBe('confirmed');

      const chloePaid = expectOk(await pay(IDS.parents.meiLingTan, chloe.id, 'brief-chloe'));
      expect(chloePaid.booking.status).toBe('refund_required');
      expect(chloePaid.payment.outcome).toBe('succeeded');

      const roster = expectOk(await getRoster(deps, { trialClassId: LAST_SEAT_CLASS }));
      expect(roster.confirmed).toHaveLength(4);
      expect(roster.confirmed.map((entry) => entry.studentName)).toContain('Zoe Goh');
      expect(roster.confirmed.map((entry) => entry.studentName)).not.toContain('Chloe Tan');
      expect(roster.refundRequired).toEqual([
         expect.objectContaining({ studentName: 'Chloe Tan', bookingId: chloe.id }),
      ]);
   });

   it('T18 still confirms a late payment when the seat is free', async () => {
      const chloe = await holdLastSeat(IDS.parents.meiLingTan, IDS.students.chloeTan);

      clock.advance(601);

      const paid = expectOk(await pay(IDS.parents.meiLingTan, chloe.id, 'late-but-free'));
      expect(paid.booking.status).toBe('confirmed');
      expect(await seatsOf(database, LAST_SEAT_CLASS)).toEqual({ confirmed: 4, held: 0 });
   });

   it('T19 always prefers the live hold over the late payment, whatever the interleaving', async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
         await resetData(context);

         const chloe = await holdLastSeat(IDS.parents.meiLingTan, IDS.students.chloeTan);
         clock.advance(601);
         const zoe = await holdLastSeat(IDS.parents.sarahGoh, IDS.students.zoeGoh);

         const [chloeResult, zoeResult] = await Promise.all([
            pay(IDS.parents.meiLingTan, chloe.id, `interleaved-chloe-${attempt}`),
            pay(IDS.parents.sarahGoh, zoe.id, `interleaved-zoe-${attempt}`),
         ]);

         expect(expectOk(zoeResult).booking.status).toBe('confirmed');
         expect(expectOk(chloeResult).booking.status).toBe('refund_required');
         expect(await seatsOf(database, LAST_SEAT_CLASS)).toEqual({ confirmed: 4, held: 0 });
      }
   });

   it('T20 lets a parent rebook after their own hold expired', async () => {
      const first = await holdLastSeat(IDS.parents.meiLingTan, IDS.students.chloeTan);

      clock.advance(601);

      const second = await holdLastSeat(IDS.parents.meiLingTan, IDS.students.chloeTan);

      expect(second.id).not.toBe(first.id);
      expect(await statusOf(database, first.id)).toBe('expired');
      expect(await statusOf(database, second.id)).toBe('pending_payment');
      expect(await seatsOf(database, LAST_SEAT_CLASS)).toEqual({ confirmed: 3, held: 1 });
   });
});
