import { DomainError } from '../domain/errors';
import { effectiveStatus, isPayableStatus } from '../domain/rules';
import type { ChargeResult } from '../payments/mock-payment-provider';
import {
   bookingRepository,
   paymentAttemptRepository,
   trialClassRepository,
} from '../repositories';
import type {
   BookingRow,
   BookingStatus,
   BookingView,
   PaymentAttemptRow,
   PaymentSimulation,
   PaymentView,
   TransactionClient,
   TrialClassRow,
} from '../types';
import { logger } from '../utils/logger';
import type { ServiceDeps } from './deps';
import { toBookingView } from './views';

export interface PayForBookingInput {
   parentId: string;
   bookingId: string;
   idempotencyKey: string;
   simulate: PaymentSimulation;
}

export interface PayForBookingResult {
   booking: BookingView;
   payment: PaymentView;
   replayed: boolean;
}

interface DecisionContext {
   tx: TransactionClient;
   booking: BookingRow;
   trialClass: TrialClassRow;
   effective: BookingStatus;
   outcome: ChargeResult['outcome'];
   now: Date;
}

const bookingViewOf = async (
   deps: ServiceDeps,
   bookingId: string,
   now: Date
): Promise<BookingView | Error> => {
   const detail = await bookingRepository.findDetailById(deps.database, bookingId);
   if (detail instanceof Error) return detail;
   if (!detail) return new DomainError('booking_not_found', 'That booking does not exist.');
   return toBookingView(detail, now);
};

const resolveExistingAttempt = async (
   deps: ServiceDeps,
   attempt: PaymentAttemptRow,
   bookingId: string
): Promise<PayForBookingResult | Error> => {
   if (attempt.booking_id !== bookingId) {
      return new DomainError(
         'idempotency_key_reused',
         'That idempotency key was already used for a different booking.'
      );
   }

   if (attempt.outcome === 'pending') {
      return new DomainError(
         'payment_in_progress',
         'A payment for this booking is already being processed.'
      );
   }

   const booking = await bookingViewOf(deps, bookingId, deps.clock.now());
   if (booking instanceof Error) return booking;

   return {
      booking,
      payment: { outcome: attempt.outcome, failureReason: attempt.failure_reason },
      replayed: true,
   };
};

const decideStatus = async (context: DecisionContext): Promise<BookingStatus | Error> => {
   const { tx, booking, trialClass, effective, outcome, now } = context;

   if (outcome === 'failed') {
      if (effective === 'pending_payment') return 'payment_failed';
      if (effective === 'expired') return 'expired';

      logger.error('Failed payment settled against a booking in an unexpected state', {
         bookingId: booking.id,
         status: effective,
      });
      return booking.status;
   }

   if (effective === 'pending_payment') {
      const seats = await trialClassRepository.countSeats(tx, trialClass.id, now, booking.id);
      if (seats instanceof Error) return seats;
      if (seats.confirmed < trialClass.capacity) return 'confirmed';

      logger.error('Held seat could not be confirmed because the class was already full', {
         bookingId: booking.id,
         trialClassId: trialClass.id,
      });
      return 'refund_required';
   }

   if (effective === 'expired') {
      const hasOther = await bookingRepository.hasOtherActiveBooking(
         tx,
         booking.student_id,
         trialClass.id,
         booking.id
      );
      if (hasOther instanceof Error) return hasOther;
      if (hasOther) return 'refund_required';

      const seats = await trialClassRepository.countSeats(tx, trialClass.id, now, booking.id);
      if (seats instanceof Error) return seats;

      return seats.confirmed + seats.held < trialClass.capacity ? 'confirmed' : 'refund_required';
   }

   logger.error('Successful payment settled against a booking in an unexpected state', {
      bookingId: booking.id,
      status: effective,
   });
   return 'refund_required';
};

