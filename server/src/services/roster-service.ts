import { DomainError } from '../domain/errors';
import { bookingRepository, trialClassRepository } from '../repositories';
import type { RefundEntryView, RosterEntryView, RosterView } from '../types';
import type { ServiceDeps } from './deps';
import { toTrialClassView } from './views';

export interface GetRosterInput {
   trialClassId: string;
}

export const getRoster = async (
   deps: ServiceDeps,
   input: GetRosterInput
): Promise<RosterView | Error> => {
   const now = deps.clock.now();

   const trialClass = await trialClassRepository.findWithSeats(deps.database, input.trialClassId, now);
   if (trialClass instanceof Error) return trialClass;
   if (!trialClass) return new DomainError('class_not_found', 'That trial class does not exist.');

   const entries = await bookingRepository.listRosterEntries(deps.database, input.trialClassId);
   if (entries instanceof Error) return entries;

   const confirmed: RosterEntryView[] = [];
   const refundRequired: RefundEntryView[] = [];

   for (const entry of entries) {
      if (entry.status === 'confirmed' && entry.confirmed_at) {
         confirmed.push({
            bookingId: entry.booking_id,
            studentName: entry.student_name,
            level: entry.level,
            parentName: entry.parent_name,
            parentEmail: entry.parent_email,
            confirmedAt: entry.confirmed_at.toISOString(),
         });
         continue;
      }

      if (entry.status === 'refund_required') {
         refundRequired.push({
            bookingId: entry.booking_id,
            studentName: entry.student_name,
            parentEmail: entry.parent_email,
         });
      }
   }

   return {
      trialClass: toTrialClassView(trialClass),
      confirmed,
      activeHolds: trialClass.held,
      refundRequired,
   };
};
