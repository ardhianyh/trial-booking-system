type Level = 'info' | 'warn' | 'error';

const write = (level: Level, message: string, meta?: Record<string, unknown>): void => {
   const entry = { level, time: new Date().toISOString(), message, ...meta };
   const line = JSON.stringify(entry);

   if (level === 'error') {
      console.error(line);
      return;
   }
   if (level === 'warn') {
      console.warn(line);
      return;
   }
   console.log(line);
};

export const logger = {
   info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
   warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
   error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};
