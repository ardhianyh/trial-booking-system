# AI usage

## Tools

| Tool | Used for |
|---|---|
| **Claude (chat)** | Reading the brief, researching Ottodot's product, and turning both into a written plan: data model, state machine, concurrency strategy, test matrix and a phase-by-phase schedule. |
| **Claude Code** | Reviewing that plan, then implementing it phase by phase — schema and migrations, repositories, services, HTTP layer, tests, the React UI, and drafts of this file and `README.md`. |

The plan itself is not in this repo. It was a working document in Indonesian containing personal application context, so it stayed local. `CLAUDE.md` is committed, because it is the part that actually steered the implementation and it shows how the AI was constrained.

## What the AI was used for

- **Planning**: the first pass at the data model, the booking state machine, and the list of edge cases to defend against.
- **Scaffolding**: the monorepo, the Docker setup, and porting a migration runner from an existing project of mine so this repo matches the conventions I work in daily.
- **Implementation**: repositories, services, controllers and the UI, against explicit invariants written down before any code existed.
- **Tests**: the concurrency and payment-lifecycle tests, including the ones that reproduce the brief's scenario.
- **Documentation**: first drafts of `README.md` and this file.

Rules the AI worked under, all in `CLAUDE.md`: one phase at a time; never write a comment in code; every seat change happens under `SELECT … FOR UPDATE`; only one function may write `status = 'confirmed'`; "now" always comes from an injected clock; never invent my own time log or experience.

## Where AI clearly sped things up

The seed data and the test fixtures. The brief asks for a class with available seats, a class with exactly three confirmed students, a duplicate booking attempt, and a payment failure. Turning that into a seed migration — nine bookings and nine payment attempts across four classes, with stable UUIDs, times computed relative to `now()` in Singapore time, and every `CHECK` constraint satisfied on the first run — is exactly the fiddly, high-volume work that AI does well and that I would otherwise have spent forty minutes on. The same applies to the twenty-parent concurrency test: generating twenty parents and children inside a single `INSERT … RETURNING` and firing twenty transactions at one class row is mechanical once the shape is decided.

The verification was mine: the seat counts per class are asserted in `T04`, and I ran `docker compose down -v && docker compose up` to confirm the numbers come out at 1/4, 3/4, 4/4 and 0/4 from a completely empty volume.

## Where I disagreed with the AI

### 1. The plan's payment flow could lose money, and I made it change

The plan Claude produced had `payForBooking` call the mock provider first and write the `payment_attempts` row afterwards. That reads fine and it passes a happy-path test. When I had Claude Code review the plan before writing any code, it argued the ordering was wrong, and I agreed with the argument rather than the original plan:

- if the process dies between the charge and the insert, money moved and **nothing** exists in the database — no monitoring query can find it, because there is no row to find;
- two pay clicks generate two different idempotency keys, so idempotency does not stop a double charge — both requests pass the pre-check and both charge;
- the plan's own `ON CONFLICT DO NOTHING` step inferred "zero rows returned means this is a replay", which is wrong when the conflict came from a different constraint.

I had it inverted: write the attempt as `pending` first, then charge, then settle inside the confirmation transaction — plus a partial unique index so a booking can only ever have one live payment:

```sql
CREATE UNIQUE INDEX uniq_payment_attempts_live_per_booking
   ON application.payment_attempts (booking_id)
   WHERE outcome IN ('pending', 'succeeded');
```

I did not take this on trust. I had the change proven by mutation: moving the insert back to after the charge makes `T23` fail (the second racing payment is no longer refused before charging) and `T24` fail with `expected [] to have a length of 1` — the charge leaves no trace at all. Then it was restored and the suite went green again.

### 2. I rejected the AI's recommendation on how to structure the API

When I asked for the API and database to follow the conventions of an existing project of mine, Claude Code recommended taking only the database conventions — the schema, the migration runner, the environment variables — and keeping a flat service layer, arguing that four layers for six endpoints is ceremony and would cost about fifteen minutes for no correctness benefit.

I overruled it and asked for the full `routers → controllers → services → repositories` split with the returned-`Error` style, because consistency with the codebase I actually work in matters more to me than saving fifteen minutes on a take-home. The AI's cost estimate was right; its conclusion was a judgement call that was not its to make.

### 3. Smaller corrections

- The plan hardcoded Postgres on host port 5433. That port was already taken on my machine, so the stack failed to start on the very first `docker compose up`. Moved to 5435 and propagated through compose, `.env.example`, the config default and the docs.
- The plan called for the race tests to be written first, red, before the services. That is not what happened — the services were written first. Rather than claim the order I did not follow, I got the same guarantee from the mutation checks, and the deviation is recorded here.

## What I would change about the workflow

- The invariants and the concurrency rules went into `CLAUDE.md` before any code was written, and nothing violated them. That was the highest-leverage thirty minutes.
- The design review of the plan happened before implementation and caught the payment-ordering flaw while it was still a paragraph rather than a migration. Doing that review earlier, on the first draft of the plan, would have been cheaper still.
- I let the services be written before the race tests. Writing the two most important tests first and watching them fail would have been better evidence than reconstructing it afterwards.

## How I verified the final implementation

- **`npm test`** — 29 tests against a real Postgres in Docker. Not SQLite: it serialises writes, so race tests against it prove nothing. Time is driven by an injected clock, never fake timers, which would hang the `pg` driver.
- **An invariant check after every single test** — no class over capacity, no child with two active bookings in a class, no booking with two live or two successful payment attempts. A test that passes its own assertions but corrupts the database still fails.
- **Two mutation checks**, described in `README.md`: removing the row lock makes twenty parents all win the last seat; charging before recording makes the double-charge and crash tests fail. Both were restored afterwards.
- **The API by hand** — the `curl` sequence in `README.md`, run against the running container.
- **The UI by hand** — held a seat, declined the card, watched the seat return to the class list, rebooked, paid, and confirmed the student appeared on the staff roster.
- **The demo script** — `npm run demo:last-seat` replays the brief's four steps deterministically and ends with exactly one confirmed booking and one flagged for refund.
- **A clean-clone check** — `docker compose down -v` followed by `docker compose up --build`, to confirm a reviewer with nothing but Docker gets a working system and correct demo data.
- **Reading every diff** before each commit. The layer with the most room for a silent bug is the one where every query result has to be checked for an error; that is where I read most carefully.
