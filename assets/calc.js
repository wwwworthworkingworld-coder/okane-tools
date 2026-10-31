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

  /* 出産・育児のお金（2026年8月時点の額）
   * 根拠：協会けんぽ（出産手当金・出産育児一時金）、厚生労働省「育児休業等給付の内容と支給申請手続」（2026年8月版、限度額は2027年7月31日まで）、
   * こども家庭庁（児童手当・妊婦のための支援給付）、日本年金機構（国民年金の産前産後免除・育児免除）
   * 日付は "YYYY-MM-DD" の文字列で受け渡す（時差の影響を受けないよう内部はUTC）
   */
  const toDate = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const fromDate = t => t.toISOString().slice(0, 10);
  const addDays = (s, n) => { const t = toDate(s); t.setUTCDate(t.getUTCDate() + n); return fromDate(t); };
  // 月を足す。月末を超えるときはその月の末日にそろえる（1/31の1か月後→2/28）
  function addMonths(s, n) {
    const t = toDate(s), day = t.getUTCDate();
    t.setUTCDate(1); t.setUTCMonth(t.getUTCMonth() + n);
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    t.setUTCDate(Math.min(day, last));
    return fromDate(t);
  }
  const monthEnd = s => { const t = toDate(s); return fromDate(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0))); };
  const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
  const monthIndex = s => { const t = toDate(s); return t.getUTCFullYear() * 12 + t.getUTCMonth(); };

  // 標準報酬月額（健康保険）。[報酬月額の上限（未満）, 標準報酬月額]
  const STD_TABLE = [[63000,58000],[73000,68000],[83000,78000],[93000,88000],[101000,98000],[107000,104000],[114000,110000],
    [122000,118000],[130000,126000],[138000,134000],[146000,142000],[155000,150000],[165000,160000],[175000,170000],
    [185000,180000],[195000,190000],[210000,200000],[230000,220000],[250000,240000],[270000,260000],[290000,280000],
    [310000,300000],[330000,320000],[350000,340000],[370000,360000],[395000,380000],[425000,410000],[455000,440000],
    [485000,470000],[515000,500000],[545000,530000],[575000,560000],[605000,590000],[635000,620000],[665000,650000],
    [695000,680000],[730000,710000],[770000,750000],[810000,790000],[855000,830000],[905000,880000],[955000,930000],
    [1005000,980000],[1055000,1030000],[1115000,1090000],[1175000,1150000],[1235000,1210000],[1295000,1270000],[1355000,1330000]];
  function stdMonthly(pay) {
    for (const [limit, std] of STD_TABLE) if (pay < limit) return std;
    return 1390000;
  }

  // 出産手当金：標準報酬月額÷30（10円未満四捨五入）×2/3（1円未満四捨五入）。産前42日（多胎98日）＋産後56日
  function maternityAllowance(std, children = 1) {
    const daily = Math.round(Math.round(std / 30 / 10) * 10 * 2 / 3);
    const days = (children >= 2 ? 98 : 42) + 56;
    return { daily, days, total: daily * days };
  }

  // 休業開始時賃金日額（月給÷30。上限16,540円・下限3,203円）
  const WAGE_DAILY_MAX = 16540, WAGE_DAILY_MIN = 3203;
  const wageDaily = pay => Math.min(WAGE_DAILY_MAX, Math.max(WAGE_DAILY_MIN, fl(pay / 30)));

  // 育児休業給付（賃金の支払いがない場合）：通算180日まで67%、以降50%。産後パパ育休の日数も同じ67%で通算する
  function childcareLeaveBenefit(pay, days) {
    const d = wageDaily(pay), n = Math.max(0, days);
    return fl(d * Math.min(n, 180) * 0.67) + fl(d * Math.max(0, n - 180) * 0.5);
  }
  // 出生後休業支援給付：最大28日分の13%（本人が14日以上休業したとき）
  const postBirthBenefit = (pay, days) => days >= 14 ? fl(wageDaily(pay) * Math.min(days, 28) * 0.13) : 0;

  // 児童手当（生まれて最初の12か月分）。older：22歳年度末までの上の子の人数（経済的負担があり数えられる子）
  function childAllowanceYear(children, older = 0) {
    let monthly = 0;
    for (let i = 1; i <= children; i++) monthly += older + i >= 3 ? 30000 : 15000;
    return { monthly, year: monthly * 12 };
  }

  // 妊婦のための支援給付：1回目5万円＋2回目（こどもの数×5万円）
  const pregnancySupport = children => 50000 + 50000 * children;

  // 国民年金の免除月数。育児免除は令和8年10月分から
  const KOKUNEN_MONTHLY = 17920;   // 令和8年度
  const IKUJI_START = 2026 * 12 + 9;
  function nenkinMonths(birth, children, role) {
    const b = monthIndex(birth);
    if (role === "mother") {
      const prenatal = children >= 2 ? 6 : 4;
      let ikuji = 0;
      for (let i = 0; i < 9; i++) if (b + 3 + i >= IKUJI_START) ikuji++;
      return { prenatal, ikuji, total: prenatal + ikuji };
    }
    let ikuji = 0;
    for (let i = 0; i < 12; i++) if (b + i >= IKUJI_START) ikuji++;
    return { prenatal: 0, ikuji, total: ikuji };
  }

  // 社会保険料の免除月数：開始月から「終了日の翌日の月」の前月まで。同じ月の中で終わるときは14日以上で1か月
  function socialExemptMonths(start, end) {
    const months = monthIndex(addDays(end, 1)) - monthIndex(start);
    if (months > 0) return months;
    return daysBetween(start, end) + 1 >= 14 ? 1 : 0;
  }
  // 本人負担の社会保険料（1か月の目安）：健康保険9.85%（東京支部・40歳未満）と厚生年金18.3%の折半。厚生年金の標準報酬は65万円まで
  const socialMonthly = std => fl(std * 0.0985 / 2) + fl(Math.min(std, 650000) * 0.183 / 2);

  /* 出産・育児のお金のまとめ
   * p: { work（"employee"|"self"|"officer"|"dependent"）, pay（月給）, due（出産予定日）, children, older,
   *      leaveMonths（産む人の育休：生後何か月まで。0は取らない）, officerUnpaid（役員が産休中の報酬を止める）, kokuhoMonthly（本人の国保料の月額）,
   *      partner（"employee"|"self"|"officer"|"none"）, partnerPay, partnerDays（パートナーの育休の日数） }
   */
  function birthMoney(p) {
    const rows = [];
    const add = (key, name, amount, kind) => rows.push({ key, name, amount, kind });
    const children = Math.max(1, p.children || 1);
    const std = stdMonthly(p.pay);

    add("ichijikin", "出産育児一時金", 500000 * children, "cash");
    add("support", "妊婦のための支援給付", pregnancySupport(children), "cash");
    const ca = childAllowanceYear(children, p.older || 0);
    add("jidou", "児童手当（最初の12か月分）", ca.year, "cash");
    add("local", "自治体の独自の給付", Math.max(0, p.localAmount || 0), "cash");

    const paidMaternity = p.work === "employee" || (p.work === "officer" && p.officerUnpaid);
    const ma = maternityAllowance(std, children);
    add("teate", "出産手当金", paidMaternity ? ma.total : 0, "cash");

    // 産む人の育休：産後56日の翌日から
    const leaveStart = addDays(p.due, 57);
    const leaveEnd = p.leaveMonths > 0 ? addDays(addMonths(p.due, p.leaveMonths), -2) : null;
    const leaveDays = p.work === "employee" && leaveEnd ? Math.max(0, daysBetween(leaveStart, leaveEnd) + 1) : 0;
    add("ikukyu", "育児休業給付金", childcareLeaveBenefit(p.pay, leaveDays), "cash");

    // 出生後休業支援給付：配偶者が14日以上休むか、配偶者が雇用される労働者でないなら本人の分も出る
    const partnerNotEmployee = p.partner !== "employee";
    const partnerDays = p.partner === "employee" ? Math.max(0, p.partnerDays || 0) : 0;
    const selfPost = p.work === "employee" && leaveDays >= 14 && (partnerNotEmployee || partnerDays >= 14)
      ? postBirthBenefit(p.pay, Math.min(leaveDays, 28)) : 0;
    add("post", "出生後休業支援給付金", selfPost, "cash");

    // パートナーの育休（産む人が産後休業中なら配偶者の要件は不要）
    add("partnerIkukyu", "パートナーの育児休業給付", childcareLeaveBenefit(p.partnerPay, partnerDays), "cash");
    add("partnerPost", "パートナーの出生後休業支援給付金", postBirthBenefit(p.partnerPay, partnerDays), "cash");

    // 保険料の免除
    const prenatalStart = addDays(p.due, children >= 2 ? -98 : -42);
    const postnatalEnd = addDays(p.due, 56);
    let social = 0, socialMonths = 0, nenkin = { total: 0 }, kokuho = 0;
    if (p.work === "employee") {
      socialMonths = socialExemptMonths(prenatalStart, leaveDays > 0 ? leaveEnd : postnatalEnd);
      social = socialMonths * socialMonthly(std);
    } else if (p.work === "officer") {
      socialMonths = socialExemptMonths(prenatalStart, postnatalEnd);
      social = socialMonths * socialMonthly(std);
    } else if (p.work === "self") {
      nenkin = nenkinMonths(p.due, children, "mother");
      kokuho = (children >= 2 ? 6 : 4) * Math.max(0, p.kokuhoMonthly || 0);
    }
    add("social", "健康保険・厚生年金の保険料（本人負担分）", social, "saving");
    add("nenkin", "国民年金保険料", nenkin.total * KOKUNEN_MONTHLY, "saving");
    add("kokuho", "国民健康保険料（本人分）", kokuho, "saving");

    let partnerSocial = 0, partnerNenkin = 0;
    if (p.partner === "employee" && partnerDays > 0) {
      partnerSocial = socialExemptMonths(p.due, addDays(p.due, partnerDays - 1)) * socialMonthly(stdMonthly(p.partnerPay));
    } else if (p.partner === "self") {
      partnerNenkin = nenkinMonths(p.due, children, "partner").total * KOKUNEN_MONTHLY;
    }
    add("partnerSocial", "パートナーの健康保険・厚生年金の保険料", partnerSocial, "saving");
    add("partnerNenkin", "パートナーの国民年金保険料", partnerNenkin, "saving");

    const cash = rows.filter(r => r.kind === "cash").reduce((a, r) => a + r.amount, 0);
    const saving = rows.filter(r => r.kind === "saving").reduce((a, r) => a + r.amount, 0);
    return { rows, cash, saving, std, maternity: ma, leaveDays, socialMonths, nenkinMonths: nenkin.total, childMonthly: ca.monthly };
  }

  /* 出産費用の医療費控除
   * p: { birthCost（出産にかかった費用）, ichijikin（出産育児一時金など）, otherCost（ほかの医療費）, totalIncome（総所得金額等）, taxable（課税所得） }
   * 一時金はその給付の目的の医療費までしか差し引かない（余っても他の医療費からは引かない）
   */
  function birthMedicalDeduction(p) {
    const net = Math.max(0, p.birthCost - p.ichijikin) + Math.max(0, p.otherCost);
    const threshold = p.totalIncome < 2000000 ? fl(Math.max(0, p.totalIncome) * 0.05) : 100000;
    const deduction = Math.min(2000000, Math.max(0, net - threshold));
    const taxable = Math.max(0, p.taxable);
    const incomeTaxCut = incomeTaxWithReconstruction(taxable) - incomeTaxWithReconstruction(Math.max(0, taxable - deduction));
    const residentCut = fl(Math.min(deduction, taxable) * 0.1);
    return { net, threshold, deduction, incomeTaxCut, residentCut, total: incomeTaxCut + residentCut };
  }

  /* 手続きの期限（日付）。due：出産予定日、birth：出生日（未定なら予定日で計算） */
  function birthDeadlines(due, birth, children = 1) {
    const b = birth || due;
    const later = b > due ? b : due;
    const prenatal = addDays(due, children >= 2 ? -98 : -42);
    const postnatalEnd = addDays(b, 56);
    const leaveStart = addDays(b, 57);
    const papaFrom = addDays(later, 56);                    // 出生日と予定日の遅い方から8週間を経過する日の翌日
    return {
      nenkinFrom: addMonths(due, -6), supportSecond: addDays(due, -56), prenatal,
      leaveRequest: addMonths(leaveStart, -1), papaRequest: addDays(due, -14),
      fuyo: addDays(b, 5), birthReport: addDays(b, 13), kokuhoChild: addDays(b, 13), jidou: addDays(b, 15),
      postnatalEnd, leaveStart, officerRequest: addMonths(postnatalEnd, 1),
      ikukyuFirst: monthEnd(addDays(addMonths(leaveStart, 4), -1)),
      papaApplyFrom: papaFrom, papaApply: monthEnd(addDays(addMonths(papaFrom, 2), -1)),
      teateLimit: addMonths(prenatal, 24), ichijikinLimit: addMonths(b, 24),
      taxReturn: `${toDate(b).getUTCFullYear() + 1}-03-15`,
    };
  }

  return { incomeTax, incomeTaxWithReconstruction, basicDeduction, sideJob, depreciation, shogakuLimit, boothFee,
           stockGain, dividendCompare, nisa, TEIGAKU,
           addDays, addMonths, monthEnd, daysBetween, stdMonthly, maternityAllowance, wageDaily, childcareLeaveBenefit, postBirthBenefit,
           childAllowanceYear, pregnancySupport, nenkinMonths, socialExemptMonths, socialMonthly, birthMoney, birthMedicalDeduction, birthDeadlines };
})();
if (typeof module !== "undefined") module.exports = Calc;
