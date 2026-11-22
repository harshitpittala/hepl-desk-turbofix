(function () {
  "use strict";

  var brandSelect = document.getElementById("brandSelect");
  var modelSelect = document.getElementById("modelSelect");
  var resultSection = document.getElementById("resultSection");
  var emptyState = document.getElementById("emptyState");
  var resultBrandBadge = document.getElementById("resultBrandBadge");
  var resultModelName = document.getElementById("resultModelName");
  var faultCount = document.getElementById("faultCount");
  var faultGrid = document.getElementById("faultGrid");
  var copyAllBtn = document.getElementById("copyAllBtn");
  var toast = document.getElementById("toast");
  var liveClock = document.getElementById("liveClock");
  var metaSource = document.getElementById("metaSource");

  var toastTimer = null;

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 1800);
  }

  function fmtNum(n) {
    return typeof n === "number" ? n.toLocaleString("en-IN") : String(n);
  }

  function fmtPrice(n) {
    return "₹" + fmtNum(n);
  }

  // e.g. "Display Replacement (Original)"
  function faultLabel(f) {
    return f.quality ? f.fault + " (" + f.quality + ")" : f.fault;
  }

  function fmtDate(iso) {
    var p = iso.split("-");
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return parseInt(p[2], 10) + " " + months[parseInt(p[1], 10) - 1];
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function getFlag(brand, model, fault) {
    for (var i = 0; i < PRICE_FLAGS.length; i++) {
      var f = PRICE_FLAGS[i];
      if (f.brand === brand && f.model === model && f.fault === fault) return f;
    }
    return null;
  }

  // ---------- populate brand dropdown ----------
  var brands = Object.keys(PRICE_DATA);
  brands.forEach(function (b) {
    var opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b + " (" + Object.keys(PRICE_DATA[b]).length + " models)";
    brandSelect.appendChild(opt);
  });

  if (metaSource && typeof DATA_META !== "undefined") {
    metaSource.textContent = DATA_META.source;
  }

  // ---------- clock ----------
  function tickClock() {
    if (!liveClock) return;
    var d = new Date();
    var h = d.getHours(), m = d.getMinutes();
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12 || 12;
    liveClock.textContent = h12 + ":" + (m < 10 ? "0" + m : m) + " " + ampm;
  }
  tickClock();
  setInterval(tickClock, 15000);

  // ---------- brand -> model cascade ----------
  brandSelect.addEventListener("change", function () {
    var brand = brandSelect.value;
    modelSelect.innerHTML = "";
    if (!brand) {
      modelSelect.disabled = true;
      var opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "Select brand first…";
      modelSelect.appendChild(opt0);
      hideResults();
      return;
    }
    modelSelect.disabled = false;
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select model…";
    modelSelect.appendChild(placeholder);

    // preserve PRICE_DATA's own key order: newest model first, then older ones
    var models = Object.keys(PRICE_DATA[brand]);
    models.forEach(function (m) {
      var opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      modelSelect.appendChild(opt);
    });
    hideResults();
  });

  modelSelect.addEventListener("change", function () {
    var brand = brandSelect.value;
    var model = modelSelect.value;
    if (!brand || !model) { hideResults(); return; }
    renderResult(brand, model);
  });

  // ---------- render result ----------
  function hideResults() {
    resultSection.hidden = true;
    emptyState.hidden = false;
  }

  function renderResult(brand, model) {
    var faults = PRICE_DATA[brand][model];
    resultBrandBadge.textContent = brand;
    resultModelName.textContent = model;
    faultCount.textContent = faults.length + (faults.length === 1 ? " fault priced" : " faults priced");

    faultGrid.innerHTML = "";
    faults.forEach(function (f, idx) {
      var flag = getFlag(brand, model, f.fault);
      // notes like "... - CHECK" mark a price that still needs confirming
      if (!flag && f.note && /\bCHECK\b/.test(f.note)) flag = { note: f.note };
      var card = document.createElement("div");
      card.className = "fault-card" + (flag ? " flagged" : "");
      card.style.animationDelay = Math.min(idx * 25, 400) + "ms";
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", "Copy " + faultLabel(f) + " price for " + model);

      var name = document.createElement("p");
      name.className = "fault-name";
      name.textContent = f.fault;
      if (f.quality) {
        var q = document.createElement("span");
        q.className = "quality-tag";
        q.textContent = f.quality;
        name.appendChild(q);
      }
      card.appendChild(name);

      var row = document.createElement("div");
      row.className = "fault-price-row";

      var price = document.createElement("span");
      price.className = "fault-price";
      price.innerHTML = '<span class="rupee">₹</span>' + fmtNum(f.price);
      row.appendChild(price);

      var chip = document.createElement("span");
      chip.className = "copy-chip";
      chip.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M8 8V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3M8 8H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3M8 8h8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Copy';
      row.appendChild(chip);

      card.appendChild(row);

      var details = [];
      if (f.final != null) details.push(["Final", fmtPrice(f.final)]);
      if (f.notebook != null) details.push(["Notebook", fmtPrice(f.notebook)]);
      if (f.range) details.push(["Quoted", "₹" + f.range]);
      if (f.warranty) details.push(["Warranty", f.warranty]);
      if (details.length) {
        var dl = document.createElement("div");
        dl.className = "fault-details";
        details.forEach(function (d) {
          var item = document.createElement("span");
          var k = document.createElement("b");
          k.textContent = d[0] + " ";
          item.appendChild(k);
          item.appendChild(document.createTextNode(d[1]));
          dl.appendChild(item);
        });
        card.appendChild(dl);
      }

      if (f.note && !flag) {
        var note = document.createElement("p");
        note.className = "fault-note";
        note.textContent = f.note;
        card.appendChild(note);
      }

      var src = document.createElement("p");
      src.className = "fault-source";
      src.textContent = (f.source || "") + (f.date ? " · " + fmtDate(f.date) : "");
      if (src.textContent) card.appendChild(src);

      if (flag) {
        var banner = document.createElement("div");
        banner.className = "flag-banner";
        banner.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span></span>';
        banner.querySelector("span").textContent = flag.note;
        card.appendChild(banner);
      }

      var copyLine = model + " — " + faultLabel(f) + ": " + fmtPrice(f.price);
      card.addEventListener("click", function () {
        copyText(copyLine).then(function () {
          card.classList.add("copied");
          showToast("Copied: " + copyLine);
          setTimeout(function () { card.classList.remove("copied"); }, 900);
        });
      });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); card.click(); }
      });

      faultGrid.appendChild(card);
    });

    emptyState.hidden = true;
    resultSection.hidden = false;
  }

  copyAllBtn.addEventListener("click", function () {
    var brand = brandSelect.value, model = modelSelect.value;
    if (!brand || !model) return;
    var faults = PRICE_DATA[brand][model];
    var lines = [brand + " " + model + " — Repair Prices"];
    faults.forEach(function (f) {
      lines.push("  " + faultLabel(f) + ": " + fmtPrice(f.price));
    });
    copyText(lines.join("\n")).then(function () {
      showToast("Full price list copied to clipboard");
    });
  });

  hideResults();
})();
