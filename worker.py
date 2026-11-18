import time
import psycopg
from db import connect

while True:
    try:
        with connect() as conn:
            conn.execute("SELECT expire_bookings()")
    except psycopg.Error as error:
        print(error.diag.message_primary or str(error), flush=True)
    time.sleep(15)
