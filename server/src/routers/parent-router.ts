import { Router } from 'express';
import { listParentsController } from '../controllers/parent-controllers';
import { asyncHandler } from '../middlewares';
import type { ServiceDeps } from '../services/deps';

export const parentRouter = (deps: ServiceDeps): Router => {
   const router = Router();
   router.get('/', asyncHandler(listParentsController(deps)));
   return router;
};
