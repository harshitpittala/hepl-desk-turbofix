/* Turbofix price bot: understands free-text questions like
   "I watch series 1 42 mm Glass replacement" and finds the matching prices
   in PRICE_DATA. Runs fully in the browser — no server, no API key. */
(function (root) {
  "use strict";

  // ---------- text normalisation ----------

  var ALIASES = [
    // spelling fixes seen in the WhatsApp chat
    [/\bcam(a|e)?ra\b|\bcamra\b|\bcamara\b/g, "camera"],
    [/\borg(i|e)?nal\b|\borigional\b|\borignal\b|\borginal\b/g, "original"],
    [/\bgen(i|u)(u|i)ne\b|\bgeniune\b/g, "genuine"],
    [/\bbat+(e|a)?r+y\b|\bbattry\b|\bbatery\b/g, "battery"],
    [/\bdis?pl?(a|e)y\b|\bdisply\b|\bdiplay\b/g, "display"],
    [/\breplac?e?ment\b|\breplacment\b/g, "replacement"],
    [/\bscreeen\b|\bscren\b/g, "screen"],
    [/\bspeeker\b|\bspekar\b/g, "speaker"],
    [/\bmonther ?bo?a?rd\b|\bmother ?bord\b|\bmother board\b|\blogic ?board\b/g, "motherboard"],
    [/\bexperia\b/g, "xperia"],
    [/\bhixel\b|\bpixle\b/g, "pixel"],
    [/(\d)(por|pr0|pro)\b/g, "$1 pro"],
    [/\bpor\b|\bpr0\b/g, "pro"],
    [/\bpromax\b/g, "pro max"],
    [/\bcharger port\b|\bcharging point\b|\bcharge port\b|\bchrging\b/g, "charging port"],
    // product words
    [/\bi ?w(h)?atch(es)?\b|\bapple watch\b/g, "watch"],
    [/\bi ?phone\b|\biph\b/g, "iphone"],
    [/\biph(\d)/g, "iphone $1"],
    [/\bi ?pad\b/g, "ipad"],
    [/\bmac ?book\b|\bmax ?book\b|\bmack ?book\b/g, "macbook"],
    [/\b(one|1) ?plus\b|\b1\+/g, "oneplus"],
    [/\biq(oo)?\b/g, "iqoo"],
    [/\bair ?pods?\b/g, "airpods"],
    [/\bz ?flip\b/g, "z flip"],
    [/\bz ?fold\b/g, "z fold"]
  ];

  // words that pick a variant: a model having one the query lacks (or vice versa) is a different phone
  var VARIANT = { pro: 1, max: 1, plus: 1, mini: 1, ultra: 1, lite: 1, fe: 1, air: 1, xl: 1, neo: 1, ce: 1, se: 1, fold: 1, flip: 1, edge: 1, fusion: 1, power: 1, play: 1, note: 1, prime: 1 };

  var FILLER = { price: 1, cost: 1, rate: 1, how: 1, much: 1, what: 1, is: 1, the: 1, of: 1, for: 1, my: 1, me: 1, please: 1, pls: 1, tell: 1, need: 1, want: 1, can: 1, i: 1, a: 1, an: 1, to: 1, it: 1, in: 1, and: 1, with: 1, sir: 1, bhai: 1, bolo: 1, kitna: 1, model: 1, no: 1, number: 1, phone: 1, mobile: 1, problem: 1, issue: 1, change: 1, replacement: 1, replace: 1, repair: 1, new: 1, only: 1, final: 1, last: 1, generation: 1, gen: 1, inch: 1, inches: 1, also: 1, required: 1, needed: 1, mm: 1, ka: 1, ki: 1, ke: 1, hai: 1, chahiye: 1, customer: 1, cx: 1, side: 1, not: 1, working: 1 };

  function norm(s) {
    s = " " + String(s).toLowerCase() + " ";
    s = s.replace(/[—–]/g, " ");
    s = s.replace(/["'’`()\[\]{}:;!?*#.,\/\\|_]+/g, " ");
    s = s.replace(/\s+/g, " ");
    ALIASES.forEach(function (a) { s = s.replace(a[0], a[1]); });
    s = s.replace(/(\d+) ?inch(es)?\b/g, "$1");                    // 13inch -> 13
    s = s.replace(/(\d+) ?mm\b/g, "$1mm");                      // "42 mm" -> 42mm
    s = s.replace(/(\d+) ?(st|nd|rd|th)\b/g, "$1");                 // 9th -> 9
    s = s.replace(/(\d+) ?gb\b|\b\d+ ?tb\b/g, " ");                 // storage sizes
    s = s.replace(/(\d)(pro|max|plus|mini|ultra|lite|fe)\b/g, "$1 $2"); // 15pro -> 15 pro
    s = s.replace(/\bse ?(\d)\b/g, "se $1");
    s = s.replace(/\b([avymsftgxck]) (\d{1,3})\b/g, "$1$2");        // "y 28" -> y28, "s 22" -> s22
    s = s.replace(/(\d) g\b/g, "$1g");                              // "5 g" -> 5g
    s = s.replace(/\s+/g, " ").trim();
    return s;
  }

  function tokens(s) { return s ? s.split(" ").filter(Boolean) : []; }

  // ---------- faults ----------

  // Each request type: how to spot it in the question, and which priced faults it covers.
  var FAULTS = [
    { key: "back", label: "Back glass / back panel",
      q: /\bback ?(glass|panel|cover|side glass|housing)\b|\bbackglass\b|\bbody\b|\bhousing\b|\bframe\b/,
      f: /back panel|back glass|body|housing/i },
    { key: "lens", label: "Camera lens / glass",
      q: /\bcamera (glass|lens)\b|\blens\b/,
      f: /lens/i },
    { key: "camera", label: "Camera",
      q: /\bcamera\b|\bselfie\b/,
      f: /camera/i },
    { key: "glass", label: "Glass / touch",
      q: /\bglass\b|\btouch\b(?! ?bar)/,
      f: /glass|touch(?! bar)/i, notF: /back|lens/i },
    { key: "display", label: "Display / screen",
      q: /\bdisplay\b|\bscreen\b|\blcd\b|\bled\b|\bamoled\b|\boled\b|\bfolder\b|\bcombo\b/,
      f: /display|screen/i, notF: /glass|touch/i },
    { key: "battery", label: "Battery",
      q: /\bbattery\b|\bbackup\b|\bdraining\b|\bbulge\b/,
      f: /battery/i },
    { key: "charging", label: "Charging port",
      q: /\bcharging\b|\bport\b|\btype ?c\b|\bnot charging\b|\bnot getting charged\b/,
      f: /charging/i },
    { key: "speaker", label: "Speaker",
      q: /\bspeaker\b|\bsound\b|\baudio\b|\bear ?piece\b|\bvoice\b/,
      f: /speaker/i },
    { key: "mic", label: "Mic", q: /\bmic\b|\bmicrophone\b/, f: /\bmic\b/i },
    { key: "board", label: "Motherboard / dead phone",
      q: /\bmotherboard\b|\bboard\b|\bdead\b|\bnot (opening|turning on|switching on|starting)\b|\bno power\b|\bic\b/,
      f: /motherboard|dead|cpu|reball/i },
    { key: "button", label: "Buttons",
      q: /\bbutton\b|\bpower key\b|\bvolume\b|\bon ?off\b/,
      f: /button/i },
    { key: "keyboard", label: "Keyboard / touch bar",
      q: /\bkeyboard\b|\bkey ?pad\b|\btouch ?bar\b|\btrack ?pad\b/,
      f: /keyboard|touch bar/i },
    { key: "hinge", label: "Hinge", q: /\bhinge\b/, f: /hinge/i },
    { key: "signal", label: "Network / signal", q: /\bnetwork\b|\bsignal\b|\bantenna\b/, f: /signal|antenna/i }
  ];

  var FAULT_WORDS = /\b(back|glass|panel|cover|body|housing|frame|camera|lens|selfie|front|rear|display|screen|lcd|led|amoled|oled|folder|combo|battery|backup|draining|bulge|charging|port|type|c|speaker|sound|audio|ear|loud|down|bottom|piece|voice|mic|microphone|motherboard|board|dead|opening|turning|switching|starting|on|off|power|key|button|volume|keyboard|keypad|pad|touch|bar|track|trackpad|touchbar|hinge|network|signal|antenna|ic|charged|getting|broken|cracked|damage|damaged|water|lines|black|copy|duplicate|used|lightning|onoff)\b/g;

  var QUALITY = [
    { q: /\boriginal\b|\bgenuine\b|\boem\b/, f: /original|genuine|oem/i, label: "original" },
    { q: /\bcopy\b|\bduplicate\b|\bfirst copy\b|\bcompatible\b/, f: /copy|lcd/i, label: "copy" },
    { q: /\blcd\b/, f: /lcd/i, label: "LCD" },
    { q: /\bled\b|\boled\b/, f: /\bled\b|oled/i, label: "LED" },
    { q: /\bused\b/, f: /used/i, label: "used" }
  ];

  function detectFaults(text) {
    var t = " " + text + " ";
    t = t.replace(/\bnot (screen|display)\b/g, " ");             // "glass replacement, not screen"
    var found = [];
    FAULTS.forEach(function (f) {
      if (f.q.test(t)) {
        found.push(f);
        // consume the words so "back glass" doesn't also count as front glass, "camera glass" as glass…
        t = t.replace(new RegExp(f.q.source, "g"), " ");
      }
    });
    // "screen glass" / "display glass" means glass only
    var keys = found.map(function (f) { return f.key; });
    if (keys.indexOf("glass") >= 0 && keys.indexOf("display") >= 0 && /\b(screen|display) glass\b|\bglass (of|on) (the )?(screen|display)\b/.test(text)) {
      found = found.filter(function (f) { return f.key !== "display"; });
    }
    return found;
  }

  function detectQuality(text) {
    var out = [];
    QUALITY.forEach(function (q) { if (q.q.test(text)) out.push(q); });
    return out;
  }

  // ---------- model matching ----------

  var BRAND_HINTS = {
    Apple: /\b(apple|iphone|ipad|macbook|imac|watch|airpods)\b/,
    Google: /\b(google|pixel)\b/,
    Samsung: /\b(samsung|galaxy)\b/,
    Xiaomi: /\b(xiaomi|redmi|poco|mi)\b/,
    OnePlus: /\b(oneplus|nord)\b/,
    Vivo: /\b(vivo|iqoo)\b/,
    Motorola: /\b(motorola|moto)\b/,
    Oppo: /\boppo\b/, Realme: /\b(realme|narzo)\b/, Infinix: /\binfinix\b/,
    Honor: /\bhonor\b/, LG: /\blg\b/
  };

  var OTHER_BRANDS = /\b(sony|xperia|asus|zenfone|zen|asues|nokia|huawei|lenovo|tecno|lava|micromax|htc|blackberry|meizu)\b|\bnothing phone\b/;

  var INDEX = null;
  function buildIndex() {
    INDEX = [];
    Object.keys(PRICE_DATA).forEach(function (brand) {
      Object.keys(PRICE_DATA[brand]).forEach(function (model) {
        var n = norm(model);
        INDEX.push({ brand: brand, model: model, toks: tokens(n).filter(function (t, i, a) { return a.indexOf(t) === i; }) });
      });
    });
  }

  function isYear(t) { return /^20[12]\d$/.test(t); }      // launch years help, but never rule a model out
  var DEVICES = ["iphone", "ipad", "macbook", "imac", "watch", "airpods"];

  function isCode(t) { return /^a\d{4}$/.test(t); }        // Apple model numbers like A2377
  function hasDigit(t) { return /\d/.test(t); }

  var GENERIC = { iphone: 1, ipad: 1, macbook: 1, watch: 1, pixel: 1, galaxy: 1, series: 1, redmi: 1, poco: 1, nord: 1, oneplus: 1, vivo: 1, oppo: 1, realme: 1, moto: 1, mi: 1, xiaomi: 1, iqoo: 1, "5g": 1, "4g": 1, apple: 1, google: 1, samsung: 1, airpods: 1, of: 1, model: 1, from: 1, photo: 1, stated: 1, us: 1, variant: 1, not: 1, gen: 1 };

  function scoreModel(entry, qToks, qSet, qText) {
    var s = 0, matchedId = false, codeHit = false, used = {};
    entry.toks.forEach(function (t) {
      var lm = /^([a-z]{1,2})(\d+)$/.exec(t);
      if (!qSet[t] && lm && qSet[lm[2]] && !/^\d+g$/.test(t)) {   // "vivo 19" ~ V19
        s += 3; matchedId = true; used[lm[2]] = 1; return;
      }
      if (qSet[t]) {
        if (isCode(t)) { s += 8; codeHit = true; }
        else if (isYear(t)) s += 2;
        else if (hasDigit(t)) { s += 3; matchedId = true; }
        else if (VARIANT[t]) s += 2;
        else if (GENERIC[t]) s += 1;
        else { s += 2; matchedId = true; }
      } else {
        if (isCode(t) || isYear(t)) { /* model lists several codes / a year; missing one is fine */ }
        else if (GENERIC[t]) s -= 0.2;
        else if (/mm$/.test(t)) s -= 0.8;
        else if (hasDigit(t)) s -= 2.5;
        else if (VARIANT[t]) s -= 2;
        else if (GENERIC[t]) s -= 0.2;
        else s -= 0.6;
      }
    });
    var set = {};
    entry.toks.forEach(function (t) { set[t] = 1; });
    qToks.forEach(function (t) {
      if (set[t] || used[t] || isYear(t)) return;
      if (isCode(t)) s -= 1;                       // a different model number was asked
      else if (hasDigit(t) && !/^\d+g$/.test(t)) s -= 1.5;
      else if (VARIANT[t]) s -= 2;
    });
    DEVICES.forEach(function (d) { if (qSet[d] && !set[d]) s -= 6; });  // asked for an iPad, this is an iPhone
    if (OTHER_BRANDS.test(qText)) s -= 8;          // a brand we have no prices for
    var hint = BRAND_HINTS[entry.brand];
    if (hint && hint.test(qText)) s += 1;
    else if (hint && Object.keys(BRAND_HINTS).some(function (b) { return BRAND_HINTS[b].test(qText); })) s -= 3; // another brand was named
    // Apple model numbers are unique — trust them
    if (codeHit) s += 4;
    return { score: s, strong: matchedId || codeHit };
  }

  function modelQueryTokens(text) {
    var t = (" " + text + " ").replace(FAULT_WORDS, " ");
    return tokens(t.replace(/\s+/g, " ").trim()).filter(function (w) { return !FILLER[w]; });
  }

  function findModels(text) {
    if (!INDEX) buildIndex();
    var qToks = modelQueryTokens(text);
    if (!qToks.length) return [];
    var qSet = {};
    qToks.forEach(function (t) { qSet[t] = 1; });
    var scored = INDEX.map(function (e) {
      var r = scoreModel(e, qToks, qSet, text);
      return { brand: e.brand, model: e.model, score: r.score, strong: r.strong };
    }).filter(function (r) { return r.strong && r.score > 1.5; });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored;
  }

  // ---------- answering ----------

  function pickFaults(brand, model, faultTypes, qualities) {
    var all = PRICE_DATA[brand][model];
    var asked = [], missing = [];
    faultTypes.forEach(function (ft) {
      var fits = function (f) { return ft.f.test(f.fault) && !(ft.notF && ft.notF.test(f.fault)); };
      // customer prices first; the watch "Display Part Cost" rows only when nothing else is priced
      var hits = all.filter(function (f) { return fits(f) && !/part cost/i.test(f.fault); });
      if (!hits.length && ft.key === "display") hits = all.filter(function (f) { return /part cost/i.test(f.fault); });
      if (hits.length) asked.push({ type: ft, items: hits });
      else missing.push(ft);
    });
    // narrow by quality only when that still leaves something
    if (qualities.length) {
      asked.forEach(function (g) {
        var narrowed = g.items.filter(function (f) {
          return qualities.some(function (q) { return q.f.test(f.quality || ""); });
        });
        if (narrowed.length) g.items = narrowed;
      });
    }
    return { asked: asked, missing: missing, all: all };
  }

  // Split "vivo v19 display and vivo v60e display" into one question per phone.
  function splitQuestions(text) {
    var parts = text.split(/\n|\band\b|,|&|\+/).map(function (p) { return p.trim(); }).filter(Boolean);
    var groups = [];
    parts.forEach(function (p) {
      var n = norm(p);
      var models = findModels(n);
      var top = models[0];
      var prev = groups[groups.length - 1];
      if (top && top.score >= 3 && (!prev || !prev.top || prev.top.model !== top.model)) {
        groups.push({ text: n, top: top, models: models });
      } else if (prev) {
        prev.text += " " + n;
      } else {
        groups.push({ text: n, top: null, models: [] });
      }
    });
    return groups;
  }

  function answer(question) {
    var n = norm(question);
    var groups = splitQuestions(question);
    // if splitting found at most one phone, read the whole question as one
    if (groups.filter(function (g) { return g.top; }).length <= 1) {
      groups = [{ text: n, models: findModels(n) }];
    }
    return groups.map(function (g) {
      var models = g.models;
      var faults = detectFaults(g.text);
      var qualities = detectQuality(g.text);
      if (!models.length) {
        return { found: false, query: g.text, faults: faults, suggestions: [] };
      }
      var top = models[0];
      var close = models.slice(1, 4).filter(function (m) { return m.score >= top.score - 1.5; });
      var weak = top.score < 3.5;
      var picked = pickFaults(top.brand, top.model, faults, qualities);
      return {
        found: true,
        brand: top.brand,
        model: top.model,
        sure: !weak && !close.some(function (c) { return c.score >= top.score - 0.3; }),
        alternatives: (weak ? models.slice(1, 4) : close).map(function (m) { return { brand: m.brand, model: m.model }; }),
        faults: faults,
        qualities: qualities,
        asked: picked.asked,
        missing: picked.missing,
        all: picked.all
      };
    });
  }

  function lookup(brand, model, question) {
    var n = norm(question || "");
    var faults = detectFaults(n), qualities = detectQuality(n);
    var picked = pickFaults(brand, model, faults, qualities);
    return { found: true, sure: true, brand: brand, model: model, alternatives: [], faults: faults, qualities: qualities, asked: picked.asked, missing: picked.missing, all: picked.all };
  }

  root.PriceBot = { answer: answer, lookup: lookup, norm: norm, findModels: findModels, detectFaults: detectFaults };
})(typeof window !== "undefined" ? window : globalThis);
