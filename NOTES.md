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

## Decisions

- Host Postgres port is 5435, not 5433, because 5433 was already taken locally.
- No comments in code. The reasoning lives in `README.md` instead, so the code stays readable
  and the explanation stays in one place a reviewer can actually find.

## Things I'd do next

- See "What I'd do next" in `README.md`.
