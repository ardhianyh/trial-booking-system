import type { QueryResult, QueryResultRow } from 'pg';

export interface TransactionClient {
   query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T> | Error>;
}

export interface Database extends TransactionClient {
   transaction<T>(fn: (tx: TransactionClient) => Promise<T | Error>): Promise<T | Error>;
   shutdown(): Promise<void>;
}

export type Subject = 'math' | 'science';
export type LevelBand = 'lower' | 'upper';

export type BookingStatus =
   | 'pending_payment'
   | 'confirmed'
   | 'payment_failed'
   | 'expired'
   | 'refund_required';

export type PaymentOutcome = 'pending' | 'succeeded' | 'failed';
export type SettledOutcome = Exclude<PaymentOutcome, 'pending'>;
export type PaymentSimulation = 'succeed' | 'fail';

export type Eligibility = 'eligible' | 'level_mismatch' | 'already_booked' | 'held_by_you' | 'full';

export interface ParentRow {
   id: string;
   name: string;
   email: string;
}

export interface StudentRow {
   id: string;
   parent_id: string;
   name: string;
   level: number;
}

export interface TrialClassRow {
   id: string;
   subject: Subject;
   level_band: LevelBand;
   starts_at: Date;
   capacity: number;
}

export interface BookingRow {
   id: string;
   student_id: string;
   trial_class_id: string;
   status: BookingStatus;
   price_cents: number;
   hold_expires_at: Date;
   confirmed_at: Date | null;
   created_at: Date;
   updated_at: Date;
}

export interface PaymentAttemptRow {
   id: string;
   booking_id: string;
   idempotency_key: string;
   amount_cents: number;
   outcome: PaymentOutcome;
   failure_reason: string | null;
   provider_ref: string | null;
   created_at: Date;
}

export interface SeatCount {
   confirmed: number;
   held: number;
}

export interface SeatSummary extends SeatCount {
   capacity: number;
   available: number;
}

export interface StudentView {
   id: string;
   name: string;
   level: number;
}

export interface ParentView {
   id: string;
   name: string;
   email: string;
   students: StudentView[];
}

export interface TrialClassSummaryView {
   id: string;
   subject: Subject;
   levelBand: LevelBand;
   startsAt: string;
}

export interface TrialClassView extends TrialClassSummaryView {
   seats: SeatSummary;
   eligibility?: Eligibility;
}

export interface BookingView {
   id: string;
   status: BookingStatus;
   holdExpiresAt: string;
   confirmedAt: string | null;
   amountCents: number;
   student: StudentView;
   trialClass: TrialClassSummaryView;
}

export interface PaymentView {
   outcome: SettledOutcome;
   failureReason: string | null;
}

export interface RosterEntryView {
   bookingId: string;
   studentName: string;
   level: number;
   parentName: string;
   parentEmail: string;
   confirmedAt: string;
}

export interface RefundEntryView {
   bookingId: string;
   studentName: string;
   parentEmail: string;
}

export interface RosterView {
   trialClass: TrialClassView;
   confirmed: RosterEntryView[];
   activeHolds: number;
   refundRequired: RefundEntryView[];
}
