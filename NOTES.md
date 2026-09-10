# Working notes

## Time log

| Phase | Start | End | Duration | Core | Beyond cap | Notes |
|---|---|---|---|---|---|---|
| 0 Bootstrap + Docker | | | | | | |
| 1 Migrations + schema + seed | | | | | | |
| 2 Domain + red race tests + repo/service | | | | | | |
| 3 Remaining concurrency tests | | | | | | |
| 4 HTTP layer | | | | | | |
| 5 Frontend | | | | | | |
| 6 Demo script | | | | | | |
| 7 Docs + clean verification | | | | | | |
| Video | | | | | | |
| **Total** | | | | | | |

## AI log

### Phase 0 - bootstrap and Docker
- Asked: scaffold the monorepo and make `docker compose up` the only prerequisite.
- AI proposed: host port 5433 for Postgres, taken from the plan.
- My call: modified.
- Why: port 5433 was already bound by another container on this machine. Moved to 5435 and
  propagated the change through compose, `.env.example`, the config default and the plan.
- Verified by: `docker compose up --build` from a clean volume, then `curl /api/health`.

### Phase 1 - migrations
- Asked: port the migration runner pattern from an existing project, schema in migration one,
  demo data in migration two.
- AI proposed: -
- My call: -
- Why: -
- Verified by: migrations applied automatically on container start; seat counts per class came
  out 1/4, 3/4, 4/4 and 0/4 as specified.

### Phase 2 - repositories and services
- Asked: build the domain, repositories and services following the plan.
- AI proposed: writing the race tests first so they would start red, as the plan required.
- My call: modified the order.
- Why: the services were written before the race tests, so the red-first sequence in the plan
  did not actually happen. Rather than claim otherwise, I got the same guarantee from the two
  mutation checks below, which prove the tests fail when the protection is removed.
- Verified by: 27 tests green, plus both mutation checks.

### Phase 3 - proving the concurrency tests mean something
- Mutation 1: removed `FOR UPDATE` from `lockClass`.
  Result: T15 failed with "expected [...] to have a length of 1 but got 20". All twenty parents
  received the last seat. Restored, green again.
- Mutation 2: moved the `payment_attempts` insert to after the provider call.
  Result: T23 failed (the second racing payment was no longer rejected before charging) and T24
  failed with "expected [] to have a length of 1" - the charge left no trace at all.
  Restored, green again.
- This is the evidence that the row lock and the record-before-charge ordering are load bearing,
  not decoration.

### Phase 4 - HTTP layer
- Asked: routers, controllers, validators and middleware following the reference project.
- AI proposed: -
- My call: -
- Why: -
- Verified by: T21 and T22 over supertest, plus the curl sequence against the running container.

### Phase 5 - frontend
- Asked: four components, no polish beyond what the demo needs.
- Verified by: held a seat, declined the card, watched the seat return to the list, rebooked, paid,
  and saw the student on the staff roster.

### Phase 6 - demo script
- Verified by: `npm run demo:last-seat` ends with 4/4 confirmed and Chloe Tan flagged for refund.

### Phase 7 - docs and clean verification
- Verified by: `docker compose down -v` then `docker compose up --build` from an empty volume, the
  suite run three times in a row (29 passed each time), migration status showing both applied, and
  typecheck clean on both workspaces.

## Decisions

- Host Postgres port is 5435, not 5433, because 5433 was already taken locally.
- No comments in code. The reasoning lives in `README.md` instead, so the code stays readable
  and the explanation stays in one place a reviewer can actually find.
- Repositories are plain functions taking a `Database` or `TransactionClient` as their first
  argument, rather than a singleton initialised at boot. The race tests need to swap the clock
  and the payment provider per test, so everything is injected through `ServiceDeps`.
- Errors are returned rather than thrown, so `database.transaction()` can roll back on a
  returned `Error` and the HTTP layer has exactly one place that maps a code to a status.

## Things I'd do next

- See "What I'd do next" in `README.md`.