export const payForBooking = async (
   deps: ServiceDeps,
   input: PayForBookingInput
): Promise<PayForBookingResult | Error> => {
   const replayed = await paymentAttemptRepository.findByIdempotencyKey(
      deps.database,
      input.idempotencyKey
   );
   if (replayed instanceof Error) return replayed;
   if (replayed) return resolveExistingAttempt(deps, replayed, input.bookingId);

   const detail = await bookingRepository.findDetailById(deps.database, input.bookingId);
   if (detail instanceof Error) return detail;
   if (!detail) return new DomainError('booking_not_found', 'That booking does not exist.');
   if (detail.parent_id !== input.parentId) {
      return new DomainError('not_your_booking', 'That booking belongs to another parent.');
   }

   const statusBeforeCharge = effectiveStatus(detail, deps.clock.now());
   if (!isPayableStatus(statusBeforeCharge)) {
      return new DomainError('booking_not_payable', 'This booking can no longer be paid for.', {
         status: statusBeforeCharge,
      });
   }

   if (detail.starts_at.getTime() <= deps.clock.now().getTime()) {
      return new DomainError('class_already_started', 'That trial class has already started.');
   }

   const attemptId = await paymentAttemptRepository.insertPending(deps.database, {
      bookingId: detail.id,
      idempotencyKey: input.idempotencyKey,
      amountCents: detail.price_cents,
      now: deps.clock.now(),
   });
   if (attemptId instanceof Error) return attemptId;

   if (attemptId === null) {
      const conflicting = await paymentAttemptRepository.findByIdempotencyKey(
         deps.database,
         input.idempotencyKey
      );
      if (conflicting instanceof Error) return conflicting;
      if (conflicting) return resolveExistingAttempt(deps, conflicting, input.bookingId);

      return new DomainError(
         'payment_in_progress',
         'A payment for this booking is already being processed.'
      );
   }

   let charge: ChargeResult;
   try {
      charge = await deps.paymentProvider.charge({
         amountCents: detail.price_cents,
         idempotencyKey: input.idempotencyKey,
         simulate: input.simulate,
      });
   } catch (error) {
      logger.error('Payment provider failed after the attempt was recorded', {
         bookingId: detail.id,
         attemptId,
         idempotencyKey: input.idempotencyKey,
      });
      return error instanceof Error ? error : new Error(String(error));
   }

   const settled = await deps.database.transaction<BookingStatus>(async (tx) => {
      const trialClass = await trialClassRepository.lockClass(tx, detail.trial_class_id);
      if (trialClass instanceof Error) return trialClass;
      if (!trialClass) return new DomainError('class_not_found', 'That trial class does not exist.');

      const booking = await bookingRepository.lockById(tx, detail.id);
      if (booking instanceof Error) return booking;
      if (!booking) return new DomainError('booking_not_found', 'That booking does not exist.');

      const settleResult = await paymentAttemptRepository.settle(tx, {
         attemptId,
         outcome: charge.outcome,
         failureReason: charge.outcome === 'failed' ? charge.failureReason : null,
         providerRef: charge.providerRef,
      });
      if (settleResult instanceof Error) return settleResult;

      const now = deps.clock.now();
      const nextStatus = await decideStatus({
         tx,
         booking,
         trialClass,
         effective: effectiveStatus(booking, now),
         outcome: charge.outcome,
         now,
      });
      if (nextStatus instanceof Error) return nextStatus;

      if (nextStatus !== booking.status) {
         const updated = await bookingRepository.updateStatus(tx, {
            bookingId: booking.id,
            status: nextStatus,
            now,
            confirmedAt: nextStatus === 'confirmed' ? now : null,
         });
         if (updated instanceof Error) return updated;
      }

      return nextStatus;
   });

   if (settled instanceof Error) return settled;

   const booking = await bookingViewOf(deps, detail.id, deps.clock.now());
   if (booking instanceof Error) return booking;

   return {
      booking,
      payment: {
         outcome: charge.outcome,
         failureReason: charge.outcome === 'failed' ? charge.failureReason : null,
      },
      replayed: false,
   };
};
