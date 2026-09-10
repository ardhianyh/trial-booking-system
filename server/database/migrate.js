#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import {
   MIGRATIONS_DIR,
   MIGRATION_LOCK_ID,
   SCHEMA,
   assertSchemaName,
   colour,
   connectWithRetry,
   createClient,
   createMigrationsTable,
   ensureExtensions,
   log,
   logError,
   logInfo,
   logOk,
   logWarn,
} from './config.js';

const prompt = async (question) => {
   const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
   const answer = await rl.question(question);
   rl.close();
   return answer.trim();
};

const confirm = async (question) => (await prompt(`${question} (y/N): `)).toLowerCase() === 'y';

const checksumOf = (sql) => crypto.createHash('sha256').update(sql).digest('hex');

const migrationFiles = async () => {
   const files = await fs.readdir(MIGRATIONS_DIR);
   return files
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
};

const acquireLock = async (client) => {
   const result = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [MIGRATION_LOCK_ID]);
   if (!result.rows[0].acquired) {
      throw new Error('Another migration run holds the advisory lock on this database.');
   }
};

const releaseLock = async (client) => {
   await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
};

const ensureInfrastructure = async (client) => {
   assertSchemaName(SCHEMA);

   const existing = await client.query(
      'SELECT 1 FROM information_schema.schemata WHERE schema_name = $1',
      [SCHEMA]
   );

   if (existing.rowCount === 0) {
      logInfo(`Creating schema "${SCHEMA}"`);
      await client.query(`CREATE SCHEMA "${SCHEMA}"`);
   }

   await ensureExtensions(client);
   await createMigrationsTable(client, SCHEMA);
};

const appliedMigrations = async (client) => {
   const result = await client.query(
      `SELECT name, checksum, applied_at FROM "${SCHEMA}".migrations ORDER BY name`
   );
   return result.rows;
};

const driftedMigrations = async (client) => {
   const rows = await appliedMigrations(client);
   const drifted = [];

   for (const row of rows) {
      let sql;
      try {
         sql = await fs.readFile(path.join(MIGRATIONS_DIR, row.name), 'utf8');
      } catch {
         continue;
      }

      const checksum = checksumOf(sql);
      if (row.checksum === null) {
         await client.query(`UPDATE "${SCHEMA}".migrations SET checksum = $2 WHERE name = $1`, [
            row.name,
            checksum,
         ]);
         continue;
      }
      if (row.checksum !== checksum) drifted.push(row.name);
   }

   return drifted;
};

const applyMigration = async (client, fileName) => {
   const sql = await fs.readFile(path.join(MIGRATIONS_DIR, fileName), 'utf8');
   if (!sql.trim()) {
      logWarn(`${fileName}: empty file, skipped`);
      return false;
   }

   await client.query('BEGIN');
   try {
      await client.query(sql);
      await client.query(
         `INSERT INTO "${SCHEMA}".migrations (name, checksum) VALUES ($1, $2)
          ON CONFLICT (name) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = NOW()`,
         [fileName, checksumOf(sql)]
      );
      await client.query('COMMIT');
      return true;
   } catch (error) {
      await client.query('ROLLBACK');
      throw error;
   }
};

const describeFailure = (fileName, error) => {
   logError(`${fileName}: ${error.message}`);
   if (error.detail) logError(`  detail: ${error.detail}`);
   if (error.hint) logError(`  hint: ${error.hint}`);
   if (error.position) logError(`  position: ${error.position}`);
};

const withClient = async (handler) => {
   const client = createClient();
   await connectWithRetry(client);
   try {
      return await handler(client);
   } finally {
      await client.end();
   }
};

const deploy = async ({ nonInteractive = false } = {}) =>
   withClient(async (client) => {
      await acquireLock(client);
      try {
         await ensureInfrastructure(client);

         const drifted = await driftedMigrations(client);
         if (drifted.length > 0) {
            drifted.forEach((name) => logError(`checksum drift: ${name}`));
            throw new Error(
               'Applied migrations were edited. Create a new migration instead, or run fresh.js in development.'
            );
         }

         const applied = new Set((await appliedMigrations(client)).map((row) => row.name));
         const pending = (await migrationFiles()).filter((file) => !applied.has(file));

         if (pending.length === 0) {
            logInfo('Database is up to date.');
            return;
         }

         logInfo(`Applying ${pending.length} migration(s)`);
         for (const file of pending) {
            try {
               if (await applyMigration(client, file)) logOk(file);
            } catch (error) {
               describeFailure(file, error);
               throw new Error(`Migration failed at ${file}`);
            }
         }
      } finally {
         await releaseLock(client);
      }
   }).catch((error) => {
      logError(error.message);
      if (nonInteractive) process.exit(1);
      throw error;
   });

