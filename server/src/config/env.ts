export interface DatabaseConfig {
   host: string;
   port: number;
   user: string;
   password: string;
   database: string;
   schema: string;
}

export interface AppConfig {
   port: number;
   database: DatabaseConfig;
   testDatabaseName: string;
   holdSeconds: number;
   priceCents: number;
   mockPaymentDelayMs: number;
}

const loadDotEnv = (): void => {
   try {
      process.loadEnvFile();
   } catch {
      return;
   }
};

const readString = (key: string, fallback: string): string => {
   const value = process.env[key];
   return value === undefined || value === '' ? fallback : value;
};

const readNumber = (key: string, fallback: number): number => {
   const value = process.env[key];
   if (value === undefined || value === '') return fallback;

   const parsed = Number(value);
   if (!Number.isFinite(parsed)) {
      throw new Error(`Environment variable ${key} must be numeric, received "${value}"`);
   }
   return parsed;
};

export const loadConfig = (): AppConfig => {
   loadDotEnv();

   return {
      port: readNumber('PORT', 3001),
      database: {
         host: readString('DATABASE_HOST', 'localhost'),
         port: readNumber('DATABASE_PORT', 5435),
         user: readString('DATABASE_USER', 'ottodot'),
         password: readString('DATABASE_PASSWORD', 'ottodot'),
         database: readString('DATABASE_DB', 'ottodot'),
         schema: readString('DATABASE_SCHEMA', 'application'),
      },
      testDatabaseName: readString('TEST_DATABASE_DB', 'ottodot_test'),
      holdSeconds: readNumber('HOLD_SECONDS', 600),
      priceCents: readNumber('TRIAL_PRICE_CENTS', 5000),
      mockPaymentDelayMs: readNumber('MOCK_PAYMENT_DELAY_MS', 0),
   };
};

export const testDatabaseConfig = (config: AppConfig): DatabaseConfig => ({
   ...config.database,
   database: config.testDatabaseName,
});
