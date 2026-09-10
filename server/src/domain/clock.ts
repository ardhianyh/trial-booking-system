export interface Clock {
   now(): Date;
}

export interface AdjustableClock extends Clock {
   advance(seconds: number): void;
   set(value: Date): void;
}

export const systemClock: Clock = {
   now: () => new Date(),
};

export const fixedClock = (start: Date = new Date()): AdjustableClock => {
   let current = new Date(start.getTime());

   return {
      now: () => new Date(current.getTime()),
      advance: (seconds: number) => {
         current = new Date(current.getTime() + seconds * 1000);
      },
      set: (value: Date) => {
         current = new Date(value.getTime());
      },
   };
};
