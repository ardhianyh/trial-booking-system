import { useEffect, useState } from 'react';
import type { Booking, Payment } from '../api';
import { classTitle, formatCountdown, formatDateTime, formatPrice, formatTime, statusHeadline } from '../format';

interface PaymentPanelProps {
   booking: Booking;
   payment: Payment | null | undefined;
   busy: boolean;
   onPay: (simulate: 'succeed' | 'fail') => void;
   onRefresh: () => void;
   onBack: () => void;
}

const useCountdown = (deadline: string, active: boolean): number => {
   const [remaining, setRemaining] = useState(() => new Date(deadline).getTime() - Date.now());

   useEffect(() => {
      if (!active) return;

      const tick = () => setRemaining(new Date(deadline).getTime() - Date.now());
      tick();
      const timer = window.setInterval(tick, 1000);
      return () => window.clearInterval(timer);
   }, [deadline, active]);

   return remaining;
};

const statusMessage = (booking: Booking): string => {
   const title = classTitle(booking.trialClass.levelBand, booking.trialClass.subject);
   const when = formatDateTime(booking.trialClass.startsAt);

   switch (booking.status) {
      case 'pending_payment':
         return `Seat held until ${formatTime(booking.holdExpiresAt)}. Complete payment to confirm.`;
      case 'confirmed':
         return `${booking.student.name} is on the roster for ${title} on ${when}.`;
      case 'payment_failed':
         return 'Payment declined and the seat was released. Book again if the class is still open.';
      case 'expired':
         return 'Your hold expired and the seat was released. Hold it again if it is still available.';
      case 'refund_required':
         return `Payment received, but the last seat was taken after your hold expired. We will refund ${formatPrice(booking.amountCents)}.`;
   }
};

export const PaymentPanel = ({
   booking,
   payment,
   busy,
   onPay,
   onRefresh,
   onBack,
}: PaymentPanelProps) => {
   const awaitingPayment = booking.status === 'pending_payment';
   const remaining = useCountdown(booking.holdExpiresAt, awaitingPayment);

   return (
      <section className="panel">
         <h2>{classTitle(booking.trialClass.levelBand, booking.trialClass.subject)}</h2>
         <p className="muted">
            {formatDateTime(booking.trialClass.startsAt)} &middot; {booking.student.name} &middot;{' '}
            {formatPrice(booking.amountCents)}
         </p>

         <div className={`status ${booking.status}`}>
            <strong>{statusHeadline[booking.status]}</strong>
            <div>{statusMessage(booking)}</div>
            {awaitingPayment && (
               <div className="muted">
                  {remaining > 0 ? `Hold expires in ${formatCountdown(remaining)}` : 'Hold expired'}
               </div>
            )}
            {payment?.outcome === 'failed' && payment.failureReason && (
               <div className="muted">Reason: {payment.failureReason.replace(/_/g, ' ')}</div>
            )}
         </div>

         <div className="panel-actions">
            {awaitingPayment && (
               <>
                  <button
                     type="button"
                     className="primary"
                     disabled={busy}
                     onClick={() => onPay('succeed')}
                  >
                     {busy ? 'Processing...' : `Pay ${formatPrice(booking.amountCents)}`}
                  </button>
                  <button
                     type="button"
                     className="secondary"
                     disabled={busy}
                     onClick={() => onPay('fail')}
                  >
                     Simulate declined card
                  </button>
               </>
            )}
            <button type="button" className="secondary" disabled={busy} onClick={onRefresh}>
               Refresh status
            </button>
            <button type="button" className="secondary" onClick={onBack}>
               Back to classes
            </button>
         </div>
      </section>
   );
};
