import type { Application } from 'express';
import { healthRouter } from './health-router';
import type { ServiceDeps } from '../services/deps';

export const route = (app: Application, deps: ServiceDeps): void => {
   app.use('/api', healthRouter(deps));
};
