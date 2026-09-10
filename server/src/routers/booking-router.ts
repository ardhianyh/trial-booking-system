import { Router } from 'express';
import { createBookingController, getBookingController } from '../controllers/booking-controllers';
import { payBookingController } from '../controllers/payment-controllers';
import { asyncHandler, requireParent } from '../middlewares';
import type { ServiceDeps } from '../services/deps';

export const bookingRouter = (deps: ServiceDeps): Router => {
   const router = Router();

   router.use(requireParent);
   router.post('/', asyncHandler(createBookingController(deps)));
   router.get('/:id', asyncHandler(getBookingController(deps)));
   router.post('/:id/payments', asyncHandler(payBookingController(deps)));

   return router;
};
