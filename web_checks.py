import json
import re
from uuid import uuid4
from urllib.parse import urlparse

import checks
from web import app
from db import connect


class WebChecks(checks.ClubChecks):
    def test_daily_training_discount(self):
        from unittest.mock import patch

        client = app.test_client()
        client.get("/training")
        with client.session_transaction() as current:
            current["member"] = 15
            csrf = current["token"]
        puzzle = ("sample", {"fen": "3r3k/8/8/4N3/8/8/8/4K3 w - - 0 1"}, ["e5f7"])
        with patch("training.fetch_puzzle", return_value=puzzle):
            daily = client.get("/training/daily").get_json()
        self.assertNotIn("solution",daily)
        self.assertFalse(client.post("/training/solve", data={
            "csrf":csrf, "day":daily["day"], "moves":"e5d7",
        }).get_json()["correct"])
        for _ in range(2):
            stats = client.post("/training/solve", data={
                "csrf":csrf, "day":daily["day"], "moves":"e5f7",
            }).get_json()
            self.assertEqual((stats["streak"],stats["discount"]),(1,2))
        data = {"csrf":csrf, "visitor_id":"1", "table_id":"6", "tariff_id":"1",
                "starts":self.start.isoformat(), "ends":self.end.isoformat(), "request_key":str(uuid4())}
        first = client.post("/action/hold", data=data)
        second = client.post("/action/hold", data=data)
        self.assertEqual(second.location,first.location)
        booking_id = int(first.location.rsplit("/",1)[-1])
        self.assertEqual(self.scalar("SELECT visitor_id,price FROM booking WHERE id=%s",(booking_id,)),15)
        self.assertEqual(self.scalar("SELECT price FROM booking WHERE id=%s",(booking_id,)),39200)

    def test_lichess_registration(self):
        from unittest.mock import patch
        from urllib.parse import parse_qs, urlsplit
        client = app.test_client()
        client.get("/profile")
        for attempt in range(2):
            with client.session_transaction() as current:
                csrf = current["token"]
            started = client.post("/login/lichess", data={"csrf": csrf})
            params = parse_qs(urlsplit(started.location).query)
            self.assertEqual(params["code_challenge_method"], ["S256"])
            profile = {"id": "clubtest", "username": "ClubTest",
                       "perfs": {"rapid": {"rating": 1800+attempt, "games": 8, "prov": True}}}
            with patch("lichess_login.api", side_effect=[{"access_token":"test"},profile]):
                response = client.get("/login/lichess/callback", query_string={"state":params["state"][0],"code":"test"}, follow_redirects=True)
            self.assertIn("ClubTest", response.get_data(as_text=True))
        with connect() as db:
            result=db.execute("SELECT count(*),max((ratings->'rapid'->>'rating')::int) FROM lichess_account WHERE subject='clubtest'").fetchone()
        self.assertEqual(result,(1,1801))
        self.assertEqual(client.get("/login/lichess/callback?state=wrong&code=x").status_code,400)

    def test_web_shift(self):
        client=app.test_client()
        app.testing=True
        for url in ("/","/bookings","/catalog/visitor","/catalog/tariff","/tables/1","/tables/2","/reserve"):
            self.assertEqual(client.get(url).status_code,200,url)
        from club import REPORTS
        for view in REPORTS:
            self.assertEqual(client.get("/reports",query_string={"view":view}).status_code,200)
        reserve=client.get("/reserve",query_string={"day":self.start.date()}).get_data(as_text=True)
        payload=json.loads(re.search(r'<script type="application/json" id="page-data">(.*?)</script>',reserve,re.S)[1])
        fields={"csrf":payload["csrf"],"starts":payload["s"],"ends":payload["e"],"request_key":payload["key"]}
        self.assertEqual(client.post("/action/add").status_code,403)
        response=client.post("/action/hold",data={**fields,"visitor_id":"15","table_id":"5","tariff_id":"1"})
        path=urlparse(response.location).path
        self.assertRegex(path,r'^/booking/\d+$')
        booking=path.split("/")[-1]
        common={"csrf":fields["csrf"],"booking_id":booking}
        event=str(uuid4())
        for cmd,args in [("pay",{"event_id":event,"kopecks":"40000"}),("cancel",{"reason":"Тест смены"}),("refund",{"event_id":event})]:
            page=client.post("/action/"+cmd,data={**common,**args},follow_redirects=True)
            result=json.loads(re.search(r'<script type="application/json" id="page-data">(.*?)</script>',page.get_data(as_text=True),re.S)[1])
            self.assertIn(["message","Изменения сохранены."],result["messages"])
        self.assertIsNotNone(result["payments"][0]["settled_at"])


if __name__=="__main__":
    import unittest
    unittest.main(verbosity=2)
