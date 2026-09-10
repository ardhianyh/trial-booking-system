import type { ParentRow, StudentRow, TransactionClient } from '../types';

export interface ParentWithStudentsRow extends ParentRow {
   students: Array<{ id: string; name: string; level: number }>;
}

export const listParentsWithStudents = async (
   db: TransactionClient
): Promise<ParentWithStudentsRow[] | Error> => {
   const result = await db.query<ParentWithStudentsRow>(
      `SELECT p.id,
              p.name,
              p.email,
              COALESCE(
                 json_agg(
                    json_build_object('id', s.id, 'name', s.name, 'level', s.level)
                    ORDER BY s.name
                 ) FILTER (WHERE s.id IS NOT NULL),
                 '[]'
              ) AS students
         FROM parents p
         LEFT JOIN students s ON s.parent_id = p.id
        GROUP BY p.id, p.name, p.email
        ORDER BY p.name`
   );

   if (result instanceof Error) return result;
   return result.rows;
};

export const findStudentById = async (
   db: TransactionClient,
   studentId: string
): Promise<StudentRow | null | Error> => {
   const result = await db.query<StudentRow>(
      'SELECT id, parent_id, name, level FROM students WHERE id = $1',
      [studentId]
   );

   if (result instanceof Error) return result;
   return result.rows[0] ?? null;
};

export const parentExists = async (
   db: TransactionClient,
   parentId: string
): Promise<boolean | Error> => {
   const result = await db.query('SELECT 1 FROM parents WHERE id = $1', [parentId]);

   if (result instanceof Error) return result;
   return result.rowCount === 1;
};
