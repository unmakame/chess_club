SET search_path=club,public;
ALTER TABLE booking ADD COLUMN cancellation_reason text;
CREATE FUNCTION hold(v bigint,t bigint,r bigint,s timestamptz,e timestamptz,k uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=club,pg_temp AS $$
DECLARE old booking; rate integer; local_s timestamp := s AT TIME ZONE 'Europe/Moscow'; local_e timestamp := e AT TIME ZONE 'Europe/Moscow'; result bigint;
BEGIN
 PERFORM 1 FROM visitor WHERE id=v FOR UPDATE;
 SELECT * INTO old FROM booking WHERE visitor_id=v AND request_key=k;
 IF FOUND THEN
  IF (old.table_id,old.tariff_id,old.starts,old.ends) IS DISTINCT FROM (t,r,s,e) THEN RAISE EXCEPTION 'Ключ занят другой командой'; END IF;
  RETURN old.id;
 END IF;
 PERFORM 1 FROM chess_table WHERE id=t AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Стол недоступен'; END IF;
 UPDATE booking SET status='EXPIRED' WHERE (table_id=t OR visitor_id=v) AND status='HOLD' AND hold_until<=clock_timestamp();
 IF s<=clock_timestamp() OR s>clock_timestamp()+interval '90 days' OR local_s::date<>local_e::date
 OR local_s::time<time '10:00' OR local_e::time>time '22:00' OR EXISTS(SELECT FROM closed_day WHERE day=local_s::date)
 THEN RAISE EXCEPTION 'Интервал вне расписания'; END IF;
 IF (SELECT count(*) FROM booking WHERE visitor_id=v AND status='HOLD')>=3 THEN RAISE EXCEPTION 'Достигнут лимит удержаний'; END IF;
 SELECT hourly_kopecks INTO STRICT rate FROM tariff WHERE id=r;
 INSERT INTO booking(visitor_id,table_id,tariff_id,starts,ends,request_key,price,status,hold_until)
 VALUES(v,t,r,s,e,k,round(rate*extract(epoch FROM e-s)/3600),'HOLD',least(s,clock_timestamp()+interval '10 minutes')) RETURNING id INTO result;
 RETURN result;
END $$;

CREATE FUNCTION receive_payment(b bigint,event uuid,kopecks bigint) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=club,pg_temp AS $$
DECLARE row_b booking; previous payment; accept boolean;
BEGIN
 SELECT * INTO STRICT row_b FROM booking WHERE id=b FOR UPDATE;
 SELECT * INTO previous FROM payment WHERE id=event;
 IF FOUND THEN
  IF previous.booking_id<>b OR previous.amount<>kopecks THEN RAISE EXCEPTION 'Содержимое платежа изменилось'; END IF;
  RETURN CASE WHEN previous.applied THEN 'CONFIRMED' ELSE 'REFUND' END;
 END IF;
 IF kopecks<>row_b.price THEN RAISE EXCEPTION 'Сумма отличается от цены брони'; END IF;
 accept := row_b.status='HOLD' AND row_b.hold_until>clock_timestamp();
 INSERT INTO payment(id,booking_id,amount,applied) VALUES(event,b,kopecks,accept);
 IF accept THEN UPDATE booking SET status='CONFIRMED' WHERE id=b; RETURN 'CONFIRMED'; END IF;
 UPDATE booking SET status='EXPIRED' WHERE id=b AND status='HOLD';
 INSERT INTO refund(payment_id,amount) VALUES(event,kopecks);
 RETURN 'REFUND';
END $$;

CREATE FUNCTION cancel(b bigint,reason text,staff bigint DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=club,pg_temp AS $$
DECLARE row_b booking; pct integer;
BEGIN
 SELECT * INTO STRICT row_b FROM booking WHERE id=b FOR UPDATE;
 IF row_b.status='CANCELLED' THEN RETURN 'CANCELLED'; END IF;
 IF reason IS NULL OR btrim(reason)='' OR row_b.status NOT IN ('HOLD','CONFIRMED') OR
 (staff IS NULL AND row_b.starts<=clock_timestamp()) THEN RAISE EXCEPTION 'Отмена недоступна'; END IF;
 IF staff IS NOT NULL THEN PERFORM id FROM employee WHERE id=staff; IF NOT FOUND THEN RAISE EXCEPTION 'Сотрудник не найден'; END IF; END IF;
 pct := CASE WHEN staff IS NOT NULL OR row_b.starts-clock_timestamp()>=row_b.full_notice THEN 100 ELSE row_b.late_percent END;
 UPDATE booking SET status='CANCELLED',cancellation_reason=reason,cancelled_by=staff WHERE id=b;
 INSERT INTO refund(payment_id,amount) SELECT id,round(amount*pct/100.0) FROM payment WHERE booking_id=b AND applied AND pct>0;
 RETURN 'CANCELLED';
END $$;
ALTER TABLE booking ADD COLUMN cancelled_by bigint REFERENCES employee;

CREATE FUNCTION attendance(b bigint,staff bigint,leaving boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=club,pg_temp AS $$
DECLARE row_b booking; ts timestamptz;
BEGIN
 SELECT * INTO STRICT row_b FROM booking WHERE id=b FOR UPDATE;
 ts := clock_timestamp();
 IF leaving THEN
  IF row_b.status='COMPLETED' THEN RETURN row_b.status; END IF;
  IF row_b.status<>'IN_USE' THEN RAISE EXCEPTION 'Нет открытого визита'; END IF;
  UPDATE visit SET departed=ts WHERE booking_id=b;
  UPDATE booking SET status='COMPLETED' WHERE id=b; RETURN 'COMPLETED';
 END IF;
 IF row_b.status='IN_USE' THEN RETURN row_b.status; END IF;
 IF row_b.status<>'CONFIRMED' OR ts<row_b.starts OR ts>=row_b.starts+interval '15 min' THEN RAISE EXCEPTION 'Вход недоступен'; END IF;
 INSERT INTO visit VALUES(b,staff,ts,NULL);
 UPDATE booking SET status='IN_USE' WHERE id=b; RETURN 'IN_USE';
END $$;
CREATE FUNCTION expire_bookings() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=club,pg_temp AS $$
 UPDATE booking SET status='EXPIRED' WHERE status='HOLD' AND hold_until<=clock_timestamp();
 UPDATE booking SET status='NO_SHOW' WHERE status='CONFIRMED' AND starts+interval '15 min'<=clock_timestamp();
$$;
