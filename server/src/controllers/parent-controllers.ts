import type { Request, Response } from 'express';
import { respondError } from '../middlewares';
import type { ServiceDeps } from '../services/deps';
import { listParents } from '../services';

export const listParentsController =
   (deps: ServiceDeps) =>
   async (_req: Request, res: Response): Promise<Response> => {
      const parents = await listParents(deps);
      if (parents instanceof Error) return respondError(res, parents);

      return res.json(parents);
   };
