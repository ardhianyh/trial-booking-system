import { initializeApp } from './app';
import { createDatabase } from './config/database';
import { loadConfig } from './config/env';
import { systemClock } from './domain/clock';
import { createMockPaymentProvider } from './payments/mock-payment-provider';
import type { ServiceDeps } from './services/deps';
import { logger } from './utils/logger';

const start = async (): Promise<void> => {
   const config = loadConfig();
   const database = createDatabase(config.database);

   const deps: ServiceDeps = {
      database,
      clock: systemClock,
      paymentProvider: createMockPaymentProvider(config.mockPaymentDelayMs),
      holdSeconds: config.holdSeconds,
      priceCents: config.priceCents,
   };

   const server = initializeApp(deps).listen(config.port, () => {
      logger.info('API listening', { port: config.port, database: config.database.database });
   });

   const shutdown = (signal: string): void => {
      logger.info('Shutting down', { signal });
      server.close(() => {
         void database.shutdown().then(() => process.exit(0));
      });
   };

   process.on('SIGTERM', () => shutdown('SIGTERM'));
   process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((error: unknown) => {
   logger.error('Failed to start API', { message: error instanceof Error ? error.message : String(error) });
   process.exit(1);
});
