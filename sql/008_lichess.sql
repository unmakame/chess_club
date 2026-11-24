SET search_path=club,public;
ALTER TABLE visitor ALTER COLUMN email DROP NOT NULL;
CREATE TABLE lichess_account (
    subject text PRIMARY KEY,
    visitor_id bigint NOT NULL UNIQUE REFERENCES visitor ON DELETE CASCADE,
    username text NOT NULL,
    ratings jsonb NOT NULL,
    synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION sign_in_lichess(subject_id text, display_name text, scores jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=club,pg_temp AS $$
DECLARE member bigint;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(subject_id, 831));
    SELECT visitor_id INTO member FROM lichess_account WHERE subject=subject_id;
    IF member IS NULL THEN
        INSERT INTO visitor(name) VALUES(display_name) RETURNING id INTO member;
        INSERT INTO lichess_account(subject, visitor_id, username, ratings)
        VALUES(subject_id, member, display_name, scores);
    ELSE
        UPDATE lichess_account SET username=display_name, ratings=scores, synced_at=now()
        WHERE subject=subject_id;
    END IF;
    RETURN member;
END $$;
