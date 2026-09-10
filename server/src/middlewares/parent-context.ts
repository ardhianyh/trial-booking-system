import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { DomainError } from '../domain/errors';
import { respondError } from './error-handler';
import { isUuid } from '../validator/shared';

declare module 'express-serve-static-core' {
   interface Request {
      parentId?: string;
   }
}

export const requireParent: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
   const header = req.header('X-Parent-Id');

   if (!header) {
      respondError(res, new DomainError('missing_parent', 'Missing X-Parent-Id header.'));
      return;
   }

   if (!isUuid(header)) {
      respondError(
         res,
         new DomainError('invalid_request', 'X-Parent-Id must be a UUID.', { header: 'X-Parent-Id' })
      );
      return;
   }

   req.parentId = header;
   next();
};

export const parentIdOf = (req: Request): string => {
   if (!req.parentId) {
      throw new Error('requireParent middleware must run before parentIdOf');
   }
   return req.parentId;
};
