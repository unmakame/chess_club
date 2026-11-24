SET search_path=club,public;
CREATE TABLE club_account (
    provider text NOT NULL CHECK (provider IN ('local','google','vk')),
    subject text NOT NULL,
    visitor_id bigint NOT NULL UNIQUE REFERENCES visitor ON DELETE CASCADE,
    password_hash text,
    PRIMARY KEY (provider,subject),
    CHECK ((provider='local')=(password_hash IS NOT NULL))
);
