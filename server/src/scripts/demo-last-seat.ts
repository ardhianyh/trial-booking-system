import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createDatabase } from '../config/database';
import { loadConfig } from '../config/env';
import { fixedClock } from '../domain/clock';
import { createMockPaymentProvider } from '../payments/mock-payment-provider';
import { createBooking, getRoster, payForBooking } from '../services';
import type { ServiceDeps } from '../services/deps';

const run = promisify(execFile);

const SEED = {
   meiLingTan: '10000000-0000-4000-8000-000000000001',
   sarahGoh: '10000000-0000-4000-8000-000000000006',
   chloeTan: '20000000-0000-4000-8000-000000000002',
   zoeGoh: '20000000-0000-4000-8000-000000000008',
   upperScience: '30000000-0000-4000-8000-000000000002',
};

const line = (tag: string, message: string) => console.log(`${`[${tag}]`.padEnd(9)} ${message}`);

const unwrap = <T>(value: T | Error, step: string): T => {
   if (value instanceof Error) {
      console.error(`\nFailed at "${step}": ${value.message}`);
      process.exit(1);
   }
   return value;
};

const resetDemoData = async (): Promise<void> => {
   const here = path.dirname(fileURLToPath(import.meta.url));
   await run('node', [path.resolve(here, '../../database/fresh.js'), '--yes']);
};

const main = async (): Promise<void> => {
   await resetDemoData();

   const config = loadConfig();
   const database = createDatabase(config.database);
   const clock = fixedClock();

   const deps: ServiceDeps = {
      database,
      clock,
      paymentProvider: createMockPaymentProvider(),
      holdSeconds: 600,
      priceCents: config.priceCents,
   };

   try {
      const before = unwrap(await getRoster(deps, { trialClassId: SEED.upperScience }), 'read roster');
      line(
         'setup',
         `Upper Primary Science: ${before.confirmed.length}/${before.trialClass.seats.capacity} confirmed, ${before.trialClass.seats.available} seat left`
      );

      const chloe = unwrap(
         await createBooking(deps, {
            parentId: SEED.meiLingTan,
            studentId: SEED.chloeTan,
            trialClassId: SEED.upperScience,
         }),
         'Chloe holds the seat'
      );
      line('A', `Chloe (Mei Ling Tan) holds the last seat      -> ${chloe.booking.status}`);

      clock.advance(11 * 60);
      line('clock', '+11 minutes, Chloe hold expires');

      const zoe = unwrap(
         await createBooking(deps, {
            parentId: SEED.sarahGoh,
            studentId: SEED.zoeGoh,
            trialClassId: SEED.upperScience,
         }),
         'Zoe holds the seat'
      );
      line('B', `Zoe (Sarah Goh) holds the released seat       -> ${zoe.booking.status}`);

      const zoePaid = unwrap(
         await payForBooking(deps, {
            parentId: SEED.sarahGoh,
            bookingId: zoe.booking.id,
            idempotencyKey: 'demo-zoe',
            simulate: 'succeed',
         }),
         'Zoe pays'
      );
      line('B', `Zoe pays                                      -> ${zoePaid.booking.status}`);

      const chloePaid = unwrap(
         await payForBooking(deps, {
            parentId: SEED.meiLingTan,
            bookingId: chloe.booking.id,
            idempotencyKey: 'demo-chloe',
            simulate: 'succeed',
         }),
         'Chloe pays late'
      );
      line(
         'A',
         `Chloe late payment succeeds at the provider    -> ${chloePaid.booking.status}`
      );

      const after = unwrap(await getRoster(deps, { trialClassId: SEED.upperScience }), 'read roster');
      const names = after.confirmed.map((entry) => entry.studentName).join(', ');
      const refunds = after.refundRequired.map((entry) => entry.studentName).join(', ');

      line(
         'result',
         `Roster ${after.confirmed.length}/${after.trialClass.seats.capacity}: ${names}. Flagged for refund: ${refunds || 'none'}.`
      );
      console.log(
         '\nExactly one parent holds the last seat. The late payment is recorded and flagged, never silently lost.'
      );
   } finally {
      await database.shutdown();
   }
};

main().catch((error: unknown) => {
   console.error(error instanceof Error ? error.message : String(error));
   process.exit(1);
});
