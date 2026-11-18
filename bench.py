import argparse
from statistics import median
from db import connect

QUERIES = {
    "История посетителя": "SELECT id,starts FROM bench WHERE visitor_id=117 ORDER BY starts DESC LIMIT 15",
    "Расписание стола": "SELECT id,starts FROM bench WHERE table_id=18 AND starts>=timestamptz '2024-08-01' ORDER BY starts LIMIT 10",
    "Неявки за неделю": "SELECT count(*) FROM bench WHERE status='NO_SHOW' AND starts>=timestamptz '2024-08-01' AND starts<timestamptz '2024-08-08'",
}


def measure(conn, query):
    plans = [conn.execute("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "+query).fetchone()[0][0] for _ in range(6)]
    warm = sorted(plans[1:],key=lambda p:p["Execution Time"])
    node = warm[2]["Plan"]
    path = []
    while node:
        path.append(node["Node Type"])
        node = next(iter(node.get("Plans",[])),None)
    top = warm[2]["Plan"]
    return " → ".join(path), median(p["Execution Time"] for p in warm),top.get("Local Hit Blocks",0)+top.get("Local Read Blocks",0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows",type=int,default=100000)
    count = parser.parse_args().rows
    if count<100000:
        parser.error("Минимум 100000 строк")
    with connect(True) as conn:
        conn.execute("CREATE TEMP TABLE bench AS SELECT id,visitor_id,table_id,starts,status FROM booking WITH NO DATA")
        conn.execute("""INSERT INTO bench SELECT i,1+mod(i,1000),1+mod(i,101),timestamptz '2024-01-01'+i*interval '5 min',
            CASE WHEN mod(i,37)=0 THEN 'NO_SHOW' ELSE 'COMPLETED' END FROM generate_series(1,%s) i""",(count,))
        conn.execute("ANALYZE bench")
        before = {k:measure(conn,q) for k,q in QUERIES.items()}
        conn.execute("CREATE INDEX ON bench(visitor_id,starts DESC)")
        conn.execute("CREATE INDEX ON bench(table_id,starts DESC)")
        conn.execute("CREATE INDEX ON bench(starts) WHERE status='NO_SHOW'")
        conn.execute("ANALYZE bench")
        print("| Запрос | План до | мс | Блоки | План после | мс | Блоки |")
        print("|---|---|---:|---:|---|---:|---:|")
        for k,q in QUERIES.items():
            a,b,c = before[k]
            d,e,f = measure(conn,q)
            print(f"| {k} | {a} | {b:.3f} | {c} | {d} | {e:.3f} | {f} |")


if __name__=="__main__":
    main()
