import { DomainError } from '../domain/errors';
import { holdExpiryFrom, levelBandFor } from '../domain/rules';
import {
   bookingRepository,
   parentRepository,
   paymentAttemptRepository,
   trialClassRepository,
} from '../repositories';
import { isUniqueViolation } from '../utils/postgres';
import type { BookingView, PaymentView } from '../types';
import type { ServiceDeps } from './deps';
import { toBookingView, toPaymentView } from './views';

export interface CreateBookingInput {
   parentId: string;
   studentId: string;
   trialClassId: string;
}

export interface CreateBookingResult {
   booking: BookingView;
   resumed: boolean;
}

export interface GetBookingInput {
   parentId: string;
   bookingId: string;
}

export interface GetBookingResult {
   booking: BookingView;
   payment: PaymentView | null;
}

interface HoldOutcome {
   bookingId: string;
   resumed: boolean;
}

export const createBooking = async (
   deps: ServiceDeps,
   input: CreateBookingInput
): Promise<CreateBookingResult | Error> => {
   const now = deps.clock.now();

   const outcome = await deps.database.transaction<HoldOutcome>(async (tx) => {
      const student = await parentRepository.findStudentById(tx, input.studentId);
      if (student instanceof Error) return student;
      if (!student) return new DomainError('student_not_found', 'That student does not exist.');
      if (student.parent_id !== input.parentId) {
         return new DomainError('not_your_child', 'That student belongs to another parent.');
      }

      const trialClass = await trialClassRepository.lockClass(tx, input.trialClassId);
      if (trialClass instanceof Error) return trialClass;
      if (!trialClass) return new DomainError('class_not_found', 'That trial class does not exist.');

      if (trialClass.starts_at.getTime() <= now.getTime()) {
         return new DomainError('class_already_started', 'That trial class has already started.');
      }

      if (levelBandFor(student.level) !== trialClass.level_band) {
         return new DomainError('level_mismatch', 'That class is for a different primary level.', {
            studentLevel: student.level,
            levelBand: trialClass.level_band,
         });
      }

      const expired = await bookingRepository.expireStaleHolds(tx, trialClass.id, now);
      if (expired instanceof Error) return expired;

      const active = await bookingRepository.findActiveForStudentAndClass(tx, student.id, trialClass.id);
      if (active instanceof Error) return active;
      if (active) {
         if (active.status === 'confirmed') {
            return new DomainError('already_booked', 'That student is already booked into this class.');
         }
         return { bookingId: active.id, resumed: true };
      }

      const seats = await trialClassRepository.countSeats(tx, trialClass.id, now);
      if (seats instanceof Error) return seats;

      if (deps.hooks?.afterSeatCount) await deps.hooks.afterSeatCount();

      if (seats.confirmed + seats.held >= trialClass.capacity) {
         return new DomainError('class_full', 'This trial class has no seats left.', { available: 0 });
      }

      const bookingId = await bookingRepository.insertHold(tx, {
         studentId: student.id,
         trialClassId: trialClass.id,
         priceCents: deps.priceCents,
         holdExpiresAt: holdExpiryFrom(now, deps.holdSeconds),
         now,
      });

      if (bookingId instanceof Error) {
         if (isUniqueViolation(bookingId)) {
            return new DomainError('already_booked', 'That student is already booked into this class.');
         }
         return bookingId;
      }

      return { bookingId, resumed: false };
   });

   if (outcome instanceof Error) return outcome;

   const detail = await bookingRepository.findDetailById(deps.database, outcome.bookingId);
   if (detail instanceof Error) return detail;
   if (!detail) return new DomainError('booking_not_found', 'The booking disappeared after creation.');

   return { booking: toBookingView(detail, now), resumed: outcome.resumed };
};

export const getBooking = async (
   deps: ServiceDeps,
   input: GetBookingInput
): Promise<GetBookingResult | Error> => {
   const detail = await bookingRepository.findDetailById(deps.database, input.bookingId);
   if (detail instanceof Error) return detail;
   if (!detail) return new DomainError('booking_not_found', 'That booking does not exist.');
   if (detail.parent_id !== input.parentId) {
      return new DomainError('not_your_booking', 'That booking belongs to another parent.');
   }

   const attempt = await paymentAttemptRepository.findLatestByBooking(deps.database, detail.id);
   if (attempt instanceof Error) return attempt;

   return { booking: toBookingView(detail, deps.clock.now()), payment: toPaymentView(attempt) };
};
