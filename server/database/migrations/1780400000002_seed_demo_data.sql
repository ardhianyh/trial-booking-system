SET search_path TO application, public;

INSERT INTO application.parents (id, name, email) VALUES
   ('10000000-0000-4000-8000-000000000001', 'Mei Ling Tan',  'meiling.tan@example.com'),
   ('10000000-0000-4000-8000-000000000002', 'Daniel Lim',    'daniel.lim@example.com'),
   ('10000000-0000-4000-8000-000000000003', 'Nurul Rahman',  'nurul.rahman@example.com'),
   ('10000000-0000-4000-8000-000000000004', 'Priya Nair',    'priya.nair@example.com'),
   ('10000000-0000-4000-8000-000000000005', 'Wei Jie Ong',   'weijie.ong@example.com'),
   ('10000000-0000-4000-8000-000000000006', 'Sarah Goh',     'sarah.goh@example.com');

INSERT INTO application.students (id, parent_id, name, level) VALUES
   ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Ethan Tan',     2),
   ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Chloe Tan',     5),
   ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'Ryan Lim',      5),
   ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'Aisyah Rahman', 5),
   ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', 'Arjun Nair',    6),
   ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000004', 'Meera Nair',    2),
   ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000005', 'Kai Ong',       3),
   ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000006', 'Zoe Goh',       4),
   ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000006', 'Lucas Goh',     1);

INSERT INTO application.trial_classes (id, subject, level_band, starts_at, capacity)
SELECT
   entry.id,
   entry.subject,
   entry.level_band,
   (date_trunc('day', now() AT TIME ZONE 'Asia/Singapore') + entry.offset_from_today + interval '15 hours')
      AT TIME ZONE 'Asia/Singapore',
   4
FROM (VALUES
   ('30000000-0000-4000-8000-000000000001'::uuid, 'math',    'lower', interval '2 days'),
   ('30000000-0000-4000-8000-000000000002'::uuid, 'science', 'upper', interval '3 days'),
   ('30000000-0000-4000-8000-000000000003'::uuid, 'science', 'lower', interval '4 days'),
   ('30000000-0000-4000-8000-000000000004'::uuid, 'math',    'upper', interval '5 days')
) AS entry(id, subject, level_band, offset_from_today);

INSERT INTO application.bookings
   (id, student_id, trial_class_id, status, price_cents, hold_expires_at, confirmed_at, created_at, updated_at)
SELECT
   entry.id,
   entry.student_id,
   entry.trial_class_id,
   entry.status,
   5000,
   now() - interval '3 hours' + interval '10 minutes',
   CASE WHEN entry.status = 'confirmed' THEN now() - interval '3 hours' + interval '2 minutes' END,
   now() - interval '3 hours',
   now() - interval '3 hours' + interval '2 minutes'
FROM (VALUES
   ('40000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, '30000000-0000-4000-8000-000000000001'::uuid, 'confirmed'),
   ('40000000-0000-4000-8000-000000000002'::uuid, '20000000-0000-4000-8000-000000000003'::uuid, '30000000-0000-4000-8000-000000000002'::uuid, 'confirmed'),
   ('40000000-0000-4000-8000-000000000003'::uuid, '20000000-0000-4000-8000-000000000004'::uuid, '30000000-0000-4000-8000-000000000002'::uuid, 'confirmed'),
   ('40000000-0000-4000-8000-000000000004'::uuid, '20000000-0000-4000-8000-000000000005'::uuid, '30000000-0000-4000-8000-000000000002'::uuid, 'confirmed'),
   ('40000000-0000-4000-8000-000000000005'::uuid, '20000000-0000-4000-8000-000000000006'::uuid, '30000000-0000-4000-8000-000000000003'::uuid, 'confirmed'),
   ('40000000-0000-4000-8000-000000000006'::uuid, '20000000-0000-4000-8000-000000000007'::uuid, '30000000-0000-4000-8000-000000000003'::uuid, 'confirmed'),
   ('40000000-0000-4000-8000-000000000007'::uuid, '20000000-0000-4000-8000-000000000009'::uuid, '30000000-0000-4000-8000-000000000003'::uuid, 'confirmed'),
   ('40000000-0000-4000-8000-000000000008'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, '30000000-0000-4000-8000-000000000003'::uuid, 'confirmed'),
   ('40000000-0000-4000-8000-000000000009'::uuid, '20000000-0000-4000-8000-000000000008'::uuid, '30000000-0000-4000-8000-000000000004'::uuid, 'payment_failed')
) AS entry(id, student_id, trial_class_id, status);

INSERT INTO application.payment_attempts
   (id, booking_id, idempotency_key, amount_cents, outcome, failure_reason, provider_ref, created_at)
SELECT
   entry.id,
   entry.booking_id,
   entry.idempotency_key,
   5000,
   entry.outcome,
   CASE WHEN entry.outcome = 'failed' THEN 'card_declined' END,
   'seed_' || entry.idempotency_key,
   now() - interval '3 hours' + interval '1 minute'
FROM (VALUES
   ('50000000-0000-4000-8000-000000000001'::uuid, '40000000-0000-4000-8000-000000000001'::uuid, 'seed-01', 'succeeded'),
   ('50000000-0000-4000-8000-000000000002'::uuid, '40000000-0000-4000-8000-000000000002'::uuid, 'seed-02', 'succeeded'),
   ('50000000-0000-4000-8000-000000000003'::uuid, '40000000-0000-4000-8000-000000000003'::uuid, 'seed-03', 'succeeded'),
   ('50000000-0000-4000-8000-000000000004'::uuid, '40000000-0000-4000-8000-000000000004'::uuid, 'seed-04', 'succeeded'),
   ('50000000-0000-4000-8000-000000000005'::uuid, '40000000-0000-4000-8000-000000000005'::uuid, 'seed-05', 'succeeded'),
   ('50000000-0000-4000-8000-000000000006'::uuid, '40000000-0000-4000-8000-000000000006'::uuid, 'seed-06', 'succeeded'),
   ('50000000-0000-4000-8000-000000000007'::uuid, '40000000-0000-4000-8000-000000000007'::uuid, 'seed-07', 'succeeded'),
   ('50000000-0000-4000-8000-000000000008'::uuid, '40000000-0000-4000-8000-000000000008'::uuid, 'seed-08', 'succeeded'),
   ('50000000-0000-4000-8000-000000000009'::uuid, '40000000-0000-4000-8000-000000000009'::uuid, 'seed-09', 'failed')
) AS entry(id, booking_id, idempotency_key, outcome);
