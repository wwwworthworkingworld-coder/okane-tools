/* Japan Pocket Helper — app logic. Everything the user types stays on the device.
   The only thing ever sent is an anonymous usage count (which screen / which built-in card), and only when the page
   that hosts the app has loaded Google Analytics (window.gtag). Search words, addresses and personal details are never sent. */
(function () {
  "use strict";
  var D = window.JPH, $app = document.getElementById("app"), $tabs = document.getElementById("tabs"),
    $show = document.getElementById("show"), $toast = document.getElementById("toast");
  var KEY = "jph1";
  var S = { fav: [], places: [], info: {}, rate: "", cur: "USD", theme: "auto", size: "m", diet: { sel: [], allergy: true }, sym: [] };

  // ---------- storage (works without it too)
  function load() {
    try { var o = JSON.parse(localStorage.getItem(KEY) || "{}"); for (var k in o) if (k in S) S[k] = o[k]; } catch (e) { /* private mode */ }
    if (!S.diet || !S.diet.sel) S.diet = { sel: [], allergy: true };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
  function applyLook() {
    var r = document.documentElement;
    if (S.theme === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", S.theme);
    if (S.size === "m") r.removeAttribute("data-size"); else r.setAttribute("data-size", S.size);
  }

  // ---------- helpers
  function h(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function nl(s) { return h(s).replace(/\n/g, "<br>"); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function toast(t) { $toast.textContent = t; $toast.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(function () { $toast.classList.remove("on"); }, 1800); }
  function isFav(id) { return S.fav.indexOf(id) >= 0; }
  function top(title, back) {
    return '<header class="top">' + (back ? '<button class="back" data-act="back" aria-label="Back">‹</button>' : "") + "<h1>" + h(title) + "</h1></header>" +
      '<div class="offline">You are offline — everything here still works.</div>';
  }
  var canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  function speak(text) {
    if (!canSpeak) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text.replace(/[・\n]/g, "。").replace(/（[^）]*）/g, ""));
      u.lang = "ja-JP"; u.rate = 0.9;
      var v = speechSynthesis.getVoices().filter(function (x) { return /^ja/i.test(x.lang); })[0];
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) { toast("Speech is not available on this device"); }
  }

  // ---------- card model: every "show" card is {id, ja, en, ro, q, note}
  var POINT = '<div class="point" aria-label="The other person can answer by pointing"><div><b lang="ja">はい</b><span>Yes</span></div><div><b lang="ja">いいえ</b><span>No</span></div><div><b lang="ja">わかりません</b><span>I don\'t know</span></div></div>';
  function dietCard() {
    var d = D.diet, sel = S.diet.sel, items = [], en = [];
    d.allergens.concat(d.avoid).forEach(function (a) { if (sel.indexOf(a[0]) >= 0) { items.push("・" + a[2]); en.push(a[1]); } });
    if (!items.length) return null;
    var al = S.diet.allergy;
    return {
      id: "diet",
      ja: (al ? "食物アレルギーがあります。\n次のものが少しでも入っていると、体調が悪くなります。" : "食べられないものがあります。\n次のものは食べません。") + "\n" + items.join("\n") +
        "\nこれらが入っていない料理はありますか？\nだしや調味料にも入っていないか、確認をお願いします。",
      en: (al ? "I have food allergies. Even a small amount of these makes me ill: " : "There are things I can't eat. I don't eat: ") + en.join(", ") +
        ". Do you have dishes without these? Please also check the stock and seasonings.",
      q: 1
    };
  }
  function placeCard(p) {
    return { id: "place:" + p.id, ja: "この住所までお願いします。\n" + (p.ja || "") + (p.phone ? "\n電話 " + p.phone : ""), en: "Please take me to this address: " + (p.name || "") };
  }
  function infoCard() {
    var i = S.info || {}, rows = [["名前", i.name], ["国籍", i.country], ["宿泊先", i.hotel], ["緊急連絡先", i.contact], ["アレルギー・持病", i.cond], ["服用中の薬", i.meds], ["血液型", i.blood]]
      .filter(function (r) { return r[1]; });
    if (!rows.length) return null;
    return { id: "info", ja: "私の情報です。\n" + rows.map(function (r) { return r[0] + "：" + r[1]; }).join("\n"), en: "My details (name, nationality, where I'm staying, emergency contact, conditions, medicine, blood type)." };
  }
  function symCard() {
    var list = D.symptoms.filter(function (s, i) { return S.sym.indexOf(i) >= 0; });
    if (!list.length) return null;
    return { id: "sym", ja: "体調が悪いです。次の症状があります。\n" + list.map(function (s) { return "・" + s[2]; }).join("\n"), en: "I feel ill. My symptoms: " + list.map(function (s) { return s[1]; }).join(", ") + "." };
  }
  function findCard(id) {
    if (id === "diet") return dietCard();
    if (id === "info") return infoCard();
    if (id === "sym") return symCard();
    if (id.indexOf("place:") === 0) { var p = byId(S.places, id.slice(6)); return p ? placeCard(p) : null; }
    return byId(D.phrases, id) || byId(D.sos, id);
  }
  function cardHtml(c, starable) {
    return '<div class="pcard"><div class="ja" lang="ja">' + nl(c.ja) + "</div>" + (c.ro ? '<div class="ro">' + h(c.ro) + "</div>" : "") +
      '<div class="en">' + h(c.en) + "</div>" + (c.note ? '<div class="note">' + h(c.note) + "</div>" : "") + (c.q ? POINT : "") + "</div>" +
      '<div class="acts"><button class="btn pri" data-act="show" data-id="' + h(c.id) + '">⤢ Show</button>' +
      (canSpeak ? '<button class="btn" data-act="speak" data-id="' + h(c.id) + '">🔊 Speak</button>' : '<span></span>') +
      (starable ? '<button class="btn" data-act="fav" data-id="' + h(c.id) + '">' + (isFav(c.id) ? "★ Saved" : "☆ Save") + "</button>" : "<span></span>") + "</div>";
  }
  function track(ev, p) { try { if (typeof window.gtag === "function") window.gtag("event", ev, p || {}); } catch (er) { /* counting must never break the app */ } }
  function openShow(c) {
    track("card_show", { card_id: D.phrases.concat(D.sos).some(function (x) { return x.id === c.id; }) ? c.id : "custom" });
    var n = c.ja.replace(/\n/g, "").length, lines = c.ja.split("\n").length;
    var fs = n <= 12 ? "min(13vw,4.2rem)" : n <= 24 ? "min(10vw,3.2rem)" : n <= 45 ? "min(8vw,2.5rem)" : n <= 90 ? "min(6vw,1.9rem)" : n <= 150 ? "min(5vw,1.5rem)" : "min(4.2vw,1.25rem)";
    if (lines > 7 && n > 90) fs = "min(4.4vw,1.3rem)";
    $show.innerHTML = '<div class="stage" data-act="closeshow"><div class="ja" lang="ja" style="font-size:' + fs + '">' + nl(c.ja) + "</div>" +
      '<div class="en">' + h(c.en) + "</div>" + (c.q ? POINT : "") + "</div>" +
      '<div class="bar"><button data-act="flip">⟲ Flip</button>' + (canSpeak ? '<button data-act="speak" data-id="' + h(c.id) + '">🔊 Speak</button>' : "") + '<button data-act="closeshow">✕ Close</button></div>';
    $show.classList.remove("flip"); $show.classList.add("on");
    if (navigator.wakeLock && navigator.wakeLock.request) { navigator.wakeLock.request("screen").then(function (l) { openShow.lock = l; }).catch(function () { /* not allowed: fine */ }); }
  }
  function closeShow() {
    $show.classList.remove("on");
    if (canSpeak) { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
    if (openShow.lock) { try { openShow.lock.release(); } catch (e2) { /* ignore */ } openShow.lock = null; }
  }
  function rowPhrase(p) {
    return '<div class="row"><button class="tx" data-go="#/p/' + h(p.id) + '"><b>' + h(p.en) + '</b><span lang="ja">' + h(p.ja.split("\n")[0]) + "</span></button>" +
      '<button class="star' + (isFav(p.id) ? " on" : "") + '" data-act="fav" data-id="' + h(p.id) + '" aria-label="Save">' + (isFav(p.id) ? "★" : "☆") + "</button></div>";
  }

  // ---------- views
  var V = {};
  V.cards = function () {
    var q = D.phrases.filter(function (p) { return p.quick; });
    return top("Japan Pocket Helper") +
      '<p class="sub" style="margin:0 4px 10px">Pick a situation, then show the screen. No Japanese needed.</p>' +
      '<div class="search"><input id="q" type="search" placeholder="Search: toilet, allergy, taxi…" autocomplete="off" aria-label="Search"></div>' +
      '<div id="results"></div><div id="home">' +
      '<div class="h2">Most used</div><div class="quick">' + q.map(function (p) {
        return '<button class="chip" data-act="show" data-id="' + p.id + '"><b>' + h(p.en) + '</b><span lang="ja">' + h(p.ja) + "</span></button>";
      }).join("") + "</div>" +
      '<div class="h2">Situations</div><div class="grid">' + D.cats.map(function (c) {
        var n = c.special === "diet" ? "Build your card" : D.phrases.filter(function (p) { return p.cat === c.id; }).length + " cards";
        return '<button class="tile" data-go="' + (c.special === "diet" ? "#/diet" : "#/cat/" + c.id) + '"><span class="ic">' + c.icon + "</span><b>" + h(c.name) + '</b><span class="sub">' + n + "</span></button>";
      }).join("") + "</div>" +
      (S.fav.length ? '<div class="h2">Your saved cards</div><div class="list">' + S.fav.slice(0, 4).map(function (id) { var c = byId(D.phrases, id) || byId(D.sos, id); return c ? rowPhrase(c) : ""; }).join("") +
        (S.fav.length > 4 ? '<button class="btn wide" data-go="#/saved">See all saved (' + S.fav.length + ")</button>" : "") + "</div>" : "") +
      "</div>";
  };
  function search(term) {
    var t = term.trim().toLowerCase(), out = [];
    if (t.length < 2) return "";
    D.phrases.concat(D.sos).forEach(function (p) { if ((p.en + " " + p.ja + " " + (p.ro || "") + " " + (p.kw || "")).toLowerCase().indexOf(t) >= 0) out.push(rowPhrase(p)); });
    D.guides.forEach(function (g) {
      if ((g.title + " " + g.lead + " " + g.steps.join(" ") + " " + g.tip).toLowerCase().indexOf(t) >= 0)
        out.push('<button class="row" data-go="#/g/' + g.id + '"><span class="ic">' + g.icon + '</span><span class="tx"><b>' + h(g.title) + "</b><span>How-to</span></span><span class=\"go\">›</span></button>");
    });
    [["#/sos", "🆘", "Emergency numbers & what to do", "emergency police ambulance fire 110 119 hotline earthquake tsunami lost passport stolen hospital doctor embassy help sos"],
     ["#/symptoms", "🩺", "Point to your symptoms", "sick ill symptom fever pain doctor clinic pharmacy medicine"],
     ["#/manners", "🙏", "Manners at a glance", "manners etiquette rude polite tipping tip shoes chopsticks quiet rules do don't"],
     ["#/tools", "💱", "Yen converter", "yen convert currency exchange rate price money calculator"],
     ["#/places", "📍", "My places (hotel address card)", "hotel address place taxi take me save"],
     ["#/myinfo", "🪪", "My details card", "my details name contact blood medical id"]].forEach(function (x) {
      if (x[3].indexOf(t) >= 0 || x[2].toLowerCase().indexOf(t) >= 0)
        out.push('<button class="row" data-go="' + x[0] + '"><span class="ic">' + x[1] + '</span><span class="tx"><b>' + h(x[2]) + '</b><span>Open</span></span><span class="go">›</span></button>');
    });
    if (/allerg|vegan|vegetarian|gluten|halal|diet/.test(t)) out.unshift('<button class="row" data-go="#/diet"><span class="ic">🥗</span><span class="tx"><b>Build a “food I can\'t eat” card</b><span>Allergies, vegetarian, halal, gluten-free</span></span><span class="go">›</span></button>');
    return out.length ? '<div class="h2">' + out.length + " result" + (out.length > 1 ? "s" : "") + '</div><div class="list">' + out.slice(0, 40).join("") + "</div>" : '<p class="empty">Nothing found. Try a simpler word, like “water” or “ticket”.</p>';
  }
  V.cat = function (id) {
    var c = byId(D.cats, id); if (!c) return V.cards();
    var extra = "";
    if (c.special === "places") {
      extra = '<div class="h2">Take me here</div><div class="list">' + (S.places.length ? S.places.map(function (p) {
        return '<button class="row" data-act="show" data-id="place:' + h(p.id) + '"><span class="ic">📍</span><span class="tx"><b>' + h(p.name || "Saved place") + '</b><span lang="ja">' + h(p.ja) + '</span></span><span class="go">⤢</span></button>';
      }).join("") : '<p class="sub" style="margin:0 4px">Save your hotel address in Japanese and get a one-tap card for taxi drivers.</p>') +
        '<button class="btn wide" data-go="#/places">＋ Add or edit places</button></div><div class="h2">Phrases</div>';
    }
    return top(c.icon + " " + c.name, true) + extra + '<div class="list">' + D.phrases.filter(function (p) { return p.cat === id; }).map(rowPhrase).join("") + "</div>";
  };
  V.p = function (id) {
    var c = findCard(id); if (!c) return V.cards();
    return top("Show this card", true) + cardHtml(c, !!(byId(D.phrases, id) || byId(D.sos, id))) +
      '<p class="sub" style="margin:14px 4px 0">Tap <b>Show</b> for a full-screen card. <b>Flip</b> turns it upside down for someone facing you.</p>';
  };
  V.diet = function () {
    var d = D.diet, c = dietCard();
    function boxes(list) {
      return '<div class="checks">' + list.map(function (a) {
        var on = S.diet.sel.indexOf(a[0]) >= 0;
        return '<button class="check' + (on ? " on" : "") + '" data-act="diet" data-id="' + a[0] + '" aria-pressed="' + on + '"><i>' + (on ? "✓" : "") + "</i>" + h(a[1]) + "</button>";
      }).join("") + "</div>";
    }
    return top("🥗 Food I can't eat", true) +
      '<p class="sub" style="margin:0 4px 10px">Tick what applies. The card below is written for restaurant staff.</p>' +
      '<div class="seg"><button data-act="allergy" data-v="1" class="' + (S.diet.allergy ? "on" : "") + '">Allergy — even traces</button><button data-act="allergy" data-v="0" class="' + (!S.diet.allergy ? "on" : "") + '">I choose not to eat</button></div>' +
      '<div class="h2">Allergens</div>' + boxes(d.allergens) + '<div class="h2">I don\'t eat</div>' + boxes(d.avoid) +
      '<div class="h2">Your card</div>' + (c ? cardHtml(c, false) : '<p class="empty">Tick at least one item to build your card.</p>') +
      '<div class="tip"><b>Good to know:</b> fish stock (dashi), soy sauce (contains wheat) and pork extract are in many dishes that look safe. Staff may need to ask the kitchen — give them a moment. A small restaurant may honestly say it can\'t help; that is them keeping you safe.</div>';
  };
  V.places = function () {
    return top("📍 My places", true) +
      '<p class="sub" style="margin:0 4px 6px">Paste the address in Japanese from your booking email or Google Maps. It stays on this phone only.</p>' +
      '<div class="list">' + S.places.map(function (p) {
        return '<div class="row"><button class="tx" data-act="show" data-id="place:' + h(p.id) + '"><b>' + h(p.name || "Saved place") + '</b><span lang="ja">' + h(p.ja) + '</span></button><button class="star" data-act="delplace" data-id="' + h(p.id) + '" aria-label="Delete">🗑</button></div>';
      }).join("") + "</div>" +
      '<label class="f" for="pn">Name (for you)</label><input id="pn" placeholder="Hotel Gracery Shinjuku" autocomplete="off">' +
      '<label class="f" for="pj">Address in Japanese</label><textarea id="pj" rows="2" lang="ja" placeholder="東京都新宿区歌舞伎町1-19-1"></textarea>' +
      '<label class="f" for="pp">Phone (optional)</label><input id="pp" inputmode="tel" placeholder="03-1234-5678" autocomplete="off">' +
      '<div style="margin-top:12px"><button class="btn navy wide" data-act="addplace">＋ Save place</button></div>';
  };
  V.howto = function () {
    return top("How do I…?") + '<div class="list">' + D.guides.map(function (g) {
      return '<button class="row" data-go="#/g/' + g.id + '"><span class="ic">' + g.icon + '</span><span class="tx"><b>' + h(g.title) + "</b><span>" + h(g.lead) + '</span></span><span class="go">›</span></button>';
    }).join("") + "</div>";
  };
  V.g = function (id) {
    var g = byId(D.guides, id); if (!g) return V.howto();
    var cards = (g.cards || []).map(function (cid) { return byId(D.phrases, cid); }).filter(Boolean);
    return top(g.icon + " " + g.title, true) + '<div class="lead">' + h(g.lead) + '</div><ol class="steps">' + g.steps.map(function (s) { return "<li>" + h(s) + "</li>"; }).join("") + "</ol>" +
      '<div class="tip"><b>Tip:</b> ' + h(g.tip) + "</div>" +
      (cards.length ? '<div class="h2">Cards for this</div><div class="list">' + cards.map(rowPhrase).join("") + "</div>" : "");
  };
  V.manners = function () {
    return top("Manners at a glance") + '<p class="sub" style="margin:0 4px 10px">Nobody expects visitors to be perfect. These few things are noticed and appreciated.</p>' +
      D.manners.map(function (m, i) {
        return '<details class="acc"' + (i === 0 ? " open" : "") + "><summary><span>" + m.icon + "</span>" + h(m.title) + '</summary><div class="in dd">' +
          '<div class="box do"><h4>✓ Do</h4><ul>' + m.dos.map(function (x) { return "<li>" + h(x) + "</li>"; }).join("") + "</ul></div>" +
          '<div class="box dont"><h4>✗ Don\'t</h4><ul>' + m.donts.map(function (x) { return "<li>" + h(x) + "</li>"; }).join("") + "</ul></div></div></details>";
      }).join("");
  };
  V.sos = function () {
    var ic = infoCard();
    return top("If something goes wrong") +
      '<a class="call" href="tel:110"><b>110</b><span><strong>Police</strong><br>Crime, accident, theft. Free, 24 hours.</span></a>' +
      '<a class="call" href="tel:119"><b>119</b><span><strong>Ambulance / Fire</strong><br>Say “Kyūkyū desu” (ambulance) or “Kaji desu” (fire). Free.</span></a>' +
      '<a class="call alt" href="tel:+815038162787"><b>☎</b><span><strong>Japan Visitor Hotline — 050-3816-2787</strong><br>Run by JNTO. English, Chinese, Korean. 24 hours, every day.</span></a>' +
      '<div class="h2">Say it with a card</div><div class="list">' + D.sos.map(rowPhrase).join("") + "</div>" +
      '<div class="h2">At a clinic or pharmacy</div><div class="list">' +
      '<button class="row" data-go="#/symptoms"><span class="ic">🩺</span><span class="tx"><b>Point to your symptoms</b><span>Makes a card for the doctor or pharmacist</span></span><span class="go">›</span></button>' +
      (ic ? '<button class="row" data-act="show" data-id="info"><span class="ic">🪪</span><span class="tx"><b>Show my details</b><span>Name, hotel, emergency contact, conditions</span></span><span class="go">⤢</span></button>'
        : '<button class="row" data-go="#/myinfo"><span class="ic">🪪</span><span class="tx"><b>Add my details</b><span>So helpers can read them in Japanese</span></span><span class="go">›</span></button>') + "</div>" +
      '<div class="h2">Earthquake</div><ol class="steps"><li>Drop, get under a table, hold on. Stay away from windows and shelves.</li><li>Outside: move away from buildings, walls and vending machines.</li><li>When the shaking stops, follow staff. Hotels and stations rehearse this.</li><li>Near the sea and the shaking was strong or long? Go to high ground at once — don\'t wait for a warning.</li><li>Don\'t use lifts. Phone lines get busy: text instead of calling.</li></ol>' +
      '<div class="tip"><b>Tip:</b> the free “Safety tips” app from the Japan Tourism Agency sends earthquake and tsunami alerts in English.</div>' +
      '<div class="h2">Lost something</div><ol class="steps"><li>On a train or in a station: go to the station office. Items are kept and logged carefully.</li><li>In a taxi: the receipt has the company\'s phone number. Ask your hotel to call.</li><li>Anywhere else: the nearest police box (kōban, 交番). Lost property is very often handed in.</li><li>Passport lost: get a police report at the kōban, then contact your embassy.</li></ol>';
  };
  V.symptoms = function () {
    var c = symCard();
    return top("🩺 My symptoms", true) + '<p class="sub" style="margin:0 4px 10px">Tap everything that applies.</p><div class="sym">' + D.symptoms.map(function (s, i) {
      var on = S.sym.indexOf(i) >= 0;
      return '<button class="' + (on ? "on" : "") + '" data-act="sym" data-id="' + i + '" aria-pressed="' + on + '"><span class="e">' + s[0] + '</span><span class="t">' + h(s[1]) + "</span></button>";
    }).join("") + '</div><div class="h2">Your card</div>' + (c ? cardHtml(c, false) : '<p class="empty">Tap a symptom to build your card.</p>') +
      '<div class="tip"><b>Emergency?</b> Call 119 for an ambulance. For advice in English, call the Japan Visitor Hotline: 050-3816-2787.</div>';
  };
  V.me = function () {
    return top("Me") + '<div class="list">' +
      '<button class="row" data-go="#/saved"><span class="ic">★</span><span class="tx"><b>Saved cards</b><span>' + S.fav.length + ' saved</span></span><span class="go">›</span></button>' +
      '<button class="row" data-go="#/places"><span class="ic">📍</span><span class="tx"><b>My places</b><span>Hotel and other addresses in Japanese</span></span><span class="go">›</span></button>' +
      '<button class="row" data-go="#/myinfo"><span class="ic">🪪</span><span class="tx"><b>My details</b><span>For emergencies — kept on this phone only</span></span><span class="go">›</span></button>' +
      '<button class="row" data-go="#/tools"><span class="ic">💱</span><span class="tx"><b>Yen converter</b><span>With your own exchange rate</span></span><span class="go">›</span></button>' +
      '<button class="row" data-go="#/settings"><span class="ic">⚙️</span><span class="tx"><b>Display</b><span>Text size, light or dark</span></span><span class="go">›</span></button>' +
      '<button class="row" data-go="#/about"><span class="ic">ℹ️</span><span class="tx"><b>About & offline use</b><span>Facts checked ' + h(D.checked) + '</span></span><span class="go">›</span></button></div>';
  };
  V.saved = function () {
    var list = S.fav.map(function (id) { return byId(D.phrases, id) || byId(D.sos, id); }).filter(Boolean);
    return top("★ Saved cards", true) + (list.length ? '<div class="list">' + list.map(rowPhrase).join("") + "</div>" : '<p class="empty">Nothing saved yet.<br>Tap ☆ on any card to keep it here.</p>');
  };
  V.myinfo = function () {
    var i = S.info || {}, f = [["name", "Name"], ["country", "Nationality"], ["hotel", "Where I'm staying"], ["contact", "Emergency contact (name, phone)"], ["cond", "Allergies / conditions"], ["meds", "Medicine I take"], ["blood", "Blood type"]];
    return top("🪪 My details", true) + '<p class="sub" style="margin:0 4px 4px">Shown with Japanese labels so helpers can read it. Stored on this phone only — never sent anywhere.</p>' +
      f.map(function (x) { return '<label class="f" for="i_' + x[0] + '">' + x[1] + '</label><input id="i_' + x[0] + '" data-info="' + x[0] + '" value="' + h(i[x[0]] || "") + '" autocomplete="off">'; }).join("") +
      '<div style="margin-top:14px;display:grid;gap:10px"><button class="btn pri wide" data-act="show" data-id="info">⤢ Show my details</button></div>';
  };
  V.tools = function () {
    var r = parseFloat(S.rate) || 0;
    function row(y) { return "<div><span>¥" + y.toLocaleString("en-US") + "</span><b>" + (r ? (y / r).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " " + h(S.cur) : "—") + "</b></div>"; }
    return top("💱 Yen converter", true) +
      '<label class="f" for="cur">Your currency</label><input id="cur" value="' + h(S.cur) + '" maxlength="6" autocomplete="off" autocapitalize="characters">' +
      '<label class="f" for="rate">Yen for 1 ' + h(S.cur || "unit") + " (type today's rate)</label>" + '<input id="rate" inputmode="decimal" value="' + h(S.rate) + '" placeholder="e.g. 150">' +
      '<label class="f" for="yen">Price in yen</label><input id="yen" inputmode="decimal" placeholder="e.g. 2,480">' +
      '<div class="pcard" style="text-align:center"><div class="sub">is about</div><div class="big" id="conv">—</div></div>' +
      '<div class="h2">Quick table</div><div class="kv" id="qt">' + [100, 500, 1000, 3000, 5000, 10000, 30000].map(row).join("") + "</div>" +
      '<div class="tip"><b>Good to know:</b> prices in shops usually include the 10% tax (8% for take-away food). No tipping, ever.</div>';
  };
  V.settings = function () {
    function seg(key, opts, three) { return '<div class="seg' + (three ? " three" : "") + '">' + opts.map(function (o) { return '<button data-act="set" data-k="' + key + '" data-v="' + o[0] + '" class="' + (S[key] === o[0] ? "on" : "") + '">' + o[1] + "</button>"; }).join("") + "</div>"; }
    return top("⚙️ Display", true) + '<label class="f">Text size</label>' + seg("size", [["m", "Normal"], ["l", "Large"], ["xl", "Larger"]], true) +
      '<label class="f">Appearance</label>' + seg("theme", [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]], true) +
      '<div style="margin-top:22px"><button class="btn danger wide" data-act="reset">Erase everything I saved on this phone</button></div>';
  };
  V.about = function () {
    return top("ℹ️ About", true) +
      '<div class="lead"><b>Works offline.</b> After the first visit everything is stored on your phone. Add it to your home screen: in Safari tap Share → “Add to Home Screen”; in Chrome tap ⋮ → “Add to Home screen”.</div>' +
      '<div class="kv"><div><span>Facts checked</span><b>' + h(D.checked) + "</b></div><div><span>Cards</span><b>" + (D.phrases.length + D.sos.length) + "</b></div><div><span>How-tos</span><b>" + D.guides.length + "</b></div><div><span>Your data</span><b>Stays on this phone</b></div></div>" +
      '<div class="h2">Please note</div><p style="margin:0 4px">This is a pocket helper, not medical, legal or official advice. Rules, numbers and services change — when it matters, check the official source or ask staff. In an emergency call 110 (police) or 119 (ambulance, fire).</p>' +
      '<p class="sub" style="margin:14px 4px 0">It does not replace your map, train-route or translation app — it covers what those don\'t.</p>' +
      '<div class="h2">Privacy</div><p style="margin:0 4px">What you type or save here (addresses, your details, saved cards) stays on this phone and is never sent to us.' +
      (typeof window.gtag === "function" ? " This website counts visits and which cards are opened, anonymously (Google Analytics), so we can improve the cards. Your search words are not sent." : "") + "</p>" +
      '<div class="h2">Still planning the trip?</div><p style="margin:0 4px">Our <a href="https://www.etsy.com/listing/4615651135" target="_blank" rel="noopener" data-track="planner">Japan Travel Planner</a> (Excel / Google Sheets) plans the days, compares the JR Pass with single tickets and keeps your yen budget.</p>' +
      '<p class="sub" style="margin:14px 4px 0">Made in Japan by 256 Co., Ltd.</p>';
  };

  // ---------- router
  var TABS = [["cards", "🗣", "Cards"], ["howto", "📖", "How-to"], ["manners", "🙏", "Manners"], ["sos", "🆘", "SOS"], ["me", "⭐", "Me"]];
  var TAB_OF = { cat: "cards", p: "cards", diet: "cards", places: "cards", g: "howto", symptoms: "sos", saved: "me", myinfo: "me", tools: "me", settings: "me", about: "me" };
  function route() {
    var m = (location.hash || "#/cards").replace(/^#\//, "").split("/"), name = m[0] || "cards", arg = decodeURIComponent(m.slice(1).join("/") || "");
    if (!V[name]) name = "cards";
    var keep = window.scrollY, same = route.last === location.hash, cur = location.hash || "#/cards";
    if (route.last && !same) route.pos[route.last] = keep;
    var isBack = !same && route.stack.length > 1 && route.stack[route.stack.length - 2] === cur;
    if (isBack) route.stack.pop(); else if (!same) route.stack.push(cur);
    $app.innerHTML = V[name](arg);
    var tab = TAB_OF[name] || name;
    $tabs.innerHTML = TABS.map(function (t) { return '<button data-go="#/' + t[0] + '" class="' + (t[0] === tab ? "on" : "") + '"' + (t[0] === tab ? ' aria-current="page"' : "") + '><span class="ic">' + t[1] + "</span>" + t[2] + "</button>"; }).join("");
    window.scrollTo(0, same ? keep : isBack ? (route.pos[cur] || 0) : 0);
    if (!same) track("screen_open", { screen: name, item: (name === "cat" || name === "g" || name === "p") ? arg : "" });
    route.last = cur;
    document.title = (name === "cards" ? "" : ($app.querySelector("h1") || {}).textContent + " — ") + "Japan Pocket Helper";
  }
  route.pos = {}; route.stack = [];
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

  // 取り消せない操作は「もう一度押す」で確かめる（confirm() は埋め込み先によっては出ないため使わない）
  function twice(key, msg) {
    var now = Date.now();
    if (twice.key === key && now - twice.at < 4000) { twice.key = null; return true; }
    twice.key = key; twice.at = now; toast(msg); return false;
  }

  // ---------- events
  document.addEventListener("click", function (e) {
    var tk = e.target.closest("[data-track]"); if (tk) { track("link_click", { link: tk.dataset.track }); return; }
    var t = e.target.closest("[data-go],[data-act]"); if (!t) return;
    if (t.dataset.go) { go(t.dataset.go); return; }
    var a = t.dataset.act, id = t.dataset.id, c;
    if (a === "back") { if (history.length > 1) history.back(); else go("#/cards"); }
    else if (a === "show") { c = findCard(id); if (c) openShow(c); else if (id === "info") go("#/myinfo"); }
    else if (a === "closeshow") { closeShow(); }
    else if (a === "flip") { $show.classList.toggle("flip"); }
    else if (a === "speak") { c = findCard(id); if (c) speak(c.ja); }
    else if (a === "fav") { var i = S.fav.indexOf(id); if (i >= 0) S.fav.splice(i, 1); else S.fav.unshift(id); save(); toast(i >= 0 ? "Removed from saved" : "Saved — find it under Me"); route(); }
    else if (a === "diet") { var j = S.diet.sel.indexOf(id); if (j >= 0) S.diet.sel.splice(j, 1); else S.diet.sel.push(id); save(); route(); }
    else if (a === "allergy") { S.diet.allergy = t.dataset.v === "1"; save(); route(); }
    else if (a === "sym") { var n = +id, k = S.sym.indexOf(n); if (k >= 0) S.sym.splice(k, 1); else S.sym.push(n); save(); route(); }
    else if (a === "addplace") {
      var ja = document.getElementById("pj").value.trim(), nm = document.getElementById("pn").value.trim();
      if (!ja) { toast("Paste the address in Japanese first"); document.getElementById("pj").focus(); return; }
      S.places.push({ id: String(Date.now()), name: nm, ja: ja, phone: document.getElementById("pp").value.trim() }); save(); toast("Place saved"); route();
    }
    else if (a === "delplace") { if (twice("del" + id, "Tap 🗑 again to delete this place")) { S.places = S.places.filter(function (p) { return p.id !== id; }); save(); toast("Deleted"); route(); } }
    else if (a === "set") { S[t.dataset.k] = t.dataset.v; save(); applyLook(); route(); }
    else if (a === "reset") { if (twice("reset", "Tap again to erase saved cards, places and details")) { try { localStorage.removeItem(KEY); } catch (er) { /* ignore */ } S = { fav: [], places: [], info: {}, rate: "", cur: "USD", theme: "auto", size: "m", diet: { sel: [], allergy: true }, sym: [] }; applyLook(); toast("Erased"); go("#/me"); } }
  });
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.id === "q") { var r = search(t.value); document.getElementById("results").innerHTML = r; document.getElementById("home").style.display = r ? "none" : ""; }
    else if (t.dataset.info) { S.info[t.dataset.info] = t.value; save(); }
    else if (t.id === "rate" || t.id === "cur" || t.id === "yen") {
      if (t.id === "rate") S.rate = t.value.replace(/[^0-9.]/g, "");
      if (t.id === "cur") S.cur = t.value.toUpperCase().slice(0, 6);
      save();
      var r2 = parseFloat(S.rate) || 0, y = parseFloat((document.getElementById("yen").value || "").replace(/[^0-9.]/g, "")) || 0;
      document.getElementById("conv").textContent = r2 && y ? (y / r2).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " " + S.cur : "—";
      document.getElementById("qt").innerHTML = [100, 500, 1000, 3000, 5000, 10000, 30000].map(function (v) { return "<div><span>¥" + v.toLocaleString("en-US") + "</span><b>" + (r2 ? (v / r2).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " " + h(S.cur) : "—") + "</b></div>"; }).join("");
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && $show.classList.contains("on")) { closeShow(); } });
  window.addEventListener("hashchange", function () { if ($show.classList.contains("on")) closeShow(); route(); });
  function net() { document.body.classList.toggle("off", navigator.onLine === false); }
  window.addEventListener("online", net); window.addEventListener("offline", net);

  // ---------- start
  load(); applyLook(); net(); route();
  if (canSpeak) { try { speechSynthesis.getVoices(); } catch (e) { /* ignore */ } }
  if ("serviceWorker" in navigator && location.protocol !== "file:") { navigator.serviceWorker.register("sw.js").catch(function () { /* offline cache is optional */ }); }
})();
