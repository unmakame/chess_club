SET search_path=club,public;
CREATE FUNCTION reopen_table(t bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=club,pg_temp AS $$
BEGIN
 UPDATE chess_table SET active=true WHERE id=t;
 IF NOT FOUND THEN RAISE EXCEPTION 'Стол не найден'; END IF;
END $$;
