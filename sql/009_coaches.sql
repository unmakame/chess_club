SET search_path=club,public;
CREATE TABLE coach (
    slug text PRIMARY KEY, name text NOT NULL, hourly_kopecks integer NOT NULL CHECK (hourly_kopecks > 0)
);
INSERT INTO coach VALUES ('dubov','Даниил Дубов',500000),('nakamura','Хикару Накамура',800000),
    ('nepomniachtchi','Ян Непомнящий',650000),('carlsen','Магнус Карлсен',1000000);
CREATE TABLE coaching_lesson (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coach_slug text NOT NULL REFERENCES coach,
    visitor_id bigint NOT NULL REFERENCES visitor,
    starts timestamptz NOT NULL,
    price integer NOT NULL CHECK (price > 0),
    UNIQUE (coach_slug, starts),
    UNIQUE (visitor_id, starts)
);
CREATE FUNCTION book_lesson(trainer text, player bigint, lesson_start timestamptz) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=club,pg_temp AS $$
DECLARE result bigint; local_start timestamp := lesson_start AT TIME ZONE 'Europe/Moscow';
BEGIN
    IF lesson_start IS NULL OR lesson_start <= now() OR lesson_start > now()+interval '90 days'
       OR local_start <> date_trunc('hour', local_start)
       OR local_start::time NOT BETWEEN time '10:00' AND time '21:00'
       OR EXISTS (SELECT FROM closed_day WHERE day=local_start::date)
    THEN RAISE EXCEPTION 'Выберите будущий час с 10:00 до 21:00 в рабочий день'; END IF;
    INSERT INTO coaching_lesson(coach_slug,visitor_id,starts,price)
    SELECT slug,player,lesson_start,hourly_kopecks FROM coach WHERE slug=trainer RETURNING id INTO result;
    IF result IS NULL THEN RAISE EXCEPTION 'Тренер не найден'; END IF;
    RETURN result;
END $$;
