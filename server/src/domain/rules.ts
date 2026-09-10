import type { BookingRow, BookingStatus, LevelBand } from '../types';

export const LOWER_PRIMARY_MAX_LEVEL = 3;

export const levelBandFor = (level: number): LevelBand =>
   level <= LOWER_PRIMARY_MAX_LEVEL ? 'lower' : 'upper';

type HoldableBooking = Pick<BookingRow, 'status' | 'hold_expires_at'>;

export const effectiveStatus = (booking: HoldableBooking, now: Date): BookingStatus =>
   booking.status === 'pending_payment' && booking.hold_expires_at.getTime() <= now.getTime()
      ? 'expired'
      : booking.status;

export const isPayableStatus = (status: BookingStatus): boolean =>
   status === 'pending_payment' || status === 'expired';

export const holdExpiryFrom = (now: Date, holdSeconds: number): Date =>
   new Date(now.getTime() + holdSeconds * 1000);
