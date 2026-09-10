import pg from 'pg';
import type { QueryResult, QueryResultRow } from 'pg';
import type { Database, TransactionClient } from '../types';
import type { DatabaseConfig } from './env';

const { Pool } = pg;

interface Queryable {
   query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

const toError = (error: unknown): Error =>
   error instanceof Error ? error : new Error(String(error));

const runQuery = async <T extends QueryResultRow>(
   client: Queryable,
   text: string,
   params?: unknown[]
): Promise<QueryResult<T> | Error> => {
   try {
      return await client.query<T>(text, params);
   } catch (error) {
      return toError(error);
   }
};

export interface CreateDatabaseOptions {
   maxConnections?: number;
}

export const createDatabase = (
   config: DatabaseConfig,
   options: CreateDatabaseOptions = {}
): Database => {
   const pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      max: options.maxConnections ?? 10,
      options: `-c search_path=${config.schema},public`,
   });

   const transaction = async <T>(
      fn: (tx: TransactionClient) => Promise<T | Error>
   ): Promise<T | Error> => {
      const client = await pool.connect();
      const tx: TransactionClient = {
         query: (text, params) => runQuery(client, text, params),
      };

      try {
         await client.query('BEGIN');
         const result = await fn(tx);

         if (result instanceof Error) {
            await client.query('ROLLBACK');
            return result;
         }

         await client.query('COMMIT');
         return result;
      } catch (error) {
         await client.query('ROLLBACK').catch(() => undefined);
         return toError(error);
      } finally {
         client.release();
      }
   };

   return {
      query: (text, params) => runQuery(pool, text, params),
      transaction,
      shutdown: () => pool.end(),
   };
};
