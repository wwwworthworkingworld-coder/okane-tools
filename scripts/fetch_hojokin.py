"""Jグランツの公開APIから公募中の補助金を集めて data/hojokin.json に保存する。
失敗したとき、または件数が前回の半分未満のときは、前のデータを残して異常終了する（GitHubからメールが届く）。"""
import json, os, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

API = "https://api.jgrants-portal.go.jp/exp/v1/public/subsidies"
KEYWORDS = ["補助金", "助成金", "支援", "事業", "中小企業", "小規模", "個人事業主", "創業", "設備", "販路"]
PERSONAL = re.compile("個人事業|フリーランス")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "hojokin.json")
HEADERS = {"User-Agent": "256company.com hojokin list (GitHub Actions)"}


def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["result"]


def fetch_list():
    found = {}
    for k in KEYWORDS:
        q = urllib.parse.urlencode({"keyword": k, "sort": "created_date", "order": "DESC", "acceptance": "1"})
        for x in get(f"{API}?{q}"):
            found[x["id"]] = x
        time.sleep(1)
    return found


def fetch_detail(sid):
    # 詳細は添付ファイルを含んで重いので、初めて見た制度と締切が変わった制度だけ取る
    d = get(f"{API}/id/{sid}")[0]
    text = " ".join(str(d.get(k) or "") for k in ("title", "subsidy_catch_phrase", "detail"))
    time.sleep(0.5)
    return {"personal": bool(PERSONAL.search(text)), "institution": d.get("institution_name") or "",
            "rate": (d.get("subsidy_rate") or "")[:60], "purpose": d.get("use_purpose") or ""}


def main():
    old_items, old_count = {}, 0
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            old_items = {x["id"]: x for x in json.load(f)["items"]}
        old_count = len(old_items)

    found = fetch_list()
    if len(found) < old_count / 2 or not found:
        sys.exit(f"件数が異常です：前回 {old_count} 件、今回 {len(found)} 件。前のデータを残します。")

    items = []
    for sid, x in found.items():
        end = x.get("acceptance_end_datetime")
        old = old_items.get(sid)
        extra = old if old and old.get("end") == end else fetch_detail(sid)
        items.append({"id": sid, "title": x["title"], "area": x.get("target_area_search") or "",
                      "max": x.get("subsidy_max_limit") or 0, "end": end,
                      "employees": x.get("target_number_of_employees") or "",
                      **{k: extra[k] for k in ("personal", "institution", "rate", "purpose")}})
    items.sort(key=lambda i: i["end"] or "9999")
    now = datetime.now(timezone(timedelta(hours=9))).isoformat(timespec="minutes")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"updated": now, "items": items}, f, ensure_ascii=False, indent=0, separators=(",", ":"))
    print(f"{len(items)} 件を保存（個人事業主の記載あり {sum(i['personal'] for i in items)} 件）")


if __name__ == "__main__":
    main()
