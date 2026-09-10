import { z } from 'zod';

export const payBookingSchema = z.object({
   idempotencyKey: z.string().min(8).max(200),
   simulate: z.enum(['succeed', 'fail']),
});

export type PayBookingBody = z.infer<typeof payBookingSchema>;
