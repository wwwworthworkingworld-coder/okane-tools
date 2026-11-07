/* ふるさと納税の控除上限（目安）の計算。画面から独立した純粋な関数
 * 運営：株式会社256
 * 根拠（2026-11-07 確認）：
 *   総務省 ふるさと納税ポータルサイト「税金の控除について」
 *     (1) 所得税からの控除 ＝（ふるさと納税額－2,000円）×所得税率（令和19年まで復興特別所得税を加えた率）。対象は総所得金額等の40%まで
 *     (2) 住民税からの控除（基本分）＝（ふるさと納税額－2,000円）×10%。対象は総所得金額等の30%まで
 *     (3) 住民税からの控除（特例分）＝（ふるさと納税額－2,000円）×（100%－10%－所得税率）。住民税所得割額の20%が上限
 *         ここでの所得税率は「住民税の課税総所得金額－人的控除差調整額」で求めた率
 *   → 全額控除される上限 ＝ 住民税所得割額×20% ÷（90%－所得税率×1.021）＋2,000円
 *   国税庁 No.1410 給与所得控除、No.1199 基礎控除、No.1180 扶養控除、No.1191 配偶者控除
 * calc.js（Calc.salaryIncome・Calc.incomeTax・Calc.basicDeduction 相当）に依存
 */
