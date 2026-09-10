import type { Request, Response } from 'express';
import { DomainError } from '../domain/errors';
import { respondError } from '../middlewares';
import { getRoster, listTrialClasses } from '../services';
import type { ServiceDeps } from '../services/deps';
import { listTrialClassesSchema, trialClassIdSchema } from '../validator/booking-validator';
import { isUuid, parse } from '../validator/shared';

export const listTrialClassesController =
   (deps: ServiceDeps) =>
   async (req: Request, res: Response): Promise<Response> => {
      const query = parse(listTrialClassesSchema, req.query);
      if (query instanceof Error) return respondError(res, query);

      const parentId = req.header('X-Parent-Id');

      if (query.studentId && !parentId) {
         return respondError(
            res,
            new DomainError('missing_parent', 'Filtering by student requires an X-Parent-Id header.')
         );
      }

      if (parentId && !isUuid(parentId)) {
         return respondError(res, new DomainError('invalid_request', 'X-Parent-Id must be a UUID.'));
      }

      const classes = await listTrialClasses(deps, {
         ...(parentId ? { parentId } : {}),
         ...(query.studentId ? { studentId: query.studentId } : {}),
      });
      if (classes instanceof Error) return respondError(res, classes);

      return res.json(classes);
   };

export const getRosterController =
   (deps: ServiceDeps) =>
   async (req: Request, res: Response): Promise<Response> => {
      const params = parse(trialClassIdSchema, req.params);
      if (params instanceof Error) return respondError(res, params);

      const roster = await getRoster(deps, { trialClassId: params.id });
      if (roster instanceof Error) return respondError(res, roster);

      return res.json(roster);
   };
