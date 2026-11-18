import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import psycopg
from psycopg import sql

from club import execute, parser, visitors_csv
from db import connect, migrate


class ClubChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = os.environ["PGDATABASE"]
        cls.database = "chess_test_" + uuid4().hex
        with connect(True) as conn:
            conn.autocommit = True
            conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(cls.database)))
        cls.addClassCleanup(cls.drop_database)
        os.environ["PGDATABASE"] = cls.database
        migrate()

    @classmethod
    def drop_database(cls):
        os.environ["PGDATABASE"] = cls.original
        with connect(True) as conn:
            conn.autocommit = True
            conn.execute(sql.SQL("DROP DATABASE {}").format(sql.Identifier(cls.database)))

    def setUp(self):
        self.db = connect()
        self.addCleanup(self.db.close)
        self.start = self.scalar("SELECT (current_date+2+time '12:00')::timestamptz")
        self.end = self.start + timedelta(hours=1)

    def scalar(self, query, args=()):
        return self.db.execute(query,args or None).fetchone()[0]

    def hold(self, key=None, table=1):
        return self.scalar("SELECT hold(1,%s,1,%s,%s,%s)", (table,self.start,self.end,key or uuid4()))

    def test_hold_payment_cancel(self):
        key, event = uuid4(), uuid4()
        b = self.hold(key)
        self.assertEqual(self.hold(key), b)
        for _ in range(2):
            self.assertEqual(self.scalar("SELECT receive_payment(%s,%s,40000)",(b,event)), "CONFIRMED")
        self.scalar("SELECT cancel(%s,'Изменение планов')",(b,))
        self.assertEqual(self.scalar("SELECT amount FROM refund WHERE payment_id=%s",(event,)),40000)
        self.assertEqual(self.scalar("SELECT count(*) FROM payment WHERE booking_id=%s",(b,)),1)

    def test_late_payment(self):
        b = self.hold()
        self.scalar("SELECT cancel(%s,'Отмена')",(b,))
        self.assertEqual(self.scalar("SELECT receive_payment(%s,%s,40000)",(b,uuid4())),"REFUND")
        self.assertEqual(self.scalar("SELECT status FROM booking WHERE id=%s",(b,)),"CANCELLED")

    def test_rollback(self):
        with self.assertRaises(psycopg.errors.RaiseException):
            with self.db.transaction():
                b = self.hold()
                self.scalar("SELECT receive_payment(%s,%s,40000)",(b,uuid4()))
                self.scalar("SELECT receive_payment(%s,%s,1)",(b,uuid4()))
        for table, field in (("booking","id"),("payment","booking_id")):
            self.assertEqual(self.scalar(f"SELECT count(*) FROM {table} WHERE {field}=%s",(b,)),0)

    def test_crud_and_import(self):
        def command(args):
            return execute(self.db,parser().parse_args(args)).fetchall()
        row = command(["add","visitor","Новый","NEW@example.test"])[0][0]
        command(["edit","visitor",str(row),"Исправлен","new@example.test"])
        self.assertEqual(command(["list","visitor","--search","Исправлен"])[0][0],row)
        command(["delete","visitor",str(row)])
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/"visitors.csv"
            path.write_text("name,email\nПервый,one@example.test\nОшибка,нет\nВторой,two@example.test\n",encoding="utf-8")
            visitors_csv(self.db,path)
        self.assertEqual(self.scalar("SELECT count(*) FROM visitor WHERE email IN ('one@example.test','two@example.test')"),2)

    def test_constraints(self):
        with self.assertRaises(psycopg.Error), self.db.transaction():
            self.hold(table=2)
        self.hold()
        with self.assertRaises(psycopg.errors.ExclusionViolation), self.db.transaction():
            self.hold()
        self.hold(table=3)
        self.hold(table=4)
        with self.assertRaises(psycopg.Error), self.db.transaction():
            self.hold(table=5)
        with self.assertRaises(psycopg.errors.InsufficientPrivilege), self.db.transaction():
            self.db.execute("DELETE FROM audit")

    def test_reports(self):
        self.assertEqual(self.scalar("SELECT sales FROM tariff_sales WHERE name='Клубный'"),0)
        self.assertEqual(self.scalar("SELECT count(*) FROM attendance_rank WHERE occupied_minutes%60<>0"),0)
        self.assertEqual(self.scalar("SELECT count(*) FROM refund_queue"),0)
        self.assertEqual(self.scalar("SELECT count(*) FROM no_shows WHERE email='visitor14@example.test'"),1)
        self.assertEqual(self.scalar("SELECT sum(net) FROM monthly_cash"),39240000)

    def test_visit(self):
        with connect(True) as owner:
            b = owner.execute("""INSERT INTO booking(visitor_id,table_id,tariff_id,request_key,starts,ends,hold_until,price,status)
               SELECT 1,1,1,%s,s,s+interval '1 hour',s,40000,'CONFIRMED'
               FROM (SELECT date_bin(interval '30 minutes',now(),timestamptz '2000-01-01') s) x RETURNING id""",(uuid4(),)).fetchone()[0]
        minutes = self.scalar("SELECT extract(epoch FROM now()-starts)/60 FROM booking WHERE id=%s",(b,))
        if minutes>=15:
            with self.assertRaises(psycopg.Error), self.db.transaction():
                self.scalar("SELECT attendance(%s,1,false)",(b,))
            self.scalar("SELECT expire_bookings()")
            self.assertEqual(self.scalar("SELECT status FROM booking WHERE id=%s",(b,)),"NO_SHOW")
        else:
            for leaving,result in ((False,"IN_USE"),(False,"IN_USE"),(True,"COMPLETED")):
                self.assertEqual(self.scalar("SELECT attendance(%s,1,%s)",(b,leaving)),result)

    def test_concurrent_hold(self):
        gate = Barrier(2)
        def reserve(visitor):
            try:
                with connect() as connection:
                    gate.wait(timeout=10)
                    connection.execute("SELECT hold(%s,24,1,%s,%s,%s)",(visitor,self.start,self.end,uuid4()))
                return "ok"
            except psycopg.errors.ExclusionViolation:
                return "conflict"
        with ThreadPoolExecutor(2) as pool:
            self.assertCountEqual(pool.map(reserve,[10,11]),["ok","conflict"])
        self.assertEqual(self.scalar("SELECT count(*) FROM booking WHERE table_id=24 AND starts=%s",(self.start,)),1)


if __name__=="__main__":
    unittest.main(verbosity=2)
