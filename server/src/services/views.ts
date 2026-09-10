import { effectiveStatus } from '../domain/rules';
import type { BookingDetailRow } from '../repositories/booking-repository';
import type { TrialClassWithSeatsRow } from '../repositories/trial-class-repository';
import type {
   BookingView,
   PaymentAttemptRow,
   PaymentView,
   SeatSummary,
   TrialClassView,
} from '../types';

export const toSeatSummary = (capacity: number, confirmed: number, held: number): SeatSummary => ({
   capacity,
   confirmed,
   held,
   available: Math.max(capacity - confirmed - held, 0),
});

export const toBookingView = (row: BookingDetailRow, now: Date): BookingView => ({
   id: row.id,
   status: effectiveStatus(row, now),
   holdExpiresAt: row.hold_expires_at.toISOString(),
   confirmedAt: row.confirmed_at ? row.confirmed_at.toISOString() : null,
   amountCents: row.price_cents,
   student: { id: row.student_id, name: row.student_name, level: row.student_level },
   trialClass: {
      id: row.trial_class_id,
      subject: row.subject,
      levelBand: row.level_band,
      startsAt: row.starts_at.toISOString(),
   },
});

export const toTrialClassView = (row: TrialClassWithSeatsRow): TrialClassView => ({
   id: row.id,
   subject: row.subject,
   levelBand: row.level_band,
   startsAt: row.starts_at.toISOString(),
   seats: toSeatSummary(row.capacity, row.confirmed, row.held),
});

export const toPaymentView = (attempt: PaymentAttemptRow | null): PaymentView | null =>
   attempt === null || attempt.outcome === 'pending'
      ? null
      : { outcome: attempt.outcome, failureReason: attempt.failure_reason };
