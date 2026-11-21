/* Yat's List · BTC 周期看板. No backend: every number is fetched from a public API and computed here. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var DAY = 864e5;
  var GENESIS = Date.UTC(2009, 0, 3);

  /* ---------- theme toggle (same storage key as the other lists) ---------- */
  var THEMES = ["auto", "light", "dark"], ICON = { auto: "◐", light: "☀", dark: "☾" }, NAME = { auto: "自动", light: "白天", dark: "晚上" };
  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  function themeMode() { var t; try { t = localStorage.getItem("szTheme"); } catch (e) {} return THEMES.indexOf(t) >= 0 ? t : "auto"; }
  function applyTheme() {
    var t = themeMode(), d = t === "dark" || (t === "auto" && mq.matches);
    document.documentElement.setAttribute("data-theme", d ? "dark" : "light");
    document.documentElement.setAttribute("data-theme-mode", t);
    var b = $("#themecyc"); b.textContent = ICON[t]; b.title = "主题：" + NAME[t]; b.setAttribute("aria-label", b.title);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", d ? "#0d1218" : "#f6f8f7");
    if (CH) drawChart();
  }
  $("#themecyc").addEventListener("click", function () {
    var n = THEMES[(THEMES.indexOf(themeMode()) + 1) % 3];
    try { localStorage.setItem("szTheme", n); } catch (e) {}
    applyTheme();
  });
  if (mq.addEventListener) mq.addEventListener("change", applyTheme);

  /* ---------- formatting ---------- */
  function usd(v, dp) { if (v == null || !isFinite(v)) return "—"; return "$" + v.toLocaleString("en-US", { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 }); }
  function num(v, dp) { if (v == null || !isFinite(v)) return "—"; return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }); }
  function compact(v) { if (v >= 1e6) return "$" + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + "M"; if (v >= 1e3) return "$" + (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + "K"; return "$" + Math.round(v); }
  function ymd(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function zhDate(ms) { var d = new Date(ms); return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日"; }
  function hm(ms) { return new Date(ms).toLocaleString("zh-CN", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------- sources + status ---------- */
  var SRC = {
    mempoolPrice: "mempool.space 现价", binance: "Binance 现价（备用）", coinbase: "Coinbase 现价（备用）", coingecko: "CoinGecko 现价（备用）",
    hist24: "mempool.space 24 小时前价格", bcPrice: "blockchain.com 每日均价", bcVol: "blockchain.com 每日成交额", bcRev: "blockchain.com 矿工收入",
    cm: "Coin Metrics MVRV / 市值", mining: "mempool.space 算力与难度", diffadj: "mempool.space 难度调整", tip: "mempool.space 区块高度", fng: "Alternative.me 恐惧贪婪"
  };
  var STATE = {};
  var STLBL = { ok: "正常", wait: "获取中", fail: "请求失败", back: "备用" };
  function setSt(k, s) { STATE[k] = s; renderSrc(); }
  function renderSrc() {
    $("#srcs").innerHTML = Object.keys(SRC).map(function (k) {
      var s = STATE[k] || "wait";
      return '<div><span>' + SRC[k] + '</span><span class="st ' + s + '">' + STLBL[s] + "</span></div>";
    }).join("");
  }
  function get(url, key, ms) {
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, ms || 15000);
    if (key) setSt(key, STATE[key] === "ok" ? "ok" : "wait");
    return fetch(url, { signal: c.signal, cache: "no-store" }).then(function (r) {
      clearTimeout(t); if (!r.ok) throw new Error(r.status); return r.json();
    }).then(function (j) { if (key) setSt(key, "ok"); return j; }, function (e) { if (key) setSt(key, "fail"); throw e; });
  }

  /* ---------- state ---------- */
  var D = { live: null, liveSrc: null, liveAt: null, p24: null, days: null, px: null, vol: null, rev: null, cm: null, mining: null, adj: null, tip: null, fng: null };

  /* ---------- live price with fallbacks ---------- */
  var PRICE_CHAIN = [
    ["mempoolPrice", "https://mempool.space/api/v1/prices", function (j) { return j.USD; }, "mempool.space"],
    ["binance", "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT", function (j) { return +j.price; }, "Binance"],
    ["coinbase", "https://api.coinbase.com/v2/prices/BTC-USD/spot", function (j) { return +j.data.amount; }, "Coinbase"],
    ["coingecko", "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", function (j) { return j.bitcoin.usd; }, "CoinGecko"]
  ];
  function livePrice(i) {
    i = i || 0;
    if (i >= PRICE_CHAIN.length) { $("#pc-meta").textContent = "现价暂时取不到，下面的指标改用最近一天的均价。"; return Promise.resolve(); }
    var c = PRICE_CHAIN[i];
    return get(c[1], c[0], 8000).then(function (j) {
      var v = c[2](j); if (!(v > 0)) throw new Error("bad price");
      PRICE_CHAIN.forEach(function (o, k) { if (k > i && STATE[o[0]] !== "fail") setSt(o[0], "back"); });
      D.live = v; D.liveSrc = c[3]; D.liveAt = Date.now(); renderPrice(); renderTiles(); renderMiners();
    }).catch(function () { return livePrice(i + 1); });
  }
  function load24h() {
    var ts = Math.floor(Date.now() / 1000) - 86400;
    return get("https://mempool.space/api/v1/historical-price?currency=USD&timestamp=" + ts, "hist24").then(function (j) {
      var p = j && j.prices && j.prices[0] && j.prices[0].USD; if (p > 0) { D.p24 = p; renderPrice(); }
    }).catch(function () {});
  }
  function P() { return D.live || (D.px ? D.px[D.px.length - 1] : null); }

  function renderPrice() {
    var p = P(); if (!p) return;
    $("#price").textContent = usd(p, p < 1000 ? 2 : 0);
    var ref = D.p24, lbl = "24 小时";
    if (!ref && D.px) { ref = D.px[D.px.length - 1]; lbl = "较昨日均价"; }
    var c = $("#chg");
    if (ref && D.live) { var ch = (D.live / ref - 1) * 100; c.textContent = (ch >= 0 ? "▲ " : "▼ ") + Math.abs(ch).toFixed(2) + "%"; c.className = "pc-chg " + (ch >= 0 ? "up" : "down"); c.title = lbl; }
    $("#pc-src").textContent = "BTC / USD · " + (D.liveSrc ? "来源 " + D.liveSrc : "最近一天均价");
    $("#pc-meta").textContent = (D.liveAt ? "更新于 " + hm(D.liveAt) + " · " : "") + (ref && D.live ? "涨跌按" + lbl + "算 · " : "") + "每 15 秒刷新";
  }

  /* ---------- loaders ---------- */
  function loadDaily() {
    return get("https://api.blockchain.info/charts/market-price?timespan=all&sampled=false&format=json&cors=true", "bcPrice", 25000).then(function (j) {
      var v = (j.values || []).filter(function (o) { return o.y > 0; });
      D.days = v.map(function (o) { return o.x * 1000; }); D.px = v.map(function (o) { return o.y; });
    });
  }
  function loadVol() {
    return get("https://api.blockchain.info/charts/trade-volume?timespan=all&sampled=false&format=json&cors=true", "bcVol", 25000).then(function (j) {
      D.vol = {}; (j.values || []).forEach(function (o) { D.vol[ymd(o.x * 1000)] = o.y; });
    });
  }
  function loadRev() {
    return get("https://api.blockchain.info/charts/miners-revenue?timespan=2years&sampled=false&format=json&cors=true", "bcRev", 25000).then(function (j) {
      D.rev = (j.values || []).map(function (o) { return o.y; });
    });
  }
  function loadCM() {
    return get("https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur,CapMrktCurUSD&frequency=1d&page_size=10000&start_time=2010-07-18", "cm", 25000).then(function (j) {
      D.cm = (j.data || []).map(function (o) { return { d: o.time.slice(0, 10), mvrv: +o.CapMVRVCur, mc: +o.CapMrktCurUSD }; }).filter(function (o) { return o.mvrv > 0 && o.mc > 0; });
    });
  }
  function loadMining() {
    return Promise.all([
      get("https://mempool.space/api/v1/mining/hashrate/3d", "mining").then(function (j) { D.mining = j; }),
      get("https://mempool.space/api/v1/difficulty-adjustment", "diffadj").then(function (j) { D.adj = j; }),
      get("https://mempool.space/api/blocks/tip/height", "tip").then(function (j) { D.tip = +j; })
    ].map(function (p) { return p.catch(function () {}); }));
  }
  function loadFng() { return get("https://api.alternative.me/fng/?limit=1", "fng").then(function (j) { D.fng = j.data && j.data[0]; }); }

  /* ---------- metrics ---------- */
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function wmaAt(i) { // mean of 200 weekly closes ending at day index i
    if (i - 199 * 7 < 0) return null; var s = 0; for (var k = 0; k < 200; k++) s += D.px[i - k * 7]; return s / 200;
  }
  function metrics() {
    var M = {}, p = P(); if (!p) return M;
    if (D.px && D.px.length > 1400) {
      var n = D.px.length, last = D.px.slice(-199).concat([p]);
      var gma = Math.exp(mean(last.map(Math.log)));
      var age = (Date.now() - GENESIS) / DAY, fit = Math.pow(10, 5.84 * Math.log10(age) - 17.01);
      M.ahr = (p / gma) * (p / fit); M.gma = gma; M.fit = fit;
      M.sma200 = mean(last); M.mayer = p / M.sma200;
      M.wma = wmaAt(n - 1); M.wmaX = p / M.wma;
    }
    if (D.cm && D.cm.length) {
      var c = D.cm[D.cm.length - 1], pd = null;
      if (D.days) { var key = c.d; for (var i = D.days.length - 1; i >= 0 && i > D.days.length - 10; i--) if (ymd(D.days[i]) === key) { pd = D.px[i]; break; } }
      M.mvrv = c.mvrv; M.mvrvDate = c.d;
      if (pd) { M.rp = pd / c.mvrv; M.rpX = p / M.rp; }
      var mcs = D.cm.map(function (o) { return o.mc; }), mu = mean(mcs), sd = Math.sqrt(mean(mcs.map(function (v) { return (v - mu) * (v - mu); })));
      M.z = (c.mc - c.mc / c.mvrv) / sd;
    }
    if (D.rev && D.rev.length >= 365) { var r = D.rev.slice(-365); M.puell = r[r.length - 1] / mean(r); }
    return M;
  }
  function zone(v, cuts) { // cuts: [[max, cls, label], ...] ascending
    for (var i = 0; i < cuts.length; i++) if (v < cuts[i][0]) return cuts[i];
    return cuts[cuts.length - 1];
  }

  /* ---------- tiles ---------- */
  var FNG_ZH = { "Extreme Fear": "极度恐惧", "Fear": "恐惧", "Neutral": "中性", "Greed": "贪婪", "Extreme Greed": "极度贪婪" };
  function tile(o) {
    return '<div class="tile"><div class="t-lbl">' + o.lbl + '</div><div class="t-row"><span class="t-val">' + o.val + "</span>" +
      (o.z ? '<span class="zone ' + o.z[1] + '">' + o.z[2] + "</span>" : "") + "</div>" + (o.sub ? '<div class="t-sub">' + o.sub + "</div>" : "") +
      (o.extra || "") + '<div class="t-desc">' + o.desc + '</div><div class="t-src">来源：' + o.src + "</div></div>";
  }
  function renderTiles() {
    var M = metrics(), T = [];
    if (D.fng) {
      var fv = +D.fng.value, cls = fv < 25 ? "bad" : fv < 45 ? "warn" : fv <= 55 ? "mid" : "good";
      T.push(tile({ lbl: "恐惧与贪婪指数", val: fv, z: [0, cls, FNG_ZH[D.fng.value_classification] || D.fng.value_classification],
        extra: '<div class="fng-bar" role="img" aria-label="0 极度恐惧到 100 极度贪婪，当前 ' + fv + '"><span class="fng-dot" style="left:' + fv + '%"></span></div>',
        desc: "0 是极度恐惧，100 是极度贪婪。由波动率、成交量、社交热度等合成，每天更新一次。", src: "Alternative.me" }));
    }
    if (M.ahr != null) T.push(tile({ lbl: "ahr999 囤币指数", val: num(M.ahr, 2), z: zone(M.ahr, [[0.45, "good", "抄底区"], [1.2, "mid", "定投区"], [Infinity, "warn", "偏贵"]]),
      sub: "200 日定投成本 " + usd(M.gma) + " · 拟合价 " + usd(M.fit),
      desc: "（现价 ÷ 200 日几何平均）×（现价 ÷ 币龄拟合价）。低于 0.45 历来是长期底部区域，0.45–1.2 适合定投。", src: "blockchain.com 每日均价 + 现价" }));
    if (M.wma != null) T.push(tile({ lbl: "200 周均线", val: usd(M.wma), z: zone(M.wmaX, [[1, "good", "现价低于均线"], [2.5, "mid", "正常"], [Infinity, "warn", "远高于均线"]]),
      sub: "现价是均线的 " + num(M.wmaX, 2) + " 倍",
      desc: "最近 200 个周收盘价的平均。过去几轮熊市底部都在这条线附近或下方。", src: "blockchain.com 每日均价" }));
    if (M.mayer != null) T.push(tile({ lbl: "Mayer 倍数", val: num(M.mayer, 2), z: zone(M.mayer, [[0.8, "good", "低估"], [2.4, "mid", "正常"], [Infinity, "bad", "过热"]]),
      sub: "200 日均线 " + usd(M.sma200),
      desc: "现价 ÷ 200 日简单均线。低于 0.8 少见，高于 2.4 多出现在牛市顶部附近。", src: "blockchain.com 每日均价" }));
    if (M.mvrv != null) T.push(tile({ lbl: "MVRV", val: num(M.mvrv, 2), z: zone(M.mvrv, [[1, "good", "低于持币成本"], [2.4, "mid", "正常"], [3.5, "warn", "偏热"], [Infinity, "bad", "过热"]]),
      sub: M.rp ? "已实现价格 " + usd(M.rp) + " · 数据日 " + M.mvrvDate.slice(5) : "数据日 " + M.mvrvDate,
      desc: "市值 ÷ 已实现市值。低于 1 表示现价低于全网平均持币成本。", src: "Coin Metrics 社区版" }));
    if (M.z != null) T.push(tile({ lbl: "MVRV Z-Score", val: num(M.z, 2), z: zone(M.z, [[0, "good", "低估"], [3, "mid", "正常"], [7, "warn", "偏热"], [Infinity, "bad", "泡沫区"]]),
      desc: "（市值 − 已实现市值）÷ 历史市值标准差。低于 0 是历史底部区域，高于 7 多见于周期顶部。", src: "Coin Metrics 社区版，本页计算" }));
    if (M.puell != null) T.push(tile({ lbl: "Puell 倍数", val: num(M.puell, 2), z: zone(M.puell, [[0.5, "good", "矿工投降区"], [2, "mid", "正常"], [4, "warn", "偏高"], [Infinity, "bad", "过热"]]),
      desc: "矿工今日收入 ÷ 过去 365 天日均收入。偏低说明矿工收入承压，抛售动力减弱。", src: "blockchain.com 矿工收入" }));
    $("#tiles").innerHTML = T.length ? T.join("") : '<div class="tile"><div class="t-desc">正在获取数据…</div></div>';
  }

  function renderMining() {
    var m = D.mining, a = D.adj;
    if (m && m.currentHashrate) $("#hash").textContent = num(m.currentHashrate / 1e18, 0) + " EH/s";
    if (a && a.difficultyChange != null) $("#diffchg").textContent = (a.difficultyChange >= 0 ? "+" : "") + a.difficultyChange.toFixed(1) + "% · " + (new Date(a.estimatedRetargetDate).getMonth() + 1) + "/" + new Date(a.estimatedRetargetDate).getDate();
    if (D.tip) {
      var next = Math.ceil((D.tip + 1) / 210000) * 210000, left = next - D.tip, days = left * 10 / 1440;
      var h = $("#halv"); h.textContent = Math.round(days) + " 天";
      h.parentNode.title = "当前区块 " + D.tip.toLocaleString() + "，第 " + next.toLocaleString() + " 块减半，还差 " + left.toLocaleString() + " 块；按每块 10 分钟估算，约 " + zhDate(Date.now() + days * DAY);
    }
    if (m && m.currentDifficulty) $("#lab-diff").textContent = "难度 " + (m.currentDifficulty / 1e12).toFixed(1) + " T · 区块奖励 " + reward() + " BTC";
  }
  function reward() { var h = D.tip || 0; return 50 / Math.pow(2, Math.floor(h / 210000)); }

  /* ---------- VWAP anchors ---------- */
  var ANCHORS = [["2017-01-01", "2017 年初"], ["2018-12-15", "2018 年熊市底"], ["2022-11-21", "2022 年 FTX 暴雷底"], ["2024-04-20", "第四次减半"], ["2025-01-01", "2025 年初"]];
  function renderVwap() {
    if (!D.px || !D.vol) return;
    var p = P(), rows = ANCHORS.map(function (a) {
      var usdSum = 0, btcSum = 0;
      for (var i = 0; i < D.days.length; i++) {
        var d = ymd(D.days[i]); if (d < a[0]) continue;
        var v = D.vol[d]; if (!(v > 0)) continue; usdSum += v; btcSum += v / D.px[i];
      }
      var w = btcSum ? usdSum / btcSum : null, x = w ? p / w : null;
      return "<tr><td>" + a[1] + '</td><td class="dim">' + a[0] + '</td><td class="num">' + usd(w) + '</td><td class="num">' + (x ? num(x, 2) + "×" : "—") + "</td><td>" +
        (x ? '<span class="zone ' + (x >= 1 ? "good" : "bad") + '">' + (x >= 1 ? "整体盈利" : "整体亏损") + "</span>" : "") + "</td></tr>";
    });
    $("#vwap").innerHTML = '<thead><tr><th>锚点</th><th>起始日</th><th class="num">VWAP</th><th class="num">现价 ÷ VWAP</th><th>这段时间进场的人</th></tr></thead><tbody>' + rows.join("") + "</tbody>";
  }

  /* ---------- miners ---------- */
  var MINERS = [ // name, TH/s, W  (manufacturer specs)
    ["Antminer U3S23 Hyd.", 1160, 11020], ["Antminer S23 Hyd.", 380, 5428], ["Whatsminer M73", 512, 7424], ["SEALMINER A2 Pro Hyd", 500, 7450],
    ["Antminer S21 Pro", 234, 3510], ["Antminer S21+ Hyd.", 319, 4785], ["Antminer S21 Hyd.", 335, 5360], ["Whatsminer M70", 310, 5270],
    ["Whatsminer M66S", 298, 5067], ["Antminer S21", 200, 3500], ["Whatsminer M60S", 186, 3422], ["Whatsminer M63S", 390, 7215],
    ["Antminer T21", 190, 3610], ["Antminer S19 XP Hyd.", 255, 5304], ["Antminer S19 XP", 140, 3010], ["Whatsminer M50S++", 150, 3276],
    ["Whatsminer M50S+", 140, 3080], ["Avalon A1466", 150, 3350], ["Whatsminer M56S++", 230, 5290], ["Antminer S19j Pro+", 122, 3355],
    ["Whatsminer M50", 118, 3276], ["Antminer S19j Pro", 104, 3068]
  ];
  function renderMiners() {
    var diff = D.mining && D.mining.currentDifficulty, el = +$("#elec").value, p = P();
    $("#elec-v").textContent = "$" + el.toFixed(3) + "/kWh";
    if (!diff || !D.tip) { $("#miners").innerHTML = '<tbody><tr><td class="dim">正在获取难度…</td></tr></tbody>'; return; }
    var R = reward();
    var rows = MINERS.map(function (m) {
      var btcDay = 86400 * m[1] * 1e12 * R / (diff * Math.pow(2, 32)), costDay = m[2] / 1000 * 24 * el;
      return { n: m[0], th: m[1], w: m[2], eff: m[2] / m[1], sp: costDay / btcDay };
    }).sort(function (a, b) { return a.sp - b.sp; });
    var ok = rows.filter(function (r) { return p > r.sp; }).length, sp = rows.map(function (r) { return r.sp; }), med = sp[Math.floor(sp.length / 2)];
    $("#lab-sum").innerHTML = "现价 " + usd(p) + " 下 <b>" + ok + "/" + rows.length + "</b> 款矿机还在赚钱 · 关机价中位数 <b>" + usd(med) + "</b>";
    $("#miners").innerHTML = '<thead><tr><th>矿机</th><th class="num">算力</th><th class="num">功耗</th><th class="num">能效</th><th class="num">关机价</th><th>按现价</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var good = p > r.sp;
        return "<tr" + (good ? "" : ' class="dim"') + "><td>" + esc(r.n) + '</td><td class="num">' + r.th + ' TH/s</td><td class="num">' + r.w.toLocaleString() + ' W</td><td class="num">' + r.eff.toFixed(1) + ' W/TH</td><td class="num">' + usd(r.sp) + "</td><td>" +
          '<span class="zone ' + (good ? "good" : "bad") + '">' + (good ? "盈利" : "亏损") + "</span></td></tr>";
      }).join("") + "</tbody>";
  }
  $("#elec").addEventListener("input", renderMiners);

  /* ---------- chart: price vs 200WMA vs realized price (log) ---------- */
  var CH = null, RANGE = 4;
  function buildChart() {
    if (!D.px) return;
    var rpBy = {};
    if (D.cm) D.cm.forEach(function (o) { rpBy[o.d] = o; });
    var pts = [];
    for (var i = 0; i < D.days.length; i++) {
      var d = ymd(D.days[i]), w = wmaAt(i), c = rpBy[d];
      if (D.days[i] < Date.UTC(2013, 0, 1)) continue;
      pts.push({ t: D.days[i], d: d, p: D.px[i], w: w, r: c ? D.px[i] / c.mvrv : null });
    }
    CH = pts; drawChart(); buildTable();
  }
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  var SERIES = [["p", "价格", "--s1"], ["w", "200 周均线", "--s2"], ["r", "已实现价格", "--s3"]];
  function drawChart() {
    var box = $("#chartbox"), tip = $("#tip");
    if (!CH || !CH.length) return;
    var from = RANGE ? Date.now() - RANGE * 365 * DAY : 0;
    var all = CH.filter(function (o) { return o.t >= from; });
    var step = Math.max(1, Math.ceil(all.length / 700)), pts = all.filter(function (o, i) { return i % step === 0 || i === all.length - 1; });
    var W = Math.max(320, box.clientWidth || 820), H = W < 520 ? 240 : 300, L = 46, Rm = 12, Tp = 10, B = 24;
    var lo = Infinity, hi = 0;
    pts.forEach(function (o) { SERIES.forEach(function (s) { var v = o[s[0]]; if (v > 0) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); });
    var y0 = Math.log10(lo) - 0.04, y1 = Math.log10(hi) + 0.04, t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    var X = function (t) { return L + (t - t0) / (t1 - t0) * (W - L - Rm); }, Y = function (v) { return Tp + (y1 - Math.log10(v)) / (y1 - y0) * (H - Tp - B); };
    // ticks: 1/2/5 × 10^k inside range, thinned to <= 6
    var ticks = [];
    for (var e = Math.floor(y0); e <= Math.ceil(y1); e++) [1, 2, 5].forEach(function (m) { var v = m * Math.pow(10, e); if (Math.log10(v) >= y0 && Math.log10(v) <= y1) ticks.push(v); });
    if (ticks.length > 6) ticks = ticks.filter(function (v) { return String(v)[0] === "1"; });
    var grid = css("--grid"), ink3 = css("--ink-ter"), surf = css("--panel");
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="BTC 价格、200 周均线与已实现价格，对数坐标">';
    ticks.forEach(function (v) { var y = Y(v).toFixed(1); svg += '<line x1="' + L + '" x2="' + (W - Rm) + '" y1="' + y + '" y2="' + y + '" stroke="' + grid + '" stroke-width="1"/><text x="' + (L - 6) + '" y="' + y + '" dy="0.32em" text-anchor="end" font-size="11" fill="' + ink3 + '">' + compact(v) + "</text>"; });
    var yrs = [], y = new Date(t0).getUTCFullYear() + 1;
    for (; Date.UTC(y, 0, 1) <= t1; y++) yrs.push(y);
    var every = Math.ceil(yrs.length / 7);
    yrs.forEach(function (yr, i) { if (i % every) return; var x = X(Date.UTC(yr, 0, 1)).toFixed(1); svg += '<text x="' + x + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="' + ink3 + '">' + yr + "</text>"; });
    SERIES.slice().reverse().forEach(function (s) {
      var dpath = "", pen = false;
      pts.forEach(function (o) { var v = o[s[0]]; if (v > 0) { dpath += (pen ? "L" : "M") + X(o.t).toFixed(1) + " " + Y(v).toFixed(1); pen = true; } else pen = false; });
      svg += '<path d="' + dpath + '" fill="none" stroke="' + css(s[2]) + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
      var lastPt = null; for (var i = pts.length - 1; i >= 0; i--) if (pts[i][s[0]] > 0) { lastPt = pts[i]; break; }
      if (lastPt) svg += '<circle cx="' + X(lastPt.t).toFixed(1) + '" cy="' + Y(lastPt[s[0]]).toFixed(1) + '" r="4" fill="' + css(s[2]) + '" stroke="' + surf + '" stroke-width="2"/>';
    });
    svg += '<line id="xh" y1="' + Tp + '" y2="' + (H - B) + '" stroke="' + ink3 + '" stroke-width="1" opacity="0"/><g id="xd"></g>';
    svg += '<rect x="' + L + '" y="0" width="' + (W - L - Rm) + '" height="' + (H - B) + '" fill="transparent" id="hit"/></svg>';
    box.innerHTML = svg; box.appendChild(tip);
    $("#legend").innerHTML = SERIES.map(function (s) { return '<span><i style="background:' + css(s[2]) + '"></i>' + s[1] + "</span>"; }).join("");
    var svgEl = box.querySelector("svg"), xh = svgEl.querySelector("#xh"), xd = svgEl.querySelector("#xd");
    function move(ev) {
      var r = svgEl.getBoundingClientRect(), sx = (ev.clientX - r.left) * W / r.width;
      var t = t0 + (sx - L) / (W - L - Rm) * (t1 - t0), best = pts[0];
      for (var i = 0; i < pts.length; i++) if (Math.abs(pts[i].t - t) < Math.abs(best.t - t)) best = pts[i];
      var x = X(best.t); xh.setAttribute("x1", x); xh.setAttribute("x2", x); xh.setAttribute("opacity", ".5");
      xd.innerHTML = SERIES.map(function (s) { var v = best[s[0]]; return v > 0 ? '<circle cx="' + x + '" cy="' + Y(v) + '" r="4" fill="' + css(s[2]) + '" stroke="' + surf + '" stroke-width="2"/>' : ""; }).join("");
      tip.innerHTML = "<b>" + best.d + "</b><br>" + SERIES.map(function (s) { var v = best[s[0]]; return v > 0 ? '<span class="sw" style="background:' + css(s[2]) + '"></span>' + s[1] + " " + usd(v) : ""; }).filter(Boolean).join("<br>");
      tip.style.display = "block";
      var px = x * r.width / W, tw = tip.offsetWidth;
      tip.style.left = Math.min(Math.max(0, px + 12 + tw > r.width ? px - tw - 12 : px + 12), r.width - tw) + "px"; tip.style.top = "8px";
    }
    function leave() { tip.style.display = "none"; xh.setAttribute("opacity", "0"); xd.innerHTML = ""; }
    var hit = svgEl.querySelector("#hit");
    hit.addEventListener("mousemove", move); hit.addEventListener("mouseleave", leave);
    hit.addEventListener("touchstart", function (e) { move(e.touches[0]); }, { passive: true });
    hit.addEventListener("touchmove", function (e) { move(e.touches[0]); }, { passive: true });
    hit.addEventListener("touchend", leave);
  }
  function buildTable() {
    var rows = [], seen = {};
    for (var i = CH.length - 1; i >= 0; i--) { var m = CH[i].d.slice(0, 7); if (seen[m]) continue; seen[m] = 1; rows.push(CH[i]); }
    $("#charttable").innerHTML = '<thead><tr><th>日期</th><th class="num">价格</th><th class="num">200 周均线</th><th class="num">已实现价格</th></tr></thead><tbody>' +
      rows.map(function (o) { return "<tr><td>" + o.d + '</td><td class="num">' + usd(o.p) + '</td><td class="num">' + usd(o.w) + '</td><td class="num">' + usd(o.r) + "</td></tr>"; }).join("") + "</tbody>";
  }
  $("#ranges").addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b) return; RANGE = +b.dataset.r;
    document.querySelectorAll("#ranges .chip").forEach(function (c) { c.classList.toggle("on", c === b); }); drawChart();
  });
  var rz; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(drawChart, 150); });

  /* ---------- run ---------- */
  function renderAll() { renderPrice(); renderTiles(); renderMining(); renderMiners(); renderVwap(); $("#src-upd").textContent = "上次刷新 " + hm(Date.now()); }
  function slow() {
    return Promise.all([loadDaily(), loadVol(), loadRev(), loadCM(), loadMining(), loadFng()].map(function (p) { return p.catch(function () {}); }))
      .then(function () { renderAll(); buildChart(); });
  }
  renderSrc(); applyTheme(); renderTiles();
  livePrice(); load24h(); slow();
  setInterval(function () { livePrice(); }, 15000);
  setInterval(function () { load24h(); slow(); }, 10 * 60 * 1000);
})();