const Furusato = (() => {
  const fl = v => Math.floor(v + 1e-7);
  const floorTo = (v, unit) => fl(v / unit) * unit;

  // 所得税の速算表の税率（課税所得から）
  function taxRate(taxable) {
    const x = Math.max(0, taxable);
    if (x <= 1949000) return 0.05;
    if (x <= 3299000) return 0.10;
    if (x <= 6949000) return 0.20;
    if (x <= 8999000) return 0.23;
    if (x <= 17999000) return 0.33;
    if (x <= 39999000) return 0.40;
    return 0.45;
  }

  // 基礎控除（所得税・令和8年分。国税庁 No.1199）
  function basicIT(x) {
    if (x <= 4890000) return 1040000;
    if (x <= 6550000) return 670000;
    if (x <= 23500000) return 620000;
    if (x <= 24000000) return 480000;
    if (x <= 24500000) return 320000;
    if (x <= 25000000) return 160000;
    return 0;
  }
  // 基礎控除（住民税）
  function basicRT(x) {
    if (x <= 24000000) return 430000;
    if (x <= 24500000) return 290000;
    if (x <= 25000000) return 150000;
    return 0;
  }

  /* p:
   *   salary          給与収入（源泉徴収票の「支払金額」）
   *   salaryIncome    給与所得（「給与所得控除後の金額」。0なら salary から計算）
   *   social          社会保険料等の金額（null/undefined なら給与の15%で概算）
   *   spouse          "none" | "kojo"（配偶者控除38万）| "tokubetsu"（配偶者特別控除。額は spouseTokubetsu）
   *   spouseTokubetsu 配偶者特別控除の額（所得税）。省略時38万
   *   depGeneral      一般の扶養親族の人数（16〜18歳、23〜69歳）
   *   depSpecific     特定扶養親族の人数（19〜22歳）
   *   depElderly      老人扶養親族の人数（70歳以上）
   *   deductionsTotal 源泉徴収票の「所得控除の額の合計額」（0なら上の項目から計算）
   *   medical         医療費控除の額（確定申告で使う分。所得控除合計に入っていない追加分）
   *   otherDeductions その他の所得控除（小規模企業共済等掛金、生命保険料など。合計額を入れたときは0）
   *   loanCredit      住宅借入金等特別控除の額（年間）
   *   otherIncome     給与以外の所得（事業・雑など。目安）
   */
  function limit(p) {
    const salary = Math.max(0, p.salary || 0);
    const salaryIncome = p.salaryIncome > 0 ? p.salaryIncome : Calc.salaryIncome(salary, "r8");
    const otherIncome = Math.max(0, p.otherIncome || 0);
    const total = salaryIncome + otherIncome;                       // 合計所得金額（≒総所得金額等）
    const social = p.social == null || p.social === "" ? fl(salary * 0.15) : Math.max(0, Number(p.social) || 0);
    const socialEstimated = p.social == null || p.social === "";

    // 人的控除（所得税・住民税）と、その差（調整控除で使う法定の差額）
    const spouseIT = p.spouse === "kojo" ? 380000 : p.spouse === "tokubetsu" ? (p.spouseTokubetsu || 380000) : 0;
    const spouseRT = p.spouse === "kojo" ? 330000 : p.spouse === "tokubetsu" ? Math.min(330000, spouseIT) : 0;
    const spouseDiff = p.spouse === "none" || !p.spouse ? 0 : p.spouse === "kojo" ? 50000 : Math.max(0, Math.min(50000, spouseIT - spouseRT));
    const dg = Math.max(0, p.depGeneral || 0), ds = Math.max(0, p.depSpecific || 0), de = Math.max(0, p.depElderly || 0);
    const depIT = dg * 380000 + ds * 630000 + de * 480000;
    const depRT = dg * 330000 + ds * 450000 + de * 380000;
    const depDiff = dg * 50000 + ds * 180000 + de * 100000;
    const bIT = basicIT(total), bRT = basicRT(total);
    const basicDiff = bIT > 0 ? 50000 : 0;                           // 基礎控除の人的控除差は法定で5万円
    const humanDiff = basicDiff + spouseDiff + depDiff;

    const medical = Math.max(0, p.medical || 0);
    const other = Math.max(0, p.otherDeductions || 0);
    let dedIT, dedRT, usedTotal = false;
    if (p.deductionsTotal > 0) {
      // 源泉徴収票の合計額（所得税ベース）から、住民税は人的控除の差を引く
      dedIT = p.deductionsTotal + medical;
      dedRT = Math.max(0, p.deductionsTotal - (bIT - bRT) - (spouseIT - spouseRT) - (depIT - depRT)) + medical;
      usedTotal = true;
    } else {
      dedIT = social + spouseIT + depIT + bIT + medical + other;
      dedRT = social + spouseRT + depRT + bRT + medical + other;
    }
    const taxableIT = Math.max(0, floorTo(total - dedIT, 1000));
    const taxableRT = Math.max(0, floorTo(total - dedRT, 1000));

    // 所得税（住宅ローン控除の前）
    const incomeTaxBefore = Calc.incomeTax(taxableIT);
    const loan = Math.max(0, p.loanCredit || 0);
    const loanIT = Math.min(loan, incomeTaxBefore);
    // 住民税の住宅ローン控除：所得税から引けなかった分（上限：所得税の課税所得×5%、97,500円）
    const loanRT = Math.min(Math.max(0, loan - loanIT), Math.min(fl(taxableIT * 0.05), 97500));

    // 住民税の調整控除
    let adjust;
    if (taxableRT <= 2000000) adjust = fl(Math.min(humanDiff, taxableRT) * 0.05);
    else adjust = fl(Math.max(humanDiff - (taxableRT - 2000000), 50000) * 0.05);
    if (total > 25000000) adjust = 0;
    const shotokuwari = Math.max(0, fl(taxableRT * 0.10) - adjust - loanRT);

    // 特例分で使う所得税率（住民税の課税総所得－人的控除差調整額）
    const rate = taxableRT === 0 ? 0 : taxRate(taxableRT - humanDiff);
    const rateWithRecon = rate * 1.021;
    const itRate = taxRate(taxableIT);

    let max = shotokuwari > 0 ? fl(shotokuwari * 0.20 / (0.90 - rateWithRecon)) + 2000 : 0;
    // 寄附金控除の対象は総所得金額等の40%（所得税）・30%（住民税）まで
    const cap = fl(total * 0.30);
    const capped = max > cap;
    if (capped) max = cap;
    if (taxableRT === 0) max = 0;

    // 内訳（上限いっぱい寄附したとき）
    const base = Math.max(0, max - 2000);
    const dIT = fl(base * itRate * 1.021);
    const dRTbasic = fl(base * 0.10);
    const dRTspecial = Math.min(fl(base * (0.90 - rateWithRecon)), fl(shotokuwari * 0.20));

    return { max, salaryIncome, total, social, socialEstimated, taxableIT, taxableRT, shotokuwari, adjust, rate, itRate,
      incomeTaxBefore, loanIT, loanRT, humanDiff, dedIT, dedRT, usedTotal, capped,
      breakdown: { incomeTax: dIT, residentBasic: dRTbasic, residentSpecial: dRTspecial } };
  }

  // 1,000円単位に切り捨てた「安全な目安」
  const safe = max => Math.max(0, floorTo(max, 1000));

  return { limit, safe, taxRate };
})();

if (typeof module !== "undefined") module.exports = Furusato;
