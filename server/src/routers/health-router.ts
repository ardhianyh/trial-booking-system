import { Router } from 'express';
import { healthController } from '../controllers/health-controllers';
import { asyncHandler } from '../middlewares';
import type { ServiceDeps } from '../services/deps';

export const healthRouter = (deps: ServiceDeps): Router => {
   const router = Router();
   router.get('/health', asyncHandler(healthController(deps)));
   return router;
};
