import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRequestHandler = (req: Request, res: Response) => Promise<unknown>;

export const asyncHandler =
   (handler: AsyncRequestHandler): RequestHandler =>
   (req: Request, res: Response, next: NextFunction) => {
      handler(req, res).catch(next);
   };
