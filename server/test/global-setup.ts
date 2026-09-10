import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadConfig, testDatabaseConfig } from '../src/config/env';

export const MIGRATIONS_DIR = path.resolve(
   path.dirname(fileURLToPath(import.meta.url)),
   '../database/migrations'
);

export const migrationFiles = async (): Promise<string[]> => {
   const files = await fs.readdir(MIGRATIONS_DIR);
   return files
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
};

const createTestDatabaseIfMissing = async (): Promise<void> => {
   const config = loadConfig();
   const admin = new pg.Client({ ...config.database, database: 'postgres' });

   await admin.connect();
   try {
      const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
         config.testDatabaseName,
      ]);
      if (existing.rowCount === 0) {
         await admin.query(`CREATE DATABASE "${config.testDatabaseName}"`);
      }
   } finally {
      await admin.end();
   }
};

const applyMigrations = async (): Promise<void> => {
   const config = loadConfig();
   const client = new pg.Client(testDatabaseConfig(config));

   await client.connect();
   try {
      await client.query(`DROP SCHEMA IF EXISTS "${config.database.schema}" CASCADE`);
      await client.query(`CREATE SCHEMA "${config.database.schema}"`);
      await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public');

      for (const file of await migrationFiles()) {
         await client.query(await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8'));
      }
   } finally {
      await client.end();
   }
};

export default async function setup(): Promise<void> {
   await createTestDatabaseIfMissing();
   await applyMigrations();
}
