import { useEffect, useState } from 'react';

export const App = () => {
   const [health, setHealth] = useState('checking');

   useEffect(() => {
      fetch('/api/health')
         .then((response) => (response.ok ? 'ok' : 'unavailable'))
         .catch(() => 'unavailable')
         .then(setHealth);
   }, []);

   return (
      <main className="page">
         <header className="masthead">
            <h1>Ottodot trial booking</h1>
         </header>
         <p className="muted">API: {health}</p>
      </main>
   );
};
