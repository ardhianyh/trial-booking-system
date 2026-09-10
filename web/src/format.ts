import type { BookingStatus, Eligibility, LevelBand, Subject } from './api';

const dateFormatter = new Intl.DateTimeFormat('en-SG', {
   timeZone: 'Asia/Singapore',
   weekday: 'short',
   day: 'numeric',
   month: 'short',
   hour: 'numeric',
   minute: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-SG', {
   timeZone: 'Asia/Singapore',
   hour: 'numeric',
   minute: '2-digit',
});

export const formatDateTime = (iso: string) => dateFormatter.format(new Date(iso));

export const formatTime = (iso: string) => timeFormatter.format(new Date(iso));

export const formatPrice = (cents: number) =>
   `S$${(cents / 100).toLocaleString('en-SG', { minimumFractionDigits: 2 })}`;

export const formatCountdown = (msRemaining: number) => {
   const total = Math.max(Math.floor(msRemaining / 1000), 0);
   const minutes = Math.floor(total / 60);
   const seconds = total % 60;
   return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const bandLabel: Record<LevelBand, string> = {
   lower: 'Lower Primary',
   upper: 'Upper Primary',
};

const subjectLabel: Record<Subject, string> = {
   math: 'Math',
   science: 'Science',
};

export const classTitle = (levelBand: LevelBand, subject: Subject) =>
   `${bandLabel[levelBand]} ${subjectLabel[subject]}`;

export const eligibilityLabel = (eligibility: Eligibility, level: number): string => {
   const labels: Record<Eligibility, string> = {
      eligible: '',
      level_mismatch: `Not for P${level}`,
      already_booked: 'Already booked',
      held_by_you: 'Your hold',
      full: 'Full',
   };
   return labels[eligibility];
};

export const statusHeadline: Record<BookingStatus, string> = {
   pending_payment: 'Seat held',
   confirmed: 'Booked',
   payment_failed: 'Payment declined',
   expired: 'Hold expired',
   refund_required: 'Refund on the way',
};

export const errorMessage = (code: string, studentName: string): string => {
   const messages: Record<string, string> = {
      class_full: 'This class just filled up. Pick another time.',
      already_booked: `${studentName} is already booked into this class.`,
      payment_in_progress:
         'A payment for this booking is already being processed. Refresh to see the result.',
      class_already_started: 'This class has already started, so it can no longer be paid for.',
      level_mismatch: 'That class is for a different primary level.',
      booking_not_payable: 'This booking can no longer be paid for.',
      not_your_child: 'That child belongs to another parent.',
      not_your_booking: 'That booking belongs to another parent.',
      idempotency_key_reused: 'That payment reference was already used. Try again.',
   };
   return messages[code] ?? 'Something went wrong. Please try again.';
};
