import type { Request, Response } from 'express';
import { parentIdOf, respondError } from '../middlewares';
import { createBooking, getBooking } from '../services';
import type { ServiceDeps } from '../services/deps';
import { bookingIdSchema, createBookingSchema } from '../validator/booking-validator';
import { parse } from '../validator/shared';

export const createBookingController =
   (deps: ServiceDeps) =>
   async (req: Request, res: Response): Promise<Response> => {
      const body = parse(createBookingSchema, req.body);
      if (body instanceof Error) return respondError(res, body);

      const result = await createBooking(deps, {
         parentId: parentIdOf(req),
         studentId: body.studentId,
         trialClassId: body.trialClassId,
      });
      if (result instanceof Error) return respondError(res, result);

      return res.status(result.resumed ? 200 : 201).json(result);
   };

export const getBookingController =
   (deps: ServiceDeps) =>
   async (req: Request, res: Response): Promise<Response> => {
      const params = parse(bookingIdSchema, req.params);
      if (params instanceof Error) return respondError(res, params);

      const result = await getBooking(deps, {
         parentId: parentIdOf(req),
         bookingId: params.id,
      });
      if (result instanceof Error) return respondError(res, result);

      return res.json(result);
   };
