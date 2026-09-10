import express, { type Application } from 'express';
import { globalErrorHandler, notFoundHandler } from './middlewares';
import { route } from './routers';
import type { ServiceDeps } from './services/deps';

export const initializeApp = (deps: ServiceDeps): Application => {
   const app = express();

   app.disable('x-powered-by');
   app.use(express.json({ limit: '64kb' }));

   route(app, deps);

   app.use(notFoundHandler);
   app.use(globalErrorHandler);

   return app;
};
