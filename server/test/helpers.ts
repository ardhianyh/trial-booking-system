import fs from 'node:fs/promises';
import path from 'node:path';
import { expect } from 'vitest';
import { createDatabase } from '../src/config/database';
import { loadConfig, testDatabaseConfig } from '../src/config/env';
import { fixedClock, type AdjustableClock } from '../src/domain/clock';
import { DomainError, type ErrorCode } from '../src/domain/errors';
import type {
   ChargeRequest,
   ChargeResult,
   PaymentProvider,
} from '../src/payments/mock-payment-provider';
import type { ServiceDeps } from '../src/services/deps';
import type { BookingStatus, Database, PaymentAttemptRow, SeatCount } from '../src/types';
import { MIGRATIONS_DIR, migrationFiles } from './global-setup';

export const IDS = {
   parents: {
      meiLingTan: '10000000-0000-4000-8000-000000000001',
      danielLim: '10000000-0000-4000-8000-000000000002',
      nurulRahman: '10000000-0000-4000-8000-000000000003',
      priyaNair: '10000000-0000-4000-8000-000000000004',
      weiJieOng: '10000000-0000-4000-8000-000000000005',
      sarahGoh: '10000000-0000-4000-8000-000000000006',
   },
   students: {
      ethanTan: '20000000-0000-4000-8000-000000000001',
      chloeTan: '20000000-0000-4000-8000-000000000002',
      ryanLim: '20000000-0000-4000-8000-000000000003',
      aisyahRahman: '20000000-0000-4000-8000-000000000004',
      arjunNair: '20000000-0000-4000-8000-000000000005',
      meeraNair: '20000000-0000-4000-8000-000000000006',
      kaiOng: '20000000-0000-4000-8000-000000000007',
      zoeGoh: '20000000-0000-4000-8000-000000000008',
      lucasGoh: '20000000-0000-4000-8000-000000000009',
   },
   classes: {
      lowerMath: '30000000-0000-4000-8000-000000000001',
      upperScience: '30000000-0000-4000-8000-000000000002',
      lowerScience: '30000000-0000-4000-8000-000000000003',
      upperMath: '30000000-0000-4000-8000-000000000004',
   },
   bookings: {
      ethanLowerMath: '40000000-0000-4000-8000-000000000001',
      zoeUpperMath: '40000000-0000-4000-8000-000000000009',
   },
} as const;

export interface SpyPaymentProvider extends PaymentProvider {
   readonly calls: ChargeRequest[];
}

export const spyProvider = (delayMs = 0): SpyPaymentProvider => {
   const calls: ChargeRequest[] = [];

   return {
      calls,
      charge: async (request: ChargeRequest): Promise<ChargeResult> => {
         calls.push(request);
         if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));

         if (request.simulate === 'fail') {
            return { outcome: 'failed', providerRef: null, failureReason: 'card_declined' };
         }
         return {
            outcome: 'succeeded',
            providerRef: `mock_${request.idempotencyKey}`,
            failureReason: null,
         };
      },
   };
};

export const crashingProvider = (): SpyPaymentProvider => {
   const calls: ChargeRequest[] = [];

   return {
      calls,
      charge: async (request: ChargeRequest): Promise<ChargeResult> => {
         calls.push(request);
         throw new Error('provider connection dropped after the card was charged');
      },
   };
};

export const createTestDatabase = (maxConnections = 25): Database =>
   createDatabase(testDatabaseConfig(loadConfig()), { maxConnections });

export interface TestContext {
   database: Database;
   clock: AdjustableClock;
   provider: SpyPaymentProvider;
   deps: ServiceDeps;
}

export const createTestContext = (
   overrides: Partial<Omit<ServiceDeps, 'database'>> = {}
): TestContext => {
   const database = createTestDatabase();
   const clock = fixedClock();
   const provider = spyProvider();

   return {
      database,
      clock,
      provider,
      deps: {
         database,
         clock,
         paymentProvider: provider,
         holdSeconds: 600,
         priceCents: 5000,
         ...overrides,
      },
   };
};

export const withDeps = (context: TestContext, overrides: Partial<ServiceDeps>): ServiceDeps => ({
   ...context.deps,
   ...overrides,
});

let seedSql: string | null = null;

const readSeedSql = async (): Promise<string> => {
   if (seedSql !== null) return seedSql;

   const files = await migrationFiles();
   const seedFile = files.find((file) => file.endsWith('_seed_demo_data.sql'));
   if (!seedFile) throw new Error('Seed migration not found');

   seedSql = await fs.readFile(path.join(MIGRATIONS_DIR, seedFile), 'utf8');
   return seedSql;
};

