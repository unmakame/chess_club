import re
from uuid import uuid4
from urllib.parse import urlparse

import checks
from web import app


class WebChecks(checks.ClubChecks):
    def test_web_shift(self):
        client=app.test_client()
        app.testing=True
        for url in ("/","/bookings","/catalog/visitor","/catalog/tariff","/tables/1","/tables/2","/reserve"):
            self.assertEqual(client.get(url).status_code,200,url)
        from club import REPORTS
        for view in REPORTS:
            self.assertEqual(client.get("/reports",query_string={"view":view}).status_code,200)
        reserve=client.get("/reserve",query_string={"day":self.start.date()}).get_data(as_text=True)
        fields=dict(re.findall(r'<input type="hidden" name="([^"]+)" value="([^"]+)">',reserve))
        self.assertEqual(client.post("/action/add").status_code,403)
        response=client.post("/action/hold",data={**fields,"visitor_id":"15","table_id":"5","tariff_id":"1"})
        path=urlparse(response.location).path
        self.assertRegex(path,r'^/booking/\d+$')
        booking=path.split("/")[-1]
        common={"csrf":fields["csrf"],"booking_id":booking}
        event=str(uuid4())
        for cmd,args in [("pay",{"event_id":event,"kopecks":"40000"}),("cancel",{"reason":"Тест смены"}),("refund",{"event_id":event})]:
            page=client.post("/action/"+cmd,data={**common,**args},follow_redirects=True)
            self.assertIn("Изменения сохранены",page.get_data(as_text=True))
        self.assertIn("Исполнен",page.get_data(as_text=True))


if __name__=="__main__":
    import unittest
    unittest.main(verbosity=2)
