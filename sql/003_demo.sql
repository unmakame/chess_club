SET search_path=club,public;
INSERT INTO employee(name) VALUES ('Алексей Смирнов'),('Мария Орлова');
INSERT INTO tariff(name,hourly_kopecks) VALUES ('Стандарт',40000),('Клубный',30000);
INSERT INTO chess_table(code,active) SELECT 'T'||lpad(i::text,3,'0'),i<>2 FROM generate_series(1,24) i;
INSERT INTO closed_day VALUES ('2027-01-01','Клуб закрыт');
INSERT INTO visitor(name,email) SELECT (ARRAY['Анна','Ирина','Иван','Олег','Мария'])[1+i%5]||' '||
 (ARRAY['Ли','Ким','Черных','Белых'])[1+i%4],'visitor'||i||'@example.test' FROM generate_series(1,200) i;
INSERT INTO booking(visitor_id,table_id,tariff_id,request_key,starts,ends,hold_until,price,status)
 SELECT 1+i%200,1+i%24,1,md5('booking'||i)::uuid,s,s+interval '1 hour',s-interval '1 day',40000,
 CASE WHEN i%10=0 THEN 'CANCELLED' WHEN i%11=0 THEN 'EXPIRED' WHEN i%13=0 THEN 'NO_SHOW' ELSE 'COMPLETED' END
 FROM generate_series(0,1199) i CROSS JOIN LATERAL (SELECT timestamptz '2025-01-01 10:00+03'+(i/24)*interval '1 day' AS s) x;
INSERT INTO payment SELECT md5('payment'||id)::uuid,id,price,true,hold_until FROM booking WHERE status<>'EXPIRED';
INSERT INTO refund SELECT p.id,p.amount,b.hold_until,b.hold_until+interval '1 hour' FROM payment p JOIN booking b ON b.id=p.booking_id WHERE b.status='CANCELLED';
INSERT INTO visit SELECT id,1,starts,ends FROM booking WHERE status='COMPLETED';
