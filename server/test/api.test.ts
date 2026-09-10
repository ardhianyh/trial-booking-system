import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp } from '../src/app';
import {
   IDS,
   assertInvariants,
   createStudents,
   createTestContext,
   resetData,
} from './helpers';

const context = createTestContext();
const { database, deps } = context;
const app = initializeApp(deps);

beforeEach(() => resetData(context));
afterEach(() => assertInvariants(database));
afterAll(() => database.shutdown());

describe('HTTP contract', () => {
   it('T21 returns a uniform error shape for auth, validation and capacity failures', async () => {
      const missingParent = await request(app)
         .post('/api/bookings')
         .send({ studentId: IDS.students.chloeTan, trialClassId: IDS.classes.upperScience });

      expect(missingParent.status).toBe(401);
      expect(missingParent.body.error.code).toBe('missing_parent');

      const badUuid = await request(app)
         .post('/api/bookings')
         .set('X-Parent-Id', IDS.parents.meiLingTan)
         .send({ studentId: 'not-a-uuid', trialClassId: IDS.classes.upperScience });

      expect(badUuid.status).toBe(400);
      expect(badUuid.body.error.code).toBe('invalid_request');
      expect(badUuid.body.error.details.issues[0].field).toBe('studentId');

      const [student] = await createStudents(database, 1, 2);
      const full = await request(app)
         .post('/api/bookings')
         .set('X-Parent-Id', student!.parentId)
         .send({ studentId: student!.studentId, trialClassId: IDS.classes.lowerScience });

      expect(full.status).toBe(409);
      expect(full.body.error).toMatchObject({ code: 'class_full', details: { available: 0 } });

      const unknown = await request(app).get('/api/nowhere');
      expect(unknown.status).toBe(404);
      expect(unknown.body.error.code).toBe('not_found');
   });

   it('T22 walks the whole flow: parents, classes, booking, payment, roster', async () => {
      const parents = await request(app).get('/api/parents');
      expect(parents.status).toBe(200);
      expect(parents.body).toHaveLength(6);

      const classes = await request(app)
         .get('/api/trial-classes')
         .query({ studentId: IDS.students.chloeTan })
         .set('X-Parent-Id', IDS.parents.meiLingTan);

      expect(classes.status).toBe(200);
      const upperScience = classes.body.find((item: { id: string }) => item.id === IDS.classes.upperScience);
      expect(upperScience.seats).toEqual({ capacity: 4, confirmed: 3, held: 0, available: 1 });
      expect(upperScience.eligibility).toBe('eligible');

      const created = await request(app)
         .post('/api/bookings')
         .set('X-Parent-Id', IDS.parents.meiLingTan)
         .send({ studentId: IDS.students.chloeTan, trialClassId: IDS.classes.upperScience });

      expect(created.status).toBe(201);
      expect(created.body.resumed).toBe(false);
      expect(created.body.booking.status).toBe('pending_payment');

      const bookingId = created.body.booking.id;

      const resumed = await request(app)
         .post('/api/bookings')
         .set('X-Parent-Id', IDS.parents.meiLingTan)
         .send({ studentId: IDS.students.chloeTan, trialClassId: IDS.classes.upperScience });

      expect(resumed.status).toBe(200);
      expect(resumed.body.resumed).toBe(true);
      expect(resumed.body.booking.id).toBe(bookingId);

      const paid = await request(app)
         .post(`/api/bookings/${bookingId}/payments`)
         .set('X-Parent-Id', IDS.parents.meiLingTan)
         .send({ idempotencyKey: 'http-flow-key', simulate: 'succeed' });

      expect(paid.status).toBe(200);
      expect(paid.body.booking.status).toBe('confirmed');
      expect(paid.body.payment).toEqual({ outcome: 'succeeded', failureReason: null });
      expect(paid.body.replayed).toBe(false);

      const replayed = await request(app)
         .post(`/api/bookings/${bookingId}/payments`)
         .set('X-Parent-Id', IDS.parents.meiLingTan)
         .send({ idempotencyKey: 'http-flow-key', simulate: 'succeed' });

      expect(replayed.status).toBe(200);
      expect(replayed.body.replayed).toBe(true);

      const fetched = await request(app)
         .get(`/api/bookings/${bookingId}`)
         .set('X-Parent-Id', IDS.parents.meiLingTan);

      expect(fetched.status).toBe(200);
      expect(fetched.body.booking.status).toBe('confirmed');
      expect(fetched.body.payment.outcome).toBe('succeeded');

      const foreign = await request(app)
         .get(`/api/bookings/${bookingId}`)
         .set('X-Parent-Id', IDS.parents.sarahGoh);

      expect(foreign.status).toBe(403);
      expect(foreign.body.error.code).toBe('not_your_booking');

      const roster = await request(app).get(`/api/trial-classes/${IDS.classes.upperScience}/roster`);

      expect(roster.status).toBe(200);
      expect(roster.body.confirmed).toHaveLength(4);
      expect(roster.body.trialClass.seats.available).toBe(0);
      expect(roster.body.activeHolds).toBe(0);
      expect(roster.body.refundRequired).toEqual([]);
   });
});
