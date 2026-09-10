import { useEffect, useState } from 'react';
import { fetchRoster, type Roster, type TrialClass } from '../api';
import { classTitle, formatDateTime, formatTime } from '../format';

interface RosterViewProps {
   classes: TrialClass[];
}

export const RosterView = ({ classes }: RosterViewProps) => {
   const [selectedId, setSelectedId] = useState<string | null>(classes[0]?.id ?? null);
   const [roster, setRoster] = useState<Roster | null>(null);
   const [loading, setLoading] = useState(false);
   const [reloadToken, setReloadToken] = useState(0);

   useEffect(() => {
      if (!selectedId) return;

      let active = true;
      setLoading(true);
      fetchRoster(selectedId)
         .then((result) => {
            if (active) setRoster(result);
         })
         .finally(() => {
            if (active) setLoading(false);
         });

      return () => {
         active = false;
      };
   }, [selectedId, reloadToken]);

   if (classes.length === 0) {
      return <p className="muted">No upcoming trial classes.</p>;
   }

   return (
      <>
         <div className="field">
            <label htmlFor="roster-class">Class</label>
            <select
               id="roster-class"
               value={selectedId ?? ''}
               onChange={(event) => setSelectedId(event.target.value)}
            >
               {classes.map((trialClass) => (
                  <option key={trialClass.id} value={trialClass.id}>
                     {classTitle(trialClass.levelBand, trialClass.subject)} &middot;{' '}
                     {formatDateTime(trialClass.startsAt)}
                  </option>
               ))}
            </select>
            <button
               type="button"
               className="secondary"
               onClick={() => setReloadToken((token) => token + 1)}
               disabled={loading}
            >
               {loading ? 'Loading...' : 'Refresh'}
            </button>
         </div>

         {roster && (
            <section className="panel">
               <h2>{classTitle(roster.trialClass.levelBand, roster.trialClass.subject)}</h2>
               <p className="muted">
                  {formatDateTime(roster.trialClass.startsAt)} &middot;{' '}
                  {roster.confirmed.length} / {roster.trialClass.seats.capacity} confirmed &middot;{' '}
                  {roster.activeHolds} on hold
               </p>

               {roster.confirmed.length === 0 ? (
                  <p className="muted">No students confirmed yet.</p>
               ) : (
                  <table>
                     <thead>
                        <tr>
                           <th>Student</th>
                           <th>Level</th>
                           <th>Parent</th>
                           <th>Confirmed</th>
                        </tr>
                     </thead>
                     <tbody>
                        {roster.confirmed.map((entry) => (
                           <tr key={entry.bookingId}>
                              <td>{entry.studentName}</td>
                              <td>P{entry.level}</td>
                              <td>
                                 {entry.parentName}
                                 <br />
                                 <span className="muted">{entry.parentEmail}</span>
                              </td>
                              <td>{formatTime(entry.confirmedAt)}</td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               )}

               {roster.refundRequired.length > 0 && (
                  <>
                     <h3>Refund required</h3>
                     <table>
                        <thead>
                           <tr>
                              <th>Student</th>
                              <th>Parent email</th>
                           </tr>
                        </thead>
                        <tbody>
                           {roster.refundRequired.map((entry) => (
                              <tr key={entry.bookingId}>
                                 <td>{entry.studentName}</td>
                                 <td>{entry.parentEmail}</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </>
               )}
            </section>
         )}
      </>
   );
};
