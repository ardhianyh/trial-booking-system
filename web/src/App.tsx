import { useCallback, useEffect, useState } from 'react';
import {
   ApiError,
   fetchBooking,
   fetchParents,
   fetchTrialClasses,
   holdSeat,
   payBooking,
   type Booking,
   type Parent,
   type Payment,
   type Student,
   type TrialClass,
} from './api';
import { ClassList } from './components/ClassList';
import { ParentSwitcher } from './components/ParentSwitcher';
import { PaymentPanel } from './components/PaymentPanel';
import { RosterView } from './components/RosterView';
import { errorMessage } from './format';

type Tab = 'book' | 'rosters';

export const App = () => {
   const [parents, setParents] = useState<Parent[]>([]);
   const [parentId, setParentId] = useState('');
   const [studentId, setStudentId] = useState('');
   const [tab, setTab] = useState<Tab>('book');
   const [classes, setClasses] = useState<TrialClass[]>([]);
   const [booking, setBooking] = useState<Booking | null>(null);
   const [payment, setPayment] = useState<Payment | null>(null);
   const [notice, setNotice] = useState('');
   const [busyClassId, setBusyClassId] = useState<string | null>(null);
   const [payingBooking, setPayingBooking] = useState(false);

   const activeParent = parents.find((parent) => parent.id === parentId) ?? null;
   const activeStudent: Student | null =
      activeParent?.students.find((student) => student.id === studentId) ?? null;

   useEffect(() => {
      fetchParents()
         .then((result) => {
            setParents(result);
            const first = result[0];
            if (first) {
               setParentId(first.id);
               setStudentId(first.students[0]?.id ?? '');
            }
         })
         .catch(() => setNotice('Could not reach the API. Is the stack running?'));
   }, []);

   const reloadClasses = useCallback(async () => {
      if (!parentId) return;
      const result = await fetchTrialClasses(parentId, studentId || undefined);
      setClasses(result);
   }, [parentId, studentId]);

   useEffect(() => {
      void reloadClasses();
   }, [reloadClasses]);

   const handleParentChange = (nextParentId: string) => {
      const nextParent = parents.find((parent) => parent.id === nextParentId);
      setParentId(nextParentId);
      setStudentId(nextParent?.students[0]?.id ?? '');
      setBooking(null);
      setPayment(null);
      setNotice('');
   };

   const handleStudentChange = (nextStudentId: string) => {
      setStudentId(nextStudentId);
      setBooking(null);
      setPayment(null);
      setNotice('');
   };

   const withNotice = async (action: () => Promise<void>) => {
      setNotice('');
      try {
         await action();
      } catch (error) {
         const code = error instanceof ApiError ? error.code : 'internal_error';
         setNotice(errorMessage(code, activeStudent?.name ?? 'This child'));
         await reloadClasses();
      }
   };

   const handleHold = (trialClassId: string) =>
      withNotice(async () => {
         setBusyClassId(trialClassId);
         try {
            const result = await holdSeat(parentId, studentId, trialClassId);
            setBooking(result.booking);
            setPayment(null);
            await reloadClasses();
         } finally {
            setBusyClassId(null);
         }
      });

   const handlePay = (simulate: 'succeed' | 'fail') => {
      if (!booking) return;

      return withNotice(async () => {
         setPayingBooking(true);
         try {
            const result = await payBooking(parentId, booking.id, simulate, crypto.randomUUID());
            setBooking(result.booking);
            setPayment(result.payment ?? null);
            await reloadClasses();
         } finally {
            setPayingBooking(false);
         }
      });
   };

   const handleRefresh = () => {
      if (!booking) return;

      return withNotice(async () => {
         const result = await fetchBooking(parentId, booking.id);
         setBooking(result.booking);
         setPayment(result.payment ?? null);
         await reloadClasses();
      });
   };

   const handleBack = () => {
      setBooking(null);
      setPayment(null);
      setNotice('');
      void reloadClasses();
   };

   return (
      <main className="page">
         <header className="masthead">
            <h1>Ottodot trial booking</h1>
            {parents.length > 0 && (
               <ParentSwitcher
                  parents={parents}
                  activeParentId={parentId}
                  onChange={handleParentChange}
               />
            )}
         </header>

         <nav className="tabs">
            <button
               type="button"
               className="tab"
               aria-pressed={tab === 'book'}
               onClick={() => setTab('book')}
            >
               Book a trial
            </button>
            <button
               type="button"
               className="tab"
               aria-pressed={tab === 'rosters'}
               onClick={() => setTab('rosters')}
            >
               Class rosters
            </button>
         </nav>

         {notice && <p className="notice">{notice}</p>}

         {tab === 'rosters' ? (
            <RosterView classes={classes} />
         ) : booking ? (
            <PaymentPanel
               booking={booking}
               payment={payment}
               busy={payingBooking}
               onPay={handlePay}
               onRefresh={handleRefresh}
               onBack={handleBack}
            />
         ) : (
            <>
               {activeParent && (
                  <div className="children">
                     {activeParent.students.map((student) => (
                        <button
                           key={student.id}
                           type="button"
                           className="child"
                           aria-pressed={student.id === studentId}
                           onClick={() => handleStudentChange(student.id)}
                        >
                           {student.name}
                           <span className="tag">P{student.level}</span>
                        </button>
                     ))}
                  </div>
               )}
               <ClassList
                  classes={classes}
                  student={activeStudent}
                  busyClassId={busyClassId}
                  onHold={handleHold}
               />
            </>
         )}
      </main>
   );
};