export const resetData = async (context: TestContext): Promise<void> => {
   const truncated = await context.database.query(
      'TRUNCATE payment_attempts, bookings, students, parents, trial_classes RESTART IDENTITY CASCADE'
   );
   if (truncated instanceof Error) throw truncated;

   const seeded = await context.database.query(await readSeedSql());
   if (seeded instanceof Error) throw seeded;

   context.clock.set(new Date());
   context.provider.calls.length = 0;
};

export const assertInvariants = async (database: Database): Promise<void> => {
   const checks: Array<[string, string]> = [
      [
         'I1 confirmed bookings never exceed capacity',
         `SELECT c.id FROM trial_classes c
             JOIN bookings b ON b.trial_class_id = c.id AND b.status = 'confirmed'
            GROUP BY c.id, c.capacity HAVING count(*) > c.capacity`,
      ],
      [
         'I2 at most one active booking per student and class',
         `SELECT student_id FROM bookings WHERE status IN ('pending_payment', 'confirmed')
            GROUP BY student_id, trial_class_id HAVING count(*) > 1`,
      ],
      [
         'I8 at most one live payment attempt per booking',
         `SELECT booking_id FROM payment_attempts WHERE outcome IN ('pending', 'succeeded')
            GROUP BY booking_id HAVING count(*) > 1`,
      ],
      [
         'I8 at most one succeeded payment attempt per booking',
         `SELECT booking_id FROM payment_attempts WHERE outcome = 'succeeded'
            GROUP BY booking_id HAVING count(*) > 1`,
      ],
   ];

   for (const [description, sql] of checks) {
      const result = await database.query(sql);
      if (result instanceof Error) throw result;
      if ((result.rowCount ?? 0) > 0) throw new Error(`Invariant violated: ${description}`);
   }
};

export const seatsOf = async (database: Database, trialClassId: string): Promise<SeatCount> => {
   const result = await database.query<SeatCount>(
      `SELECT count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
              count(*) FILTER (WHERE status = 'pending_payment' AND hold_expires_at > now())::int AS held
         FROM bookings WHERE trial_class_id = $1`,
      [trialClassId]
   );
   if (result instanceof Error) throw result;
   return result.rows[0] ?? { confirmed: 0, held: 0 };
};

export const statusOf = async (database: Database, bookingId: string): Promise<BookingStatus> => {
   const result = await database.query<{ status: BookingStatus }>(
      'SELECT status FROM bookings WHERE id = $1',
      [bookingId]
   );
   if (result instanceof Error) throw result;

   const row = result.rows[0];
   if (!row) throw new Error(`Booking ${bookingId} not found`);
   return row.status;
};

export const attemptsFor = async (
   database: Database,
   bookingId: string
): Promise<PaymentAttemptRow[]> => {
   const result = await database.query<PaymentAttemptRow>(
      'SELECT * FROM payment_attempts WHERE booking_id = $1 ORDER BY created_at, id',
      [bookingId]
   );
   if (result instanceof Error) throw result;
   return result.rows;
};

export interface TestStudent {
   parentId: string;
   studentId: string;
}

export const createStudents = async (
   database: Database,
   count: number,
   level = 5
): Promise<TestStudent[]> => {
   const result = await database.query<{ parent_id: string; student_id: string }>(
      `WITH new_parents AS (
          INSERT INTO parents (name, email)
          SELECT 'Load Parent ' || i, 'load-parent-' || i || '-' || md5(random()::text) || '@example.com'
            FROM generate_series(1, $1) AS i
          RETURNING id
       )
       INSERT INTO students (parent_id, name, level)
       SELECT id, 'Load Student', $2 FROM new_parents
       RETURNING parent_id, id AS student_id`,
      [count, level]
   );
   if (result instanceof Error) throw result;

   return result.rows.map((row) => ({ parentId: row.parent_id, studentId: row.student_id }));
};

export const expectDomainError = (value: unknown, code: ErrorCode): DomainError => {
   expect(value).toBeInstanceOf(DomainError);
   const error = value as DomainError;
   expect(error.code).toBe(code);
   return error;
};

export const expectOk = <T>(value: T | Error): T => {
   if (value instanceof Error) {
      throw new Error(`Expected success but received error: ${value.message}`);
   }
   return value;
};
