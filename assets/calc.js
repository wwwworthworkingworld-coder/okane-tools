/* お金の計算ツール集：計算ロジック（画面から独立した純粋な関数）
 * 運営：株式会社256
 * 税額は目安。根拠：所得税の速算表、復興特別所得税2.1%、国税庁「減価償却資産の償却率等表」など
 */
const Calc = (() => {
  // 小数の誤差（例：255000*1.021 が 260354.99999…になる）で1円ずれないよう、切り捨ての前にわずかに補正する
  const fl = v => Math.floor(v + 1e-7);
  const floorTo = (v, unit) => fl(v / unit) * unit;

  // 所得税（復興特別所得税を含まない）：課税所得から速算表で計算
  function incomeTax(taxable) {
    const x = Math.max(0, floorTo(taxable, 1000));
    const table = [
      [1949000, 0.05, 0], [3299000, 0.10, 97500], [6949000, 0.20, 427500],
      [8999000, 0.23, 636000], [17999000, 0.33, 1536000], [39999000, 0.40, 2796000],
      [Infinity, 0.45, 4796000],
    ];
    for (const [limit, rate, ded] of table) {
      if (x <= limit) return Math.max(0, x * rate - ded);
    }
    return 0;
  }

  // 基礎控除（令和8年分・令和9年分。国税庁タックスアンサーNo.1199）。x は合計所得金額
  function basicDeduction(x) {
    if (x <= 4890000) return 1040000;
    if (x <= 6550000) return 670000;
    if (x <= 23500000) return 620000;
    if (x <= 24000000) return 480000;
    if (x <= 24500000) return 320000;
    if (x <= 25000000) return 160000;
    return 0;
  }

  // 復興特別所得税込みの所得税（税額控除 credit を先に差し引く）
  function incomeTaxWithReconstruction(taxable, credit = 0) {
    const base = Math.max(0, incomeTax(taxable) - credit);
    return fl(base * 1.021);
  }

  /* 副業の税金
   * p: { salaryIncome（給与所得控除後の金額）, deductions（所得控除の額の合計額）, withheld（源泉徴収税額）,
   *      housingCredit（住宅借入金等特別控除）, extraDeductions（確定申告で追加する所得控除）,
   *      sideRevenue, sideExpenses, kind（"jigyo-blue65"|"jigyo-blue55"|"jigyo-blue10"|"jigyo-white"|"zatsu"）,
   *      sideWithheld（副業で源泉徴収された税額）, oneEmployer, yearEndAdjusted, salaryRevenue }
   */
  function sideJob(p) {
    const profitBefore = p.sideRevenue - p.sideExpenses;            // 青色控除前の所得
    const blueLimit = { "jigyo-blue65": 650000, "jigyo-blue55": 550000, "jigyo-blue10": 100000 }[p.kind] || 0;
    const blue = profitBefore > 0 ? Math.min(profitBefore, blueLimit) : 0;
    const profit = profitBefore - blue;                              // 副業の所得
    const isZatsu = p.kind === "zatsu";
    const combined = (profit < 0 && isZatsu) ? 0 : profit;           // 給与と合算する所得
    const taxableBase = Math.max(0, floorTo(p.salaryIncome - p.deductions, 1000));
    const taxBase = incomeTaxWithReconstruction(taxableBase, p.housingCredit);
    // 副業で合計所得が増えると基礎控除が下がることがある（源泉徴収票の所得控除は給与だけの基礎控除で計算済み）
    const basicSalary = basicDeduction(Math.max(0, p.salaryIncome));
    const basicWith = basicDeduction(Math.max(0, p.salaryIncome + combined));
    const deductionsWith = p.deductions - basicSalary + basicWith;
    const taxableWith = Math.max(0, floorTo(p.salaryIncome + combined - deductionsWith - p.extraDeductions, 1000));
    const taxWith = incomeTaxWithReconstruction(taxableWith, p.housingCredit);
    const alreadyPaid = p.withheld + p.sideWithheld;
    const diff = taxWith - alreadyPaid;
    const settle = diff >= 0 ? floorTo(diff, 100) : diff;            // 納付は100円未満切り捨て
    const residentTax = Math.round(combined * 0.1 / 100) * 100;      // 住民税の増減（概算）
    const increase = (taxWith - taxBase) + residentTax;

    let judge;
    if (!p.oneEmployer || !p.yearEndAdjusted || p.salaryRevenue > 20000000) {
      judge = "給与の条件（2か所以上から給与・年末調整なし・年収2,000万円超）により、確定申告が必要な場合があります。";
    } else if (profit < 0) {
      judge = isZatsu
        ? "副業が赤字です。雑所得の赤字は給与と差し引きできません（確定申告は原則不要。住民税の申告は必要です）。"
        : "副業（事業所得）が赤字です。確定申告すると給与と差し引きでき、税金が戻る可能性があります。";
    } else if (profitBefore <= 200000) {
      judge = "副業の所得が20万円以下のため、所得税の確定申告は原則不要です。ただし住民税の申告は必要です。"
        + (p.sideWithheld > 0 ? "（副業で源泉徴収された税金は、確定申告すると戻る可能性があります）" : "");
    } else {
      judge = "副業の所得（青色申告特別控除の前）が20万円を超えるため、確定申告が必要です。"
        + (blue > 0 ? "青色申告特別控除は、期限内に申告して初めて受けられます。" : "");
    }
    return { profitBefore, blue, profit, combined, basicSalary, basicWith, taxableBase, taxBase, taxableWith, taxWith,
             alreadyPaid, settle, residentTax, increase, takeHome: profitBefore - increase, judge,
             checkOk: p.withheld > 0 ? Math.abs(taxBase - p.withheld) < 100 : null };
  }

  // 定額法の償却率（国税庁「減価償却資産の償却率等表」平成19年4月1日以後取得分）
  const TEIGAKU = {2:.500,3:.334,4:.250,5:.200,6:.167,7:.143,8:.125,9:.112,10:.100,11:.091,12:.084,13:.077,
    14:.072,15:.067,16:.063,17:.059,18:.056,19:.053,20:.050,21:.048,22:.046,23:.044,24:.042,25:.040,26:.039,
    27:.038,28:.036,29:.035,30:.034,31:.033,32:.032,33:.031,34:.030,35:.029,36:.028,37:.028,38:.027,39:.026,
    40:.025,41:.025,42:.024,43:.024,44:.023,45:.023,46:.022,47:.022,48:.021,49:.021,50:.020};

  /* 減価償却のスケジュール
   * p: { cost, year, month（事業供用の月）, life（耐用年数）, method（"teigaku"|"ikkatsu"|"shogaku"）, ratio（事業割合 0-1） }
   * 返り値: [{ year, months, depreciation, expense, endBalance }]
   */
  function depreciation(p) {
    const rows = [];
    const ratio = p.ratio == null ? 1 : p.ratio;
    if (p.method === "shogaku") {
      rows.push({ year: p.year, months: 13 - p.month, depreciation: p.cost,
                  expense: fl(p.cost * ratio), endBalance: 0 });
      return rows;
    }
    if (p.method === "ikkatsu") {
      let bal = p.cost;
      for (let i = 0; i < 3; i++) {
        const d = i < 2 ? fl(p.cost / 3) : bal;
        bal -= d;
        rows.push({ year: p.year + i, months: 12, depreciation: d, expense: fl(d * ratio), endBalance: bal });
      }
      return rows;
    }
    const rate = TEIGAKU[p.life];
    if (!rate) return rows;
    let bal = p.cost;
    let y = p.year;
    let months = 13 - p.month;
    while (bal > 1 && rows.length < 60) {
      const d = Math.min(fl(p.cost * rate * months / 12), bal - 1);
      bal -= d;
      rows.push({ year: y, months, depreciation: d, expense: fl(d * ratio), endBalance: bal });
      y += 1;
      months = 12;
    }
    return rows;
  }

  // 少額減価償却資産の特例の上限（令和8年4月1日以後の取得は40万円未満）
  function shogakuLimit(year, month) {
    return (year > 2026 || (year === 2026 && month >= 4)) ? 400000 : 300000;
  }

  // BOOTHのサービス利用料（5.6%＋45円／注文、2025年10月28日以降）
  function boothFee(amount, rate = 5.6, fixed = 45) {
    return amount > 0 ? fl(amount * rate / 100) + fixed : 0;
  }

  /* 株の売却益の税金（上場株式等、申告分離課税 20.315%）
   * 所得税15.315%（復興特別所得税含む）、住民税5%。1円未満は切り捨てで概算
   */
  function stockGain(sell, cost, fee) {
    const gain = sell - cost - fee;
    if (gain <= 0) return { gain, incomeTax: 0, residentTax: 0, total: 0 };
    const it = fl(gain * 0.15315);
    const rt = fl(gain * 0.05);
    return { gain, incomeTax: it, residentTax: rt, total: it + rt };
  }

  /* 配当の課税方式の比較（国内上場株式の配当）
   * dividend：年間の配当（税引前）、taxable：配当以外の課税所得（源泉徴収票なら「給与所得控除後の金額−所得控除の額の合計額」）
   * 返り値は配当にかかる税金（所得税＋住民税）の比較
   */
  function dividendCompare(dividend, taxable) {
    const separate = fl(dividend * 0.15315) + fl(dividend * 0.05);
    const total = taxable + dividend;
    const LIMIT = 10000000;
    // 配当控除（所得税10%・住民税2.8%、課税総所得金額等が1,000万円を超える部分は5%・1.4%）
    let low = dividend, high = 0;
    if (total > LIMIT) {
      high = Math.min(dividend, total - LIMIT);
      low = dividend - high;
    }
    const creditIT = low * 0.10 + high * 0.05;
    const creditRT = low * 0.028 + high * 0.014;
    const baseIT = incomeTax(total) - incomeTax(taxable);           // 配当で増える所得税（基準）
    const itAfter = Math.max(0, incomeTax(total) - creditIT) - incomeTax(taxable);
    const generalIT = fl(Math.max(0, itAfter) * 1.021);
    const generalRT = Math.max(0, fl(dividend * 0.10 - creditRT));
    const general = generalIT + generalRT;
    return { separate, general, generalIT, generalRT, creditIT: fl(creditIT), creditRT: fl(creditRT),
             marginalBase: baseIT, better: general < separate ? "総合課税" : "申告分離課税（または申告不要）" };
  }

  /* NISAの枠（2024年からの新NISA）
   * 年間：つみたて投資枠120万円・成長投資枠240万円（合計360万円）
   * 生涯：1,800万円（うち成長投資枠1,200万円）。生涯枠は簿価（買付額）で管理し、売却した分は翌年以降に復活
   */
  function nisa(p) {
    const YEAR_TSUMITATE = 1200000, YEAR_SEICHO = 2400000, LIFE = 18000000, LIFE_SEICHO = 12000000;
    const lifeUsed = Math.max(0, p.lifetimeBookValue);                // 保有分の簿価（売却分を除く）
    const lifeLeft = Math.max(0, LIFE - lifeUsed);
    const seichoLifeLeft = Math.max(0, LIFE_SEICHO - Math.max(0, p.lifetimeSeichoBookValue));
    const tsumitateLeft = Math.max(0, Math.min(YEAR_TSUMITATE - p.yearTsumitate, lifeLeft));
    const seichoLeft = Math.max(0, Math.min(YEAR_SEICHO - p.yearSeicho, lifeLeft, seichoLifeLeft));
    return { tsumitateLeft, seichoLeft, lifeLeft, seichoLifeLeft, yearTotalLeft: Math.min(tsumitateLeft + seichoLeft, lifeLeft) };
  }

  return { incomeTax, incomeTaxWithReconstruction, basicDeduction, sideJob, depreciation, shogakuLimit, boothFee,
           stockGain, dividendCompare, nisa, TEIGAKU };
})();
if (typeof module !== "undefined") module.exports = Calc;
