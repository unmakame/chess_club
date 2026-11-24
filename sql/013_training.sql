SET search_path=club,public;

CREATE TABLE daily_puzzle (
    day date PRIMARY KEY,
    source_id text NOT NULL,
    position jsonb NOT NULL,
    solution text[] NOT NULL CHECK (cardinality(solution)>0)
);

CREATE TABLE daily_puzzle_solve (
    visitor_id bigint NOT NULL REFERENCES visitor ON DELETE CASCADE,
    day date NOT NULL REFERENCES daily_puzzle,
    source_id text NOT NULL,
    PRIMARY KEY (visitor_id,day),
    UNIQUE (visitor_id,source_id)
);

CREATE FUNCTION training_streak(member bigint) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=club,pg_temp AS $$
    WITH recent AS (
        SELECT day,row_number() OVER (ORDER BY day DESC)::int AS step
        FROM daily_puzzle_solve
        WHERE visitor_id=member AND day<=(now() AT TIME ZONE 'UTC')::date
    ), latest AS (
        SELECT day FROM recent WHERE step=1 AND day>=(now() AT TIME ZONE 'UTC')::date-1
    )
    SELECT count(*)::int FROM recent CROSS JOIN latest
    WHERE recent.day=latest.day-(recent.step-1)
$$;

CREATE FUNCTION hold_training(member bigint,t bigint,r bigint,s timestamptz,e timestamptz,k uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=club,pg_temp AS $$
DECLARE reservation bigint; existing boolean; discount integer;
BEGIN
    PERFORM 1 FROM visitor WHERE id=member FOR UPDATE;
    SELECT EXISTS(SELECT 1 FROM booking WHERE visitor_id=member AND request_key=k) INTO existing;
    reservation := hold(member,t,r,s,e,k);
    IF NOT existing THEN
        discount := least(15,2*training_streak(member));
        IF discount>0 THEN
            UPDATE booking SET price=greatest(1,round(price*(100-discount)/100.0))
            WHERE id=reservation;
        END IF;
    END IF;
    RETURN reservation;
END $$;
