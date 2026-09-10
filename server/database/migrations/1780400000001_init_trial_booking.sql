SET search_path TO application, public;

CREATE TABLE application.parents (
   id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
   name  TEXT NOT NULL,
   email TEXT NOT NULL UNIQUE
);

CREATE TABLE application.students (
   id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
   parent_id UUID NOT NULL REFERENCES application.parents(id),
   name      TEXT NOT NULL,
   level     SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 6)
);

CREATE INDEX idx_students_parent ON application.students (parent_id);

CREATE TABLE application.trial_classes (
   id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
   subject    TEXT NOT NULL CHECK (subject IN ('math', 'science')),
   level_band TEXT NOT NULL CHECK (level_band IN ('lower', 'upper')),
   starts_at  TIMESTAMPTZ NOT NULL,
   capacity   SMALLINT NOT NULL DEFAULT 4 CHECK (capacity BETWEEN 1 AND 4)
);

CREATE INDEX idx_trial_classes_starts_at ON application.trial_classes (starts_at);

CREATE TABLE application.bookings (
   id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
   student_id      UUID NOT NULL REFERENCES application.students(id),
   trial_class_id  UUID NOT NULL REFERENCES application.trial_classes(id),
   status          TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
                      'pending_payment', 'confirmed', 'payment_failed',
                      'expired', 'refund_required')),
   price_cents     INTEGER NOT NULL CHECK (price_cents >= 0),
   hold_expires_at TIMESTAMPTZ NOT NULL,
   confirmed_at    TIMESTAMPTZ,
   created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT confirmed_booking_has_confirmed_at
      CHECK (status <> 'confirmed' OR confirmed_at IS NOT NULL)
);

CREATE UNIQUE INDEX uniq_bookings_active_per_student_class
   ON application.bookings (student_id, trial_class_id)
   WHERE status IN ('pending_payment', 'confirmed');

CREATE INDEX idx_bookings_class_status ON application.bookings (trial_class_id, status);

CREATE TABLE application.payment_attempts (
   id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
   booking_id      UUID NOT NULL REFERENCES application.bookings(id),
   idempotency_key TEXT NOT NULL UNIQUE,
   amount_cents    INTEGER NOT NULL CHECK (amount_cents >= 0),
   outcome         TEXT NOT NULL DEFAULT 'pending'
                      CHECK (outcome IN ('pending', 'succeeded', 'failed')),
   failure_reason  TEXT,
   provider_ref    TEXT,
   created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT failure_reason_only_when_failed
      CHECK (outcome = 'failed' OR failure_reason IS NULL)
);

CREATE UNIQUE INDEX uniq_payment_attempts_live_per_booking
   ON application.payment_attempts (booking_id)
   WHERE outcome IN ('pending', 'succeeded');

CREATE INDEX idx_payment_attempts_booking ON application.payment_attempts (booking_id);

CREATE FUNCTION application.enforce_confirmed_capacity() RETURNS trigger AS $$
DECLARE
   class_capacity  SMALLINT;
   confirmed_seats INTEGER;
BEGIN
   IF NEW.status = 'confirmed'
      AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed') THEN

      SELECT capacity INTO class_capacity
        FROM application.trial_classes
       WHERE id = NEW.trial_class_id
         FOR UPDATE;

      SELECT count(*) INTO confirmed_seats
        FROM application.bookings
       WHERE trial_class_id = NEW.trial_class_id
         AND status = 'confirmed'
         AND id <> NEW.id;

      IF confirmed_seats >= class_capacity THEN
         RAISE EXCEPTION 'trial class % is at capacity', NEW.trial_class_id
            USING ERRCODE = 'check_violation';
      END IF;
   END IF;

   RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER bookings_enforce_capacity
   BEFORE INSERT OR UPDATE OF status ON application.bookings
   FOR EACH ROW EXECUTE FUNCTION application.enforce_confirmed_capacity();
