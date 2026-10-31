// ひとり法人の年間カレンダー：期限の計算（Excel版と同じ規則）
(function (root) {
  const YEAR = 2027;
  const HOL = ["2027-01-01", "2027-01-11", "2027-02-11", "2027-02-23", "2027-03-21", "2027-03-22", "2027-04-29",
    "2027-05-03", "2027-05-04", "2027-05-05", "2027-07-19", "2027-08-11", "2027-09-20", "2027-09-23",
    "2027-10-11", "2027-11-03", "2027-11-23"];
  const YE = ["2027-01-02", "2027-01-03", "2027-12-29", "2027-12-30", "2027-12-31", "2028-01-01", "2028-01-02", "2028-01-03"];
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const shift = (d, offs) => {
    const x = new Date(d);
    while (x.getDay() === 0 || x.getDay() === 6 || offs.includes(iso(x))) x.setDate(x.getDate() + 1);
    return x;
  };
  const tx = (d) => shift(d, HOL.concat(YE));
  const sha = (d) => shift(d, HOL);
  const monthEnd = (y, m) => new Date(y, m, 0); // mは1始まり。13以上は翌年へ繰り上がる
  const ym = (m) => ((m - 1) % 12) + 1;

  function calc(kind, m, gen, jumin, sho) {
    const fy = m >= 11 ? YEAR - 1 : YEAR;
    const label = `${fy}年${m}月決算`;
    const filing = tx(monthEnd(fy, m + 2));
    const mid = tx(monthEnd(YEAR, ym(m + 8)));
    const rows = [];
    const add = (date, text, to) => rows.push({ date, text, to });
    if (gen === "納期の特例") add(tx(new Date(YEAR, 0, 20)), "源泉所得税を納める（前年7〜12月に払った分）", "税務署");
    add(tx(new Date(YEAR, 0, 31)), "法定調書合計表（役員報酬や士業への報酬を払った分）", "税務署");
    add(tx(new Date(YEAR, 0, 31)), "給与支払報告書（役員報酬を払った分）", "市区町村");
    add(tx(new Date(YEAR, 0, 31)), "償却資産の申告（パソコンなど対象の資産がある場合）", "市区町村");
    if (jumin === "納期の特例") add(tx(new Date(YEAR, 5, 10)), "住民税を納める（前年12月〜5月分）", "市区町村");
    add(sha(new Date(YEAR, 6, 10)), "算定基礎届（7月1日から提出。日付は年金機構の案内で確認）", "年金事務所");
    if (gen === "納期の特例") add(tx(new Date(YEAR, 6, 10)), "源泉所得税を納める（1〜6月に払った分）", "税務署");
    if (jumin === "納期の特例") add(tx(new Date(YEAR, 11, 10)), "住民税を納める（6〜11月分）", "市区町村");
    add(monthEnd(YEAR, ym(m + 3)), "役員報酬を変えられる原則の期限（期首から3か月を経過する日）", "議事録を保管");
    add(monthEnd(YEAR, ym(m + 4)), "事前確定届出給与の最終期限（役員に賞与を出す場合。決議から1か月が先ならそちら）", "税務署");
    add(filing, kind === "株式会社" ? `定時株主総会で決算を承認（${label}。申告までに）` : `決算を確定する（${label}。申告までに）`, "議事録を保管");
    add(filing, `法人税・住民税・事業税の確定申告と納付（${label}）`, "税務署・都道府県・市区町村");
    if (sho === "納める") add(filing, `消費税の確定申告と納付（${label}）`, "税務署");
    add(mid, "法人税などの中間申告（前期の法人税額が20万円を超える場合。設立1期目は不要）", "税務署・都道府県・市区町村");
    if (sho === "納める") add(mid, "消費税の中間申告（前期の消費税額が48万円を超える場合）", "税務署");
    rows.sort((a, b) => a.date - b.date); // 同じ日は入れた順のまま
    const months = [];
    for (let i = 1; i <= 12; i++) {
      const ten = tx(new Date(YEAR, i - 1, 10));
      months.push({ m: i, gen: gen === "毎月納付" ? ten : null, jumin: jumin === "毎月納付" ? ten : null, sha: sha(monthEnd(YEAR, i)) });
    }
    return { rows, months };
  }

  const WD = "日月火水木金土";
  const fmt = (d) => `${d.getFullYear() > YEAR ? d.getFullYear() + "/" : ""}${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`;
  root.HojinCalendar = { calc, fmt, iso };
  if (typeof module !== "undefined") module.exports = root.HojinCalendar;
})(typeof window !== "undefined" ? window : globalThis);
