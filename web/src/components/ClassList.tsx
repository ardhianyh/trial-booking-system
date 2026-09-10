import type { Seats, Student, TrialClass } from '../api';
import { classTitle, eligibilityLabel, formatDateTime } from '../format';

interface SeatDotsProps {
   seats: Seats;
}

const SeatDots = ({ seats }: SeatDotsProps) => (
   <span className="seats" aria-label={`${seats.confirmed} booked, ${seats.held} on hold`}>
      {Array.from({ length: seats.capacity }, (_, index) => {
         const state =
            index < seats.confirmed
               ? 'confirmed'
               : index < seats.confirmed + seats.held
                 ? 'held'
                 : 'open';
         return <span key={index} className={`seat ${state}`} />;
      })}
   </span>
);

interface ClassListProps {
   classes: TrialClass[];
   student: Student | null;
   busyClassId: string | null;
   onHold: (trialClassId: string) => void;
}

export const ClassList = ({ classes, student, busyClassId, onHold }: ClassListProps) => {
   if (classes.length === 0) {
      return <p className="muted">No upcoming trial classes.</p>;
   }

   return (
      <div className="rows">
         {classes.map((trialClass) => {
            const eligibility = trialClass.eligibility ?? 'eligible';
            const blockedLabel = student ? eligibilityLabel(eligibility, student.level) : '';
            const seatsLeft = trialClass.seats.available;

            return (
               <div className="row" key={trialClass.id}>
                  <span className="row-main">
                     <span className="row-title">
                        {classTitle(trialClass.levelBand, trialClass.subject)}
                     </span>
                     <span className="row-meta">{formatDateTime(trialClass.startsAt)}</span>
                  </span>
                  <span className="row-actions">
                     <SeatDots seats={trialClass.seats} />
                     <span className="seat-label">
                        {seatsLeft === 0 ? 'Full' : `${seatsLeft} left`}
                     </span>
                     {student && eligibility === 'eligible' ? (
                        <button
                           type="button"
                           className="primary"
                           disabled={busyClassId !== null}
                           onClick={() => onHold(trialClass.id)}
                        >
                           {busyClassId === trialClass.id ? 'Holding...' : 'Hold this seat'}
                        </button>
                     ) : (
                        <span className="tag">{blockedLabel || 'Pick a child'}</span>
                     )}
                  </span>
               </div>
            );
         })}
      </div>
   );
};
