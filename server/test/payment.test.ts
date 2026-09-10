import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '../src/domain/errors';
import { createBooking, getRoster, payForBooking } from '../src/services';
import {
   IDS,
   assertInvariants,
   attemptsFor,
   crashingProvider,
   createTestContext,
   expectDomainError,
   expectOk,
   resetData,
   seatsOf,
   statusOf,
   withDeps,
} from './helpers';

const context = createTestContext();
const { database, clock, provider, deps } = context;

const holdUpperScienceForChloe = async () =>
   expectOk(
      await createBooking(deps, {
         parentId: IDS.parents.meiLingTan,
         studentId: IDS.students.chloeTan,
         trialClassId: IDS.classes.upperScience,
      })
   ).booking;

beforeEach(() => resetData(context));
afterEach(() => assertInvariants(database));
afterAll(() => database.shutdown());

describe('payForBooking', () => {
   it('T10 confirms a held seat and puts the student on the roster', async () => {
      const booking = await holdUpperScienceForChloe();

      const result = expectOk(
         await payForBooking(deps, {
            parentId: IDS.parents.meiLingTan,
            bookingId: booking.id,
            idempotencyKey: 'pay-success-1',
            simulate: 'succeed',
         })
      );

      expect(result.booking.status).toBe('confirmed');
      expect(result.payment).toEqual({ outcome: 'succeeded', failureReason: null });
      expect(result.replayed).toBe(false);

      const attempts = await attemptsFor(database, booking.id);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]?.outcome).toBe('succeeded');
      expect(attempts[0]?.provider_ref).toBe('mock_pay-success-1');

      const roster = expectOk(await getRoster(deps, { trialClassId: IDS.classes.upperScience }));
      expect(roster.confirmed).toHaveLength(4);
      expect(roster.confirmed.map((entry) => entry.studentName)).toContain('Chloe Tan');
      expect(roster.activeHolds).toBe(0);
   });

   it('T11 releases the seat when the card is declined and allows a fresh booking', async () => {
      const booking = await holdUpperScienceForChloe();

      const result = expectOk(
         await payForBooking(deps, {
            parentId: IDS.parents.meiLingTan,
            bookingId: booking.id,
            idempotencyKey: 'pay-declined-1',
            simulate: 'fail',
         })
      );

      expect(result.booking.status).toBe('payment_failed');
      expect(result.payment).toEqual({ outcome: 'failed', failureReason: 'card_declined' });
      expect(await seatsOf(database, IDS.classes.upperScience)).toEqual({ confirmed: 3, held: 0 });

      const roster = expectOk(await getRoster(deps, { trialClassId: IDS.classes.upperScience }));
      expect(roster.confirmed).toHaveLength(3);

      const rebooked = expectOk(
         await createBooking(deps, {
            parentId: IDS.parents.meiLingTan,
            studentId: IDS.students.chloeTan,
            trialClassId: IDS.classes.upperScience,
         })
      );
      expect(rebooked.booking.id).not.toBe(booking.id);
      expect(rebooked.booking.status).toBe('pending_payment');
   });

   it('T12 charges once for a repeated idempotency key, sequentially and in parallel', async () => {
      const booking = await holdUpperScienceForChloe();
      const request = {
         parentId: IDS.parents.meiLingTan,
         bookingId: booking.id,
         idempotencyKey: 'pay-replay-1',
         simulate: 'succeed' as const,
      };

      const first = expectOk(await payForBooking(deps, request));
      const replay = expectOk(await payForBooking(deps, request));

      expect(first.replayed).toBe(false);
      expect(replay.replayed).toBe(true);
      expect(replay.booking.status).toBe('confirmed');
      expect(provider.calls).toHaveLength(1);

      const secondBooking = expectOk(
         await createBooking(deps, {
            parentId: IDS.parents.danielLim,
            studentId: IDS.students.ryanLim,
            trialClassId: IDS.classes.upperMath,
         })
      ).booking;

      const parallelRequest = {
         parentId: IDS.parents.danielLim,
         bookingId: secondBooking.id,
         idempotencyKey: 'pay-replay-parallel',
         simulate: 'succeed' as const,
      };
      const outcomes = await Promise.all(
         Array.from({ length: 5 }, () => payForBooking(deps, parallelRequest))
      );

      expect(provider.calls).toHaveLength(2);
      expect(await attemptsFor(database, secondBooking.id)).toHaveLength(1);
      expect(await statusOf(database, secondBooking.id)).toBe('confirmed');

      for (const outcome of outcomes) {
         if (outcome instanceof DomainError) {
            expect(outcome.code).toBe('payment_in_progress');
            continue;
         }
         expect(expectOk(outcome).booking.status).toBe('confirmed');
      }
   });

   it('T13 refuses an idempotency key that belongs to another booking', async () => {
      const chloe = await holdUpperScienceForChloe();
      const ryan = expectOk(
         await createBooking(deps, {
            parentId: IDS.parents.danielLim,
            studentId: IDS.students.ryanLim,
            trialClassId: IDS.classes.upperMath,
         })
      ).booking;

      expectOk(
         await payForBooking(deps, {
            parentId: IDS.parents.meiLingTan,
            bookingId: chloe.id,
            idempotencyKey: 'shared-key',
            simulate: 'succeed',
         })
      );

      const reused = await payForBooking(deps, {
         parentId: IDS.parents.danielLim,
         bookingId: ryan.id,
         idempotencyKey: 'shared-key',
         simulate: 'succeed',
      });

      expectDomainError(reused, 'idempotency_key_reused');
      expect(provider.calls).toHaveLength(1);
      expect(await attemptsFor(database, ryan.id)).toHaveLength(0);
   });

   it('T14 refuses to pay a booking that is already settled', async () => {
      const booking = await holdUpperScienceForChloe();
      expectOk(
         await payForBooking(deps, {
            parentId: IDS.parents.meiLingTan,
            bookingId: booking.id,
            idempotencyKey: 'settled-1',
            simulate: 'succeed',
         })
      );
      provider.calls.length = 0;

      expectDomainError(
         await payForBooking(deps, {
            parentId: IDS.parents.meiLingTan,
            bookingId: booking.id,
            idempotencyKey: 'settled-2',
            simulate: 'succeed',
         }),
         'booking_not_payable'
      );

      expectDomainError(
         await payForBooking(deps, {
            parentId: IDS.parents.sarahGoh,
            bookingId: IDS.bookings.zoeUpperMath,
            idempotencyKey: 'settled-3',
            simulate: 'succeed',
         }),
         'booking_not_payable'
      );

      expect(provider.calls).toHaveLength(0);
   });

   it('T23 charges once when two payments race with different keys', async () => {
      const booking = await holdUpperScienceForChloe();
      const base = {
         parentId: IDS.parents.meiLingTan,
         bookingId: booking.id,
         simulate: 'succeed' as const,
      };

      const [first, second] = await Promise.all([
         payForBooking(deps, { ...base, idempotencyKey: 'race-key-a' }),
         payForBooking(deps, { ...base, idempotencyKey: 'race-key-b' }),
      ]);

      const results = [first, second];
      const rejected = results.filter((result) => result instanceof DomainError);
      const accepted = results.filter((result) => !(result instanceof Error));

      expect(accepted).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as DomainError).code).toBe('payment_in_progress');
      expect(provider.calls).toHaveLength(1);
      expect(await attemptsFor(database, booking.id)).toHaveLength(1);
      expect(await statusOf(database, booking.id)).toBe('confirmed');
   });

   it('T24 keeps the attempt pending when the provider call never returns', async () => {
      const booking = await holdUpperScienceForChloe();
      const crashing = crashingProvider();

      const crashed = await payForBooking(withDeps(context, { paymentProvider: crashing }), {
         parentId: IDS.parents.meiLingTan,
         bookingId: booking.id,
         idempotencyKey: 'crash-1',
         simulate: 'succeed',
      });

      expect(crashed).toBeInstanceOf(Error);
      expect(crashed).not.toBeInstanceOf(DomainError);
      expect(crashing.calls).toHaveLength(1);

      const attempts = await attemptsFor(database, booking.id);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]?.outcome).toBe('pending');
      expect(await statusOf(database, booking.id)).toBe('pending_payment');

      expectDomainError(
         await payForBooking(deps, {
            parentId: IDS.parents.meiLingTan,
            bookingId: booking.id,
            idempotencyKey: 'crash-2',
            simulate: 'succeed',
         }),
         'payment_in_progress'
      );
      expect(provider.calls).toHaveLength(0);

      clock.advance(601);
      const rebooked = expectOk(
         await createBooking(deps, {
            parentId: IDS.parents.meiLingTan,
            studentId: IDS.students.chloeTan,
            trialClassId: IDS.classes.upperScience,
         })
      );
      expect(rebooked.booking.id).not.toBe(booking.id);
   });

   it('T25 refuses payment once the class has started, before touching the provider', async () => {
      const booking = expectOk(
         await createBooking(deps, {
            parentId: IDS.parents.priyaNair,
            studentId: IDS.students.meeraNair,
            trialClassId: IDS.classes.lowerMath,
         })
      ).booking;

      clock.advance(3 * 24 * 60 * 60);

      expectDomainError(
         await payForBooking(deps, {
            parentId: IDS.parents.priyaNair,
            bookingId: booking.id,
            idempotencyKey: 'started-1',
            simulate: 'succeed',
         }),
         'class_already_started'
      );

      expect(provider.calls).toHaveLength(0);
      expect(await attemptsFor(database, booking.id)).toHaveLength(0);
   });
});
