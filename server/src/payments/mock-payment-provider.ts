import type { PaymentSimulation } from '../types';

export interface ChargeRequest {
   amountCents: number;
   idempotencyKey: string;
   simulate: PaymentSimulation;
}

export type ChargeResult =
   | { outcome: 'succeeded'; providerRef: string; failureReason: null }
   | { outcome: 'failed'; providerRef: string | null; failureReason: string };

export interface PaymentProvider {
   charge(request: ChargeRequest): Promise<ChargeResult>;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const createMockPaymentProvider = (delayMs = 0): PaymentProvider => ({
   charge: async ({ idempotencyKey, simulate }) => {
      if (delayMs > 0) await wait(delayMs);

      if (simulate === 'fail') {
         return { outcome: 'failed', providerRef: null, failureReason: 'card_declined' };
      }

      return { outcome: 'succeeded', providerRef: `mock_${idempotencyKey}`, failureReason: null };
   },
});
