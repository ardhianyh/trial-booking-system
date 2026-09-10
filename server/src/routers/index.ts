import type { Application } from 'express';
import type { ServiceDeps } from '../services/deps';
import { bookingRouter } from './booking-router';
import { healthRouter } from './health-router';
import { parentRouter } from './parent-router';
import { trialClassRouter } from './trial-class-router';

export const route = (app: Application, deps: ServiceDeps): void => {
   app.use('/api', healthRouter(deps));
   app.use('/api/parents', parentRouter(deps));
   app.use('/api/trial-classes', trialClassRouter(deps));
   app.use('/api/bookings', bookingRouter(deps));
};
