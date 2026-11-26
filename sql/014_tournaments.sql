SET search_path=club,public;

CREATE TABLE tournament (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 100),
    organizer_id bigint NOT NULL REFERENCES visitor,
    started_at timestamptz
);

CREATE TABLE tournament_player (
    tournament_id bigint REFERENCES tournament,
    visitor_id bigint REFERENCES visitor,
    PRIMARY KEY (tournament_id, visitor_id)
);

CREATE TABLE tournament_game (
    tournament_id bigint NOT NULL REFERENCES tournament,
    round integer NOT NULL CHECK (round > 0),
    white_id bigint NOT NULL,
    black_id bigint NOT NULL,
    result text CHECK (result IN ('1-0', '0-1', '1/2-1/2')),
    PRIMARY KEY (tournament_id, round, white_id, black_id),
    FOREIGN KEY (tournament_id, white_id) REFERENCES tournament_player,
    FOREIGN KEY (tournament_id, black_id) REFERENCES tournament_player,
    CHECK (white_id <> black_id)
);

CREATE UNIQUE INDEX tournament_unique_pair ON tournament_game
    (tournament_id, least(white_id, black_id), greatest(white_id, black_id));

CREATE VIEW tournament_standings AS
WITH scores AS (
    SELECT tournament_id, white_id AS visitor_id, CASE result WHEN '1-0' THEN 2 WHEN '1/2-1/2' THEN 1 ELSE 0 END AS points
    FROM tournament_game WHERE result IS NOT NULL
    UNION ALL
    SELECT tournament_id, black_id, CASE result WHEN '0-1' THEN 2 WHEN '1/2-1/2' THEN 1 ELSE 0 END
    FROM tournament_game WHERE result IS NOT NULL
), totals AS (
    SELECT p.tournament_id, p.visitor_id, count(s.points) AS played,
           count(*) FILTER (WHERE s.points=2) AS wins,
           coalesce(sum(s.points),0)/2.0 AS points
    FROM tournament_player p LEFT JOIN scores s USING (tournament_id,visitor_id)
    GROUP BY p.tournament_id,p.visitor_id
)
SELECT totals.*, rank() OVER (PARTITION BY tournament_id ORDER BY points DESC,wins DESC) AS place
FROM totals;
