import { DomainError } from '../domain/errors';
import { levelBandFor } from '../domain/rules';
import { bookingRepository, parentRepository, trialClassRepository } from '../repositories';
import type { Eligibility, TrialClassView } from '../types';
import type { ServiceDeps } from './deps';
import { toTrialClassView } from './views';

export interface ListTrialClassesInput {
   parentId?: string;
   studentId?: string;
}

export const listTrialClasses = async (
   deps: ServiceDeps,
   input: ListTrialClassesInput = {}
): Promise<TrialClassView[] | Error> => {
   const now = deps.clock.now();

   const rows = await trialClassRepository.listUpcomingWithSeats(deps.database, now);
   if (rows instanceof Error) return rows;

   const views = rows.map(toTrialClassView);
   if (!input.studentId) return views;

   const student = await parentRepository.findStudentById(deps.database, input.studentId);
   if (student instanceof Error) return student;
   if (!student) return new DomainError('student_not_found', 'That student does not exist.');
   if (input.parentId && student.parent_id !== input.parentId) {
      return new DomainError('not_your_child', 'That student belongs to another parent.');
   }

   const activeBookings = await bookingRepository.listActiveBookingsForParent(
      deps.database,
      student.id,
      now
   );
   if (activeBookings instanceof Error) return activeBookings;

   const bookedStatusByClass = new Map(
      activeBookings
         .filter((booking) => booking.status !== 'expired')
         .map((booking) => [booking.trial_class_id, booking.status])
   );

   const eligibilityFor = (view: TrialClassView): Eligibility => {
      if (levelBandFor(student.level) !== view.levelBand) return 'level_mismatch';

      const booked = bookedStatusByClass.get(view.id);
      if (booked === 'confirmed') return 'already_booked';
      if (booked === 'pending_payment') return 'held_by_you';

      return view.seats.available === 0 ? 'full' : 'eligible';
   };

   return views.map((view) => ({ ...view, eligibility: eligibilityFor(view) }));
};
