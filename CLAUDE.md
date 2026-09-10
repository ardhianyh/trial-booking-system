# CLAUDE.md

This repo is a take-home for Ottodot: a trial-class booking system that must stay correct under
duplicate bookings, payment failure, and a last-seat race. Correctness of backend behaviour,
invariants and tests matters far more than UI polish.

The detailed plan lives in `docs/MASTER_PLAN.md` (Indonesian, local only, deliberately not
committed). Read it before any work.

## Working rules

- Work on ONE phase at a time, only when asked. Stop at the checkpoint and report.
- All code, comments, commit messages, `README.md` and `AI_USAGE.md` are in English.
- **Do not write comments in code.** Names, types and structure carry the meaning; the "why"
  belongs in `README.md`. This also means no commented-out code.
- Do not add scope: no regular enrollment, real auth, ORM, emails or real payment provider.
- Never write personal or experiential content for the candidate (time spent, AI experience):
  leave `<!-- TODO(candidate): ... -->` placeholders.

## Invariants (never break)

- At most `capacity` (4) confirmed bookings per trial class.
- At most one active (`pending_payment` | `confirmed`) booking per student per class,
  enforced by a partial unique index.
- Only `payment-service.ts` may set `status = 'confirmed'`, and only after a succeeded payment
  attempt, inside the same transaction.
- A failed payment never produces a confirmed booking.
- At most one LIVE payment attempt (`pending` | `succeeded`) per booking, enforced by a partial
  unique index. This is what stops double charging.
- Every provider charge is preceded by a `payment_attempts` row. No charge without a trace.

## Concurrency rules

- Any transaction that creates a hold or confirms a booking must first run
  `SELECT ... FROM trial_classes WHERE id = $1 FOR UPDATE`, then count seats.
- Lock order: `trial_classes` row, then `bookings` row.
- Use `database.transaction()`; never issue transaction statements through the pool directly.
- Never call the payment provider while holding a transaction or lock.
- Order in `payForBooking` is fixed: validate, INSERT attempt as `pending`, charge, then the
  transaction (lock class, lock booking, settle attempt, decide status). Never charge first.
- On an insert conflict, re-read the conflicting row and tell the causes apart (same key for
  another booking vs. this booking already has a live attempt). Never infer from zero rows.
- "Now" always comes from the injected `Clock`. Never use `vi.useFakeTimers()` with `pg`.

## Structure

- Layers: `routers -> controllers -> services -> repositories`. Controllers hold no business
  rules; repositories hold no business rules and one function is one statement.
- Errors are RETURNED, not thrown: services return `DomainError`, controllers check
  `instanceof Error` and map the code to HTTP. `database.transaction()` rolls back when the
  callback returns an `Error`.
- EVERY query result must be checked with `instanceof Error` and returned upwards. A missed
  check on the seat-counting path is a silent correctness bug.
- All tables live in the `application` schema. Every migration starts with
  `SET search_path TO application, public;`.
- Two migrations only: `..._init_trial_booking.sql` (tables, indexes, constraints, function,
  trigger) and `..._seed_demo_data.sql` (demo data).
- NEVER edit a migration that has already been applied. The runner detects checksum drift and
  refuses to run. During development use `npm run db:fresh`.
- Timestamps are `TIMESTAMPTZ`: hold expiry and the injected `Clock` need an absolute instant.

## Commands

- `docker compose up --build` - db + migrations + demo data + API (:3001) + web (:5173)
- `npm test` - all tests, inside the api container
- `npm run db:fresh` - drop schema and rebuild from migrations
- `npm run migrate:status` - which migrations are applied
- `npm run typecheck`
- `npm run demo:last-seat`

## Definition of done for every phase

`npm run typecheck` and `npm test` pass, new behaviour has tests, report written, commit suggested.
