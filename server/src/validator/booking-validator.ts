import { z } from 'zod';
import { uuid } from './shared';

export const createBookingSchema = z.object({
   studentId: uuid,
   trialClassId: uuid,
});

export const listTrialClassesSchema = z.object({
   studentId: uuid.optional(),
});

export const bookingIdSchema = z.object({
   id: uuid,
});

export const trialClassIdSchema = z.object({
   id: uuid,
});

export type CreateBookingBody = z.infer<typeof createBookingSchema>;
