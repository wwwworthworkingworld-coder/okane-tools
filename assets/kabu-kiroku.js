/* 株の損益・配当の記録ツールの計算（画面とは分けてある。kabu-kiroku.html から使う）
 * 取得単価は国税庁 No.1466「総平均法に準ずる方法」：同じ銘柄・同じ口座の買いを、売るまでの間で平均し、1円未満は切り上げ。
 * 売却損益 ＝ 売却代金 − 売却手数料 − 取得費（取得単価×数量）。買いの手数料は取得費に含める。
 * 参考：国税庁 No.1463（税率）、No.1466（取得費）、No.1474（損益通算・繰越控除）、No.1330（配当）、No.1535（NISA） 2026-11-07 確認 */
const KabuKiroku = (() => {
  const ACCOUNTS = {
    tokutei_ari: "特定口座（源泉あり）", tokutei_nashi: "特定口座（源泉なし）", ippan: "一般口座",
    nisa_tsumitate: "NISA つみたて投資枠", nisa_seicho: "NISA 成長投資枠",
  };
  const isNisa = a => a === "nisa_tsumitate" || a === "nisa_seicho";
  const NISA = { YEAR_TSUMITATE: 1200000, YEAR_SEICHO: 2400000, LIFE: 18000000, LIFE_SEICHO: 12000000 };
  const RATE = { IT: 0.15315, RT: 0.05 };           // 上場株式等の源泉徴収：所得税・復興特別所得税 15.315%、住民税 5%

  /* 配当の源泉徴収額の目安（NISA口座は0）。所得税分と住民税分をそれぞれ1円未満切り捨て */
  function withholding(amount, account) {
    if (!(amount > 0) || isNisa(account)) return { it: 0, rt: 0, total: 0 };
    const it = Math.floor(amount * RATE.IT), rt = Math.floor(amount * RATE.RT);
    return { it, rt, total: it + rt };
  }

  /* 取引を日付順に流して、売りごとの取得費と損益、いまの保有を出す
   * trade: { id, date:"YYYY-MM-DD", name, account, side:"buy"|"sell", qty, price, fee } */
  function compute(trades) {
    const sorted = trades.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.side === "buy" ? -1 : 1) || a.id - b.id);
    const pos = {};                                  // key → { qty, cost }
    const results = {};                              // trade.id → { cost, gain, avg, warn }
    for (const t of sorted) {
      const key = t.name.trim() + "\t" + t.account;
      const p = pos[key] || (pos[key] = { qty: 0, cost: 0, name: t.name.trim(), account: t.account });
      if (t.side === "buy") {
        p.qty += t.qty; p.cost += t.qty * t.price + (t.fee || 0);
        results[t.id] = { cost: t.qty * t.price + (t.fee || 0), gain: null, avg: p.qty ? Math.ceil(p.cost / p.qty) : 0 };
      } else {
        let warn = "";
        const avg = p.qty > 0 ? Math.ceil(p.cost / p.qty) : 0;
        let qty = t.qty;
        if (qty > p.qty) { warn = "保有数量を超える売りです（買いの記録が足りないか、日付の順が違います）。超えた分の取得費は0で計算"; qty = p.qty; }
        const cost = avg * qty;
        const gain = t.qty * t.price - (t.fee || 0) - cost;
        // 残りは「切り上げ後の取得単価×残数量」で持つ（国税庁 No.1466 の設例と同じ扱い）
        p.qty -= t.qty; if (p.qty <= 0) { p.qty = 0; p.cost = 0; } else p.cost = avg * p.qty;
        results[t.id] = { cost, gain, avg, warn };
      }
    }
    const holdings = Object.values(pos).filter(p => p.qty > 0).map(p => ({ ...p, avg: Math.ceil(p.cost / p.qty) }));
    return { results, holdings };
  }

  /* 年の集計 */
  function summarize(trades, dividends, year, results) {
    const y = String(year);
    const byAcc = {};
    const acc = a => byAcc[a] || (byAcc[a] = { gain: 0, dividend: 0, withheld: 0, buy: 0, sell: 0, sellCount: 0 });
    for (const t of trades) {
      if (t.date.slice(0, 4) !== y) continue;
      const a = acc(t.account);
      if (t.side === "buy") a.buy += t.qty * t.price;
      else { a.sell += t.qty * t.price; a.sellCount++; const r = results[t.id]; if (r && r.gain !== null) a.gain += r.gain; }
    }
    for (const d of dividends) {
      if (d.date.slice(0, 4) !== y) continue;
      const a = acc(d.account); a.dividend += d.amount; a.withheld += d.withheld || 0;
    }
    const taxable = Object.entries(byAcc).filter(([k]) => !isNisa(k)).map(([, v]) => v);
    const gain = taxable.reduce((s, v) => s + v.gain, 0);
    const dividend = taxable.reduce((s, v) => s + v.dividend, 0);
    const withheld = taxable.reduce((s, v) => s + v.withheld, 0);
    const nisaGain = Object.entries(byAcc).filter(([k]) => isNisa(k)).reduce((s, [, v]) => s + v.gain, 0);
    const nisaDividend = Object.entries(byAcc).filter(([k]) => isNisa(k)).reduce((s, [, v]) => s + v.dividend, 0);
    // 損益通算の目安：譲渡損を配当（申告分離）と相殺した後の課税対象と、20.315%の税額、源泉済みとの差
    const offset = gain < 0 ? Math.min(-gain, dividend) : 0;
    const netGain = Math.max(0, gain), netDividend = dividend - offset;
    const carry = gain < 0 ? -gain - offset : 0;
    const taxBase = netGain + netDividend;
    const taxEst = Math.floor(taxBase * RATE.IT) + Math.floor(taxBase * RATE.RT);
    // 源泉あり口座の譲渡益の源泉（証券会社が年末に計算）の目安
    const ariGain = byAcc.tokutei_ari ? Math.max(0, byAcc.tokutei_ari.gain) : 0;
    const withheldGain = Math.floor(ariGain * RATE.IT) + Math.floor(ariGain * RATE.RT);
    return { byAcc, gain, dividend, withheld, nisaGain, nisaDividend, offset, netGain, netDividend, carry, taxBase, taxEst, withheldGain,
      refund: withheld + withheldGain - taxEst };
  }

  /* NISA枠：今年の使用額（買いの約定代金。手数料は含まない）と、生涯の簿価残高 */
  function nisa(trades, year, holdings) {
    const y = String(year);
    const used = { nisa_tsumitate: 0, nisa_seicho: 0 };
    for (const t of trades) if (isNisa(t.account) && t.side === "buy" && t.date.slice(0, 4) === y) used[t.account] += t.qty * t.price;
    const book = { nisa_tsumitate: 0, nisa_seicho: 0 };
    for (const h of holdings) if (isNisa(h.account)) book[h.account] += h.cost;
    const lifeUsed = book.nisa_tsumitate + book.nisa_seicho;
    return {
      tsumitateUsed: used.nisa_tsumitate, tsumitateLeft: Math.max(0, NISA.YEAR_TSUMITATE - used.nisa_tsumitate),
      seichoUsed: used.nisa_seicho, seichoLeft: Math.max(0, NISA.YEAR_SEICHO - used.nisa_seicho),
      lifeUsed, lifeLeft: Math.max(0, NISA.LIFE - lifeUsed), seichoLifeUsed: book.nisa_seicho, seichoLifeLeft: Math.max(0, NISA.LIFE_SEICHO - book.nisa_seicho),
      overTsumitate: used.nisa_tsumitate > NISA.YEAR_TSUMITATE, overSeicho: used.nisa_seicho > NISA.YEAR_SEICHO, overLife: lifeUsed > NISA.LIFE,
    };
  }

  return { ACCOUNTS, isNisa, NISA, RATE, withholding, compute, summarize, nisa };
})();
