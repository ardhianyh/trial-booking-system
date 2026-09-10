export type Subject = 'math' | 'science';
export type LevelBand = 'lower' | 'upper';

export type BookingStatus =
   | 'pending_payment'
   | 'confirmed'
   | 'payment_failed'
   | 'expired'
   | 'refund_required';

export type Eligibility = 'eligible' | 'level_mismatch' | 'already_booked' | 'held_by_you' | 'full';

export interface Student {
   id: string;
   name: string;
   level: number;
}

export interface Parent {
   id: string;
   name: string;
   email: string;
   students: Student[];
}

export interface Seats {
   capacity: number;
   confirmed: number;
   held: number;
   available: number;
}

export interface TrialClass {
   id: string;
   subject: Subject;
   levelBand: LevelBand;
   startsAt: string;
   seats: Seats;
   eligibility?: Eligibility;
}

export interface Booking {
   id: string;
   status: BookingStatus;
   holdExpiresAt: string;
   confirmedAt: string | null;
   amountCents: number;
   student: Student;
   trialClass: { id: string; subject: Subject; levelBand: LevelBand; startsAt: string };
}

export interface Payment {
   outcome: 'succeeded' | 'failed';
   failureReason: string | null;
}

export interface BookingResponse {
   booking: Booking;
   resumed?: boolean;
   payment?: Payment | null;
   replayed?: boolean;
}

export interface Roster {
   trialClass: TrialClass;
   confirmed: Array<{
      bookingId: string;
      studentName: string;
      level: number;
      parentName: string;
      parentEmail: string;
      confirmedAt: string;
   }>;
   activeHolds: number;
   refundRequired: Array<{ bookingId: string; studentName: string; parentEmail: string }>;
}

export interface ApiErrorBody {
   code: string;
   message: string;
   details?: Record<string, unknown>;
}

export class ApiError extends Error {
   constructor(public readonly code: string, message: string) {
      super(message);
      this.name = 'ApiError';
   }
}

const send = async <T>(path: string, init?: RequestInit): Promise<T> => {
   const response = await fetch(path, init);
   const payload = (await response.json().catch(() => null)) as
      | T
      | { error: ApiErrorBody }
      | null;

   if (!response.ok) {
      const body = payload as { error?: ApiErrorBody } | null;
      throw new ApiError(
         body?.error?.code ?? 'internal_error',
         body?.error?.message ?? 'The request failed.'
      );
   }

   return payload as T;
};

const asParent = (parentId: string): RequestInit => ({
   headers: { 'X-Parent-Id': parentId },
});

const asParentJson = (parentId: string, body: unknown): RequestInit => ({
   method: 'POST',
   headers: { 'X-Parent-Id': parentId, 'Content-Type': 'application/json' },
   body: JSON.stringify(body),
});

export const fetchParents = () => send<Parent[]>('/api/parents');

export const fetchTrialClasses = (parentId: string, studentId?: string) =>
   send<TrialClass[]>(
      studentId ? `/api/trial-classes?studentId=${studentId}` : '/api/trial-classes',
      asParent(parentId)
   );

export const holdSeat = (parentId: string, studentId: string, trialClassId: string) =>
   send<BookingResponse>('/api/bookings', asParentJson(parentId, { studentId, trialClassId }));

export const fetchBooking = (parentId: string, bookingId: string) =>
   send<BookingResponse>(`/api/bookings/${bookingId}`, asParent(parentId));

export const payBooking = (
   parentId: string,
   bookingId: string,
   simulate: 'succeed' | 'fail',
   idempotencyKey: string
) =>
   send<BookingResponse>(
      `/api/bookings/${bookingId}/payments`,
      asParentJson(parentId, { idempotencyKey, simulate })
   );

export const fetchRoster = (trialClassId: string) =>
   send<Roster>(`/api/trial-classes/${trialClassId}/roster`);
