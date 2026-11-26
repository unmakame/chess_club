SET search_path=club,public;

CREATE TABLE training_attempt (
    visitor_id bigint REFERENCES visitor ON DELETE CASCADE,
    attempt_id uuid,
    lesson_id text NOT NULL,
    theme text NOT NULL CHECK (theme IN ('opening','fork','pin','mate','endgame')),
    difficulty smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
    solved boolean NOT NULL,
    errors smallint NOT NULL CHECK (errors BETWEEN 0 AND 100),
    engine_loss smallint CHECK (engine_loss BETWEEN 0 AND 500),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (visitor_id,attempt_id)
);
CREATE INDEX training_attempt_recent ON training_attempt (visitor_id,created_at DESC);

CREATE TABLE training_game_analysis (
    visitor_id bigint REFERENCES visitor ON DELETE CASCADE,
    game_id uuid,
    losses smallint[] NOT NULL CHECK (cardinality(losses) BETWEEN 1 AND 200),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (visitor_id,game_id)
);
CREATE INDEX training_game_analysis_recent ON training_game_analysis (visitor_id,created_at DESC);
