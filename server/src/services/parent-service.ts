import { parentRepository } from '../repositories';
import type { ParentView } from '../types';
import type { ServiceDeps } from './deps';

export const listParents = async (deps: ServiceDeps): Promise<ParentView[] | Error> => {
   const rows = await parentRepository.listParentsWithStudents(deps.database);
   if (rows instanceof Error) return rows;

   return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      students: row.students,
   }));
};
