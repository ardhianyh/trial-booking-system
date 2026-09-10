import type { Request, Response } from 'express';
import { parentIdOf, respondError } from '../middlewares';
import { payForBooking } from '../services';
import type { ServiceDeps } from '../services/deps';
import { bookingIdSchema } from '../validator/booking-validator';
import { payBookingSchema } from '../validator/payment-validator';
import { parse } from '../validator/shared';

export const payBookingController =
   (deps: ServiceDeps) =>
   async (req: Request, res: Response): Promise<Response> => {
      const params = parse(bookingIdSchema, req.params);
      if (params instanceof Error) return respondError(res, params);

      const body = parse(payBookingSchema, req.body);
      if (body instanceof Error) return respondError(res, body);

      const result = await payForBooking(deps, {
         parentId: parentIdOf(req),
         bookingId: params.id,
         idempotencyKey: body.idempotencyKey,
         simulate: body.simulate,
      });
      if (result instanceof Error) return respondError(res, result);

      return res.json(result);
   };
