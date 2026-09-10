import type { Request, Response } from 'express';
import { respondError } from '../middlewares';
import type { ServiceDeps } from '../services/deps';

export const healthController =
   (deps: ServiceDeps) =>
   async (_req: Request, res: Response): Promise<Response> => {
      const result = await deps.database.query('SELECT 1');
      if (result instanceof Error) return respondError(res, result);

      return res.json({ ok: true });
   };
