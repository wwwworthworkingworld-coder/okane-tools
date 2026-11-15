"""data/hojokin.json から、hojokin.html の一覧（<ul id="list">）に静的な HTML を書き込む。
JavaScript が動かない環境（検索エンジン・広告審査のロボット・noscript）でも中身が見えるようにするため。
ページを開いたときは JS が同じ一覧を絞り込み付きで描き直す。"""
import json, os, re
from datetime import datetime, timedelta, timezone
from html import escape

ROOT = os.path.join(os.path.dirname(__file__), "..")
DATA = os.path.join(ROOT, "data", "hojokin.json")
PAGE = os.path.join(ROOT, "hojokin.html")
JST = timezone(timedelta(hours=9))
LIMIT = 60


def jst_date(s):
    d = datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(JST)
    return f"{d.year}年{d.month}月{d.day}日"


def max_text(v):
    if not v:
        return "上限：公式で確認"
    if v >= 100000000:
        return f"上限 {v / 100000000:g}億円"
    return f"上限 {v // 10000:,}万円"


def main():
    with open(DATA, encoding="utf-8") as f:
        d = json.load(f)
    now = datetime.now(timezone.utc)
    items = [i for i in d["items"] if not i["end"] or datetime.fromisoformat(i["end"].replace("Z", "+00:00")) > now]
    items = items[:LIMIT]
    lis = []
    for i in items:
        url = "https://www.jgrants-portal.go.jp/subsidy/" + i["id"]
        end = f"締切：{jst_date(i['end'])}" if i["end"] else "締切：公式で確認"
        area = i["area"] or "地域：公式で確認"
        lis.append(f'<li><a href="{escape(url)}" target="_blank" rel="noopener">{escape(i["title"])}</a>'
                   f'<div class="meta"><span>{escape(end)}</span>　{escape(area)}　{escape(max_text(i["max"]))}</div></li>')
    updated = datetime.fromisoformat(d["updated"]).astimezone(JST)
    updated_text = f"{updated.year}年{updated.month}月{updated.day}日 {updated.hour}:{updated.minute:02d}"
    with open(PAGE, encoding="utf-8") as f:
        html = f.read()
    html, n1 = re.subn(r'(<ul id="list">)[\s\S]*?(</ul>)', lambda m: m.group(1) + "\n" + "\n".join(lis) + "\n" + m.group(2), html, count=1)
    html, n2 = re.subn(r'(<span id="updated">)[^<]*(</span>)', lambda m: m.group(1) + updated_text + m.group(2), html, count=1)
    html, n3 = re.subn(r'(<p id="count"[^>]*>)[^<]*(</p>)',
                       lambda m: m.group(1) + f"公募中 {len(items)} 件を締切が近い順に表示（絞り込みは JavaScript が有効なときに使えます）" + m.group(2), html, count=1)
    assert n1 == n2 == n3 == 1, (n1, n2, n3)
    with open(PAGE, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"{len(items)} 件を hojokin.html に書き込み（更新 {updated_text}）")


if __name__ == "__main__":
    main()
