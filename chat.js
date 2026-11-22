/* Price bot in the "ask" box under the brand/model pickers (engine in chat-engine.js). */
(function () {
  "use strict";

  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmtNum(n) { return typeof n === "number" ? n.toLocaleString("en-IN") : String(n); }
  function fmtDate(iso) { if (!iso) return ""; var p = iso.split("-"); return parseInt(p[2], 10) + " " + MONTHS[parseInt(p[1], 10) - 1]; }
  function label(f) { return f.quality ? f.fault + " (" + f.quality + ")" : f.fault; }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    var ta = el("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }

  // ---------- page wiring ----------

  var form = document.getElementById("askForm");
  var input = document.getElementById("askInput");
  var section = document.getElementById("askSection");
  var log = document.getElementById("askLog");
  var emptyState = document.getElementById("emptyState");
  if (!form || !input || !section || !log) return;

  document.getElementById("askClear").addEventListener("click", function () {
    log.innerHTML = "";
    section.hidden = true;
    if (emptyState && document.getElementById("resultSection").hidden) emptyState.hidden = false;
    input.value = "";
    input.focus();
  });

  // one answer block: the question, then the bot's answer
  function newItem(question) {
    Array.prototype.forEach.call(log.children, function (c) { c.classList.add("old"); });
    var item = el("article", "ask-item");
    var q = el("div", "ask-q");
    q.appendChild(el("b", null, "Asked"));
    q.appendChild(el("span", null, question));
    item.appendChild(q);
    log.insertBefore(item, log.firstChild);   // newest on top
    section.hidden = false;
    if (emptyState) emptyState.hidden = true;
    return item;
  }

  // ---------- answers ----------

  function priceLine(f) {
    var li = el("li", "chat-price");
    var top = el("div", "chat-price-top");
    var name = el("span", "chat-fault", f.fault);
    if (f.quality) name.appendChild(el("span", "chat-q", f.quality));
    top.appendChild(name);
    top.appendChild(el("span", "chat-amt", "₹" + fmtNum(f.price)));
    li.appendChild(top);
    var bits = [];
    if (f.final != null) bits.push("Final ₹" + fmtNum(f.final));
    if (f.range) bits.push("Quoted ₹" + f.range);
    if (f.warranty) bits.push("Warranty " + f.warranty);
    if (bits.length) li.appendChild(el("div", "chat-extra strong", bits.join(" · ")));
    if (f.note) li.appendChild(el("div", "chat-extra" + (/\bCHECK\b/.test(f.note) ? " warn" : ""), f.note));
    var src = (f.source || "") + (f.date ? " · " + fmtDate(f.date) : "");
    if (src) li.appendChild(el("div", "chat-src", src));
    return li;
  }

  function copyTextFor(r, list) {
    var lines = [r.brand + " " + r.model];
    list.forEach(function (f) {
      lines.push("  " + label(f) + ": ₹" + fmtNum(f.price) + (f.final != null ? " (final ₹" + fmtNum(f.final) + ")" : ""));
    });
    return lines.join("\n");
  }

  function openInPage(r) {
    var bs = document.getElementById("brandSelect"), ms = document.getElementById("modelSelect");
    if (!bs || !ms) return;
    bs.value = r.brand; bs.dispatchEvent(new Event("change"));
    ms.value = r.model; ms.dispatchEvent(new Event("change"));
    var sec = document.getElementById("resultSection");
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderResult(b, r, question) {
    if (!r.found) {
      var what = r.faults.length ? " for " + r.faults.map(function (f) { return f.label.toLowerCase(); }).join(", ") : "";
      b.appendChild(el("p", null, "I couldn't find this model in the price list" + what + ". It hasn't been quoted yet, so check with Mohit before telling the customer a price."));
      b.appendChild(el("p", "chat-hint", "Tip: include the brand and model number, e.g. \"Vivo Y21 display\" or \"iPad A2602 battery\"."));
      return;
    }

    var card = el("div", "chat-card");
    var head = el("div", "chat-card-head");
    var title = el("div", "chat-card-title");
    title.appendChild(el("span", "chat-brand", r.brand));
    title.appendChild(el("strong", null, r.model));
    head.appendChild(title);
    var actions = el("div", "chat-card-actions");
    var copyBtn = el("button", "chat-mini", "Copy"); copyBtn.type = "button";
    var openBtn = el("button", "chat-mini", "Open"); openBtn.type = "button"; openBtn.title = "Show this model's full price card on the page";
    actions.appendChild(copyBtn); actions.appendChild(openBtn);
    head.appendChild(actions);
    card.appendChild(head);

    var shown = [];
    var ul;
    if (r.faults.length) {
      r.asked.forEach(function (g) {
        if (r.asked.length + r.missing.length > 1) card.appendChild(el("div", "chat-group", g.type.label));
        ul = el("ul", "chat-prices");
        g.items.forEach(function (f) { ul.appendChild(priceLine(f)); shown.push(f); });
        card.appendChild(ul);
      });
      r.missing.forEach(function (ft) {
        card.appendChild(el("div", "chat-missing", "No price yet for " + ft.label.toLowerCase() + " on this model. Confirm with Mohit."));
      });
      if (!r.asked.length) {
        card.appendChild(el("div", "chat-group", "Other prices for this model"));
        ul = el("ul", "chat-prices");
        r.all.forEach(function (f) { ul.appendChild(priceLine(f)); shown.push(f); });
        card.appendChild(ul);
      }
    } else {
      card.appendChild(el("div", "chat-group", "All prices for this model (" + r.all.length + ")"));
      ul = el("ul", "chat-prices");
      r.all.forEach(function (f) { ul.appendChild(priceLine(f)); shown.push(f); });
      card.appendChild(ul);
    }

    copyBtn.addEventListener("click", function () {
      copy(copyTextFor(r, shown)).then(function () { toast("Prices copied"); });
    });
    openBtn.addEventListener("click", function () { openInPage(r); });

    b.appendChild(card);

    if (r.alternatives && r.alternatives.length) {
      var p = el("p", "chat-hint", r.sure ? "Or did you mean:" : "Not fully sure about the model. Did you mean:");
      b.appendChild(p);
      var chips = el("div", "chat-chips");
      r.alternatives.forEach(function (a) {
        var c = el("button", "chat-chip", a.model); c.type = "button";
        c.addEventListener("click", function () {
          var nb = newItem(question + "  →  " + a.model);
          renderResult(nb, PriceBot.lookup(a.brand, a.model, question), question);
          section.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        chips.appendChild(c);
      });
      b.appendChild(chips);
    }
  }

  function ask(q) {
    q = q.trim();
    if (!q) return;
    var results;
    try { results = PriceBot.answer(q); } catch (e) { results = [{ found: false, faults: [] }]; }
    var item = newItem(q);
    results.forEach(function (r) { renderResult(item, r, q); });
    var top = section.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight - 120) section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    ask(input.value);
    input.select();   // ready for the next question
  });
})();
