/* 金額欄の下に「120万円」のような読みを出す（.field の中で単位が「円」の数値欄だけ） */
(() => {
  const yomi = n => {
    n = Math.round(Number(n));
    if (!Number.isFinite(n) || Math.abs(n) < 10000) return "";
    const a = Math.abs(n), oku = Math.floor(a / 1e8), man = Math.floor((a % 1e8) / 1e4), en = a % 1e4;
    let s = n < 0 ? "−" : "";
    if (oku) s += oku.toLocaleString("ja-JP") + "億";
    if (man) s += man.toLocaleString("ja-JP") + "万";
    if (en) s += en.toLocaleString("ja-JP");
    return s + "円";
  };
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".field > input[type=number]").forEach(input => {
      const unit = input.parentElement.querySelector(".unit");
      if (!unit || unit.textContent.trim() !== "円") return;
      const out = document.createElement("small");
      out.className = "yomi";
      input.parentElement.insertAdjacentElement("afterend", out);
      const update = () => { out.textContent = yomi(input.value); };
      input.addEventListener("input", update);
      update();
    });
  });
})();
