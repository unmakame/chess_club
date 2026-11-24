SET search_path=club,public;
WITH player AS (
    INSERT INTO visitor(name,email) VALUES ('Балдуин','balduin@example.test')
    ON CONFLICT (email) DO NOTHING
    RETURNING id
)
INSERT INTO player_rating(visitor_id,week_start,rating,wins)
SELECT id,date_trunc('week',now() AT TIME ZONE 'Europe/Moscow')::date,2750,0 FROM player;
