import { Router } from 'express';
import {
   getRosterController,
   listTrialClassesController,
} from '../controllers/trial-class-controllers';
import { asyncHandler } from '../middlewares';
import type { ServiceDeps } from '../services/deps';

export const trialClassRouter = (deps: ServiceDeps): Router => {
   const router = Router();
   router.get('/', asyncHandler(listTrialClassesController(deps)));
   router.get('/:id/roster', asyncHandler(getRosterController(deps)));
   return router;
};
