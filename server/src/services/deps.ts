import type { Clock } from '../domain/clock';
import type { PaymentProvider } from '../payments/mock-payment-provider';
import type { Database } from '../types';

export interface ServiceHooks {
   afterSeatCount?: () => Promise<void>;
}

export interface ServiceDeps {
   database: Database;
   clock: Clock;
   paymentProvider: PaymentProvider;
   holdSeconds: number;
   priceCents: number;
   hooks?: ServiceHooks;
}
