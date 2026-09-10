import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));

try {
   process.loadEnvFile();
} catch {
   /* no local .env file */
}

export const SCHEMA = process.env.DATABASE_SCHEMA || 'application';
export const MIGRATIONS_DIR = path.join(here, 'migrations');
export const EXTENSIONS = ['uuid-ossp'];
export const MIGRATION_LOCK_ID = 8412770315;

export const SCHEMA_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/i;

export const colour = {
   green: (s) => `\x1b[32m${s}\x1b[0m`,
   red: (s) => `\x1b[31m${s}\x1b[0m`,
   yellow: (s) => `\x1b[33m${s}\x1b[0m`,
   cyan: (s) => `\x1b[36m${s}\x1b[0m`,
   dim: (s) => `\x1b[2m${s}\x1b[0m`,
   bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

export const log = (message = '') => console.log(message);
export const logOk = (message) => console.log(`${colour.green('  OK  ')} ${message}`);
export const logSkip = (message) => console.log(`${colour.dim('  --  ')} ${message}`);
export const logInfo = (message) => console.log(`${colour.cyan(' INFO ')} ${message}`);
export const logWarn = (message) => console.warn(`${colour.yellow(' WARN ')} ${message}`);
export const logError = (message) => console.error(`${colour.red(' ERR  ')} ${message}`);

export const databaseSettings = (overrides = {}) => ({
   host: process.env.DATABASE_HOST || 'localhost',
   port: Number(process.env.DATABASE_PORT || 5435),
   user: process.env.DATABASE_USER || 'ottodot',
   password: process.env.DATABASE_PASSWORD || 'ottodot',
   database: process.env.DATABASE_DB || 'ottodot',
   ...overrides,
});

export const createClient = (overrides) => new pg.Client(databaseSettings(overrides));

export const connectWithRetry = async (client, attempts = 30, delayMs = 1000) => {
   for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
         await client.connect();
         return;
      } catch (error) {
         if (attempt === attempts) throw error;
         if (attempt === 1) logInfo('Waiting for the database to accept connections...');
         await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
   }
};

export const assertSchemaName = (schema) => {
   if (!SCHEMA_NAME_PATTERN.test(schema)) {
      throw new Error(`Invalid schema name: "${schema}"`);
   }
};

export const ensureExtensions = async (client) => {
   for (const extension of EXTENSIONS) {
      await client.query(`CREATE EXTENSION IF NOT EXISTS "${extension}" WITH SCHEMA public`);
   }
};

export const createMigrationsTable = async (client, schema) => {
   await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".migrations (
         id         SERIAL PRIMARY KEY,
         name       VARCHAR(255) NOT NULL UNIQUE,
         checksum   CHAR(64),
         applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
   `);
};
