#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import {
   MIGRATIONS_DIR,
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
} from './config.js';

const confirmDrop = async () => {
   const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
   const answer = await rl.question(`Type "${SCHEMA}" to confirm: `);
   rl.close();
   return answer.trim() === SCHEMA;
};

const main = async () => {
   const skipConfirm = process.argv.includes('--yes') || process.argv.includes('-y');

   assertSchemaName(SCHEMA);

   log('');
   log(colour.bold('Ottodot trial booking - fresh migrate'));
   log(colour.dim('-'.repeat(50)));
   log(colour.yellow(`  Schema "${SCHEMA}" will be dropped and rebuilt. All data is lost.`));
   log('');

   if (!skipConfirm && !(await confirmDrop())) return log('Cancelled.');

   const client = createClient();
   await connectWithRetry(client);

   try {
      await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await client.query(`CREATE SCHEMA "${SCHEMA}"`);
      await ensureExtensions(client);
      await createMigrationsTable(client, SCHEMA);
      logOk(`Schema "${SCHEMA}" recreated`);

      const files = (await fs.readdir(MIGRATIONS_DIR))
         .filter((file) => file.endsWith('.sql'))
         .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      logInfo(`Applying ${files.length} migration(s)`);

      for (const file of files) {
         const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
         if (!sql.trim()) continue;

         await client.query('BEGIN');
         try {
            await client.query(sql);
            await client.query(`INSERT INTO "${SCHEMA}".migrations (name) VALUES ($1)`, [file]);
            await client.query('COMMIT');
            logOk(file);
         } catch (error) {
            await client.query('ROLLBACK');
            logError(`${file}: ${error.message}`);
            if (error.detail) logError(`  detail: ${error.detail}`);
            throw new Error(`Fresh migrate aborted at ${file}`);
         }
      }

      log('');
      log(colour.green(colour.bold('Fresh migrate complete.')));
      log('');
   } finally {
      await client.end();
   }
};

main().catch((error) => {
   logError(error.message);
   process.exit(1);
});
