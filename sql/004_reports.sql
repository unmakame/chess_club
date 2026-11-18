SET search_path=club,public;
CREATE VIEW schedule AS SELECT b.id,t.code,v.name AS visitor,b.starts,b.ends,b.status,b.price
 FROM booking b JOIN chess_table t ON t.id=b.table_id JOIN visitor v ON v.id=b.visitor_id;
CREATE VIEW refund_queue AS SELECT p.booking_id,r.payment_id,v.email,r.amount,r.requested_at FROM refund r
 JOIN payment p ON p.id=r.payment_id JOIN booking b ON b.id=p.booking_id JOIN visitor v ON v.id=b.visitor_id WHERE r.settled_at IS NULL;
CREATE VIEW cash_flow AS
 SELECT received_at AS happened_at,amount FROM payment UNION ALL SELECT settled_at,-amount FROM refund WHERE settled_at IS NOT NULL;
CREATE MATERIALIZED VIEW monthly_cash AS
 WITH totals AS (SELECT date_trunc('month',happened_at AT TIME ZONE 'Europe/Moscow')::date AS month,sum(amount) AS net FROM cash_flow GROUP BY 1)
 SELECT month,net,net-lag(net) OVER (ORDER BY month) AS change_from_previous_reported_month,sum(net) OVER (ORDER BY month) AS cumulative FROM totals;
CREATE FUNCTION refresh_cash() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=club,pg_temp AS $$ REFRESH MATERIALIZED VIEW monthly_cash $$;
CREATE VIEW attendance_rank AS
 WITH minutes AS (SELECT b.table_id, date_trunc('month',v.entered AT TIME ZONE 'Europe/Moscow')::date AS month,
 sum(extract(epoch FROM v.departed-v.entered)/60)::bigint AS occupied_minutes FROM visit v JOIN booking b ON b.id=v.booking_id WHERE departed IS NOT NULL GROUP BY 1,2)
 SELECT month,t.code,occupied_minutes,rank() OVER(PARTITION BY month ORDER BY occupied_minutes DESC) AS position FROM minutes JOIN chess_table t ON t.id=table_id;
CREATE VIEW regulars AS SELECT v.id,v.name,count(*) AS visits FROM visitor v JOIN booking b ON b.visitor_id=v.id JOIN visit x ON x.booking_id=b.id GROUP BY v.id HAVING count(*)>=3;
CREATE VIEW unused_tables AS SELECT t.id,t.code FROM chess_table t WHERE active AND NOT EXISTS(SELECT FROM booking b WHERE b.table_id=t.id AND b.status IN ('HOLD','CONFIRMED','IN_USE'));
CREATE VIEW tariff_sales AS SELECT t.name,count(p.id) AS sales,coalesce(sum(p.amount),0) AS gross FROM tariff t LEFT JOIN booking b ON b.tariff_id=t.id LEFT JOIN payment p ON p.booking_id=b.id AND p.applied GROUP BY t.id;
CREATE VIEW no_shows AS SELECT v.email,count(*) AS missed,max(b.starts) AS last_missed FROM booking b JOIN visitor v ON v.id=b.visitor_id WHERE status='NO_SHOW' GROUP BY v.id;
CREATE FUNCTION maintain_table(t bigint,staff bigint,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=club,pg_temp AS $$
DECLARE b bigint;
BEGIN
 IF NOT EXISTS(SELECT FROM employee WHERE id=staff) OR coalesce(btrim(reason),'')='' THEN RAISE EXCEPTION 'Укажите сотрудника и причину'; END IF;
 UPDATE chess_table SET active=false WHERE id=t;
 IF NOT FOUND THEN RAISE EXCEPTION 'Стол не найден'; END IF;
 FOR b IN SELECT id FROM booking WHERE table_id=t AND status IN ('HOLD','CONFIRMED') ORDER BY id FOR UPDATE LOOP
  PERFORM cancel(b,reason,staff);
 END LOOP;
END $$;
CREATE FUNCTION settle_refund(p uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=club,pg_temp AS $$
BEGIN
 UPDATE refund SET settled_at=coalesce(settled_at,clock_timestamp()) WHERE payment_id=p;
 IF NOT FOUND THEN RAISE EXCEPTION 'Возврат не найден'; END IF;
END $$;
CREATE INDEX booking_visitor_time ON booking(visitor_id,starts DESC);
CREATE INDEX booking_table_time ON booking(table_id,starts DESC);
CREATE INDEX booking_unattended ON booking(starts) WHERE status='NO_SHOW';