const status = async () =>
   withClient(async (client) => {
      await ensureInfrastructure(client);

      const rows = await appliedMigrations(client);
      const appliedAt = new Map(rows.map((row) => [row.name, row.applied_at]));
      const files = await migrationFiles();
      const pending = files.filter((file) => !appliedAt.has(file));

      log('');
      log(colour.bold('Migration status'));
      log(colour.dim('-'.repeat(70)));
      for (const file of files) {
         const stamp = appliedAt.get(file);
         if (stamp) log(`  ${colour.green('applied')}  ${file}  ${colour.dim(new Date(stamp).toISOString())}`);
         else log(`  ${colour.yellow('pending')}  ${file}`);
      }
      log(colour.dim('-'.repeat(70)));
      log(`  total ${files.length}   applied ${files.length - pending.length}   pending ${pending.length}`);
      log('');
   });

const verify = async () =>
   withClient(async (client) => {
      await ensureInfrastructure(client);

      const drifted = await driftedMigrations(client);
      if (drifted.length > 0) {
         drifted.forEach((name) => logError(`checksum drift: ${name}`));
         process.exit(1);
      }

      const applied = new Set((await appliedMigrations(client)).map((row) => row.name));
      const pending = (await migrationFiles()).filter((file) => !applied.has(file));

      logOk(`Checksums match for ${applied.size} applied migration(s).`);
      if (pending.length > 0) {
         pending.forEach((file) => logWarn(`pending: ${file}`));
         process.exit(3);
      }
      logOk('No pending migrations.');
   });

const create = async () => {
   const label = await prompt('Migration label (e.g. add-waitlist): ');
   const safeLabel = label.replace(/[^a-z0-9_-]/gi, '_');
   const fileName = safeLabel ? `${Date.now()}_${safeLabel}.sql` : `${Date.now()}.sql`;

   await fs.writeFile(
      path.join(MIGRATIONS_DIR, fileName),
      `SET search_path TO ${SCHEMA}, public;\n\n`
   );
   logOk(`Created ${fileName}`);
};

const dropSchema = async () => {
   logWarn(`This drops schema "${SCHEMA}" and every table in it.`);
   if (!(await confirm('Are you sure?'))) return log('Cancelled.');
   if ((await prompt(`Type "${SCHEMA}" to confirm: `)) !== SCHEMA) return log('Cancelled.');

   await withClient(async (client) => {
      assertSchemaName(SCHEMA);
      await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      logOk(`Schema "${SCHEMA}" dropped.`);
   });
};

const menu = async () => {
   log('');
   log(colour.bold('Ottodot trial booking - migrations'));
   log(colour.dim('-'.repeat(40)));
   log('  1. Deploy pending migrations');
   log('  2. Show status');
   log('  3. Create new migration');
   log('  4. Drop schema');
   log('  0. Exit');
   log('');

   const choice = await prompt('Choose an option: ');
   const actions = { 1: deploy, 2: status, 3: create, 4: dropSchema, 0: async () => log('Bye.') };
   const action = actions[choice];

   if (!action) return logWarn('Unknown option.');
   await action();
};

const main = async () => {
   const [command, ...flags] = process.argv.slice(2);

   if (!command) return menu();

   if (command === 'deploy') {
      if (!flags.includes('--yes')) {
         logError('deploy requires an explicit --yes flag.');
         process.exit(2);
      }
      return deploy({ nonInteractive: true });
   }
   if (command === 'status') return status();
   if (command === 'verify') return verify();

   logError(`Unknown command: ${command}`);
   log('Available commands: deploy --yes | status | verify');
   process.exit(2);
};

main().catch((error) => {
   logError(error.message);
   process.exit(1);
});
