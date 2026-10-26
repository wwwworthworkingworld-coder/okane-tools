/* 画面用の小さな補助関数 */
const UI = {
  $: id => document.getElementById(id),
  num: id => { const v = Number(document.getElementById(id).value); return Number.isFinite(v) ? v : 0; },
  yen: v => (v < 0 ? "-" : "") + "¥" + Math.abs(Math.round(v)).toLocaleString("ja-JP"),
  set: (id, text, cls) => { const e = document.getElementById(id); e.textContent = text; if (cls !== undefined) e.className = "v " + cls; },
  watch: fn => { document.querySelectorAll("input,select").forEach(el => el.addEventListener("input", fn)); fn(); },
};

/* 共通のヘッダー・フッター */
document.addEventListener("DOMContentLoaded", () => {
  const nav = [
    ["index.html", "トップ"], ["fukugyo-tax.html", "副業の税金"], ["kaji-anbun.html", "家事按分"],
    ["genka-shokyaku.html", "減価償却"], ["kabu-tax.html", "株の税金"], ["nisa.html", "NISA枠"],
    ["booth-fee.html", "BOOTH手数料"],
  ];
  const h = document.querySelector(".site-header");
  if (h) h.innerHTML = `<div class="wrap"><a class="logo" href="index.html">お金の計算ツール</a><nav class="nav">${
    nav.map(([href, t]) => `<a href="${href}">${t}</a>`).join("")}</nav></div>`;
  const f = document.querySelector(".site-footer");
  if (f) f.innerHTML = `計算結果は目安です。税務上の判断は税務署・税理士にご確認ください。入力した数字はこの端末の中だけで計算され、どこにも送信されません。<br>
    <a href="about.html">運営者情報</a>　<a href="privacy.html">プライバシーポリシー</a>　運営：株式会社256`;
});
