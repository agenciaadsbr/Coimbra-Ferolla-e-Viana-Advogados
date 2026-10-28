/* Painel de leads — Coimbra Ferolla e Viana Advogados
 * Lê lp_visits / lp_leads (site = CFV_CONFIG.site) com sessão autenticada.
 * A leitura só funciona para usuários ligados ao site em public.lp_acessos (RLS).
 */
(function () {
  "use strict";
  /* Valores padrão: a página funciona mesmo se config.js não for publicado.
     O config.js, quando existe, sobrescreve qualquer item abaixo. */
  var DEFAULTS = {
    site: "coimbra-ferolla-viana",
    pageKey: "trabalhista",
    office: { name: "Coimbra Ferolla e Viana Advogados", oab: "" },
    whatsapp: { number: "", confirmed: false,
      message: "Olá, preenchi o formulário da página de Direito Trabalhista da Coimbra Ferolla e Viana Advogados e gostaria de conversar." },
    backend: {
      supabaseUrl: "https://qxhnjzyhtllmtdrcyygi.supabase.co",
      supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aG5qenlodGxsbXRkcmN5eWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMzczNjgsImV4cCI6MjA5NzgxMzM2OH0.DWf4I_x9F--H7ZZHUt_n4V3B__Nlsf1jNZdUV0vNBLU",
      timeoutMs: 12000
    },
    redirect: { path: "/redirect.html", delayMs: 3000 },
    tracking: { metaPixelId: "", googleTagId: "", googleAdsConversionLabel: "" },
    privacyPolicyUrl: ""
  };
  var CFG = (function (d, c) {
    c = c || {};
    var out = {};
    Object.keys(d).forEach(function (k) {
      var dv = d[k], cv = c[k];
      if (dv && typeof dv === "object") out[k] = Object.assign({}, dv, cv && typeof cv === "object" ? cv : {});
      else out[k] = cv !== undefined && cv !== "" ? cv : dv;
    });
    Object.keys(c).forEach(function (k) { if (!(k in out)) out[k] = c[k]; });
    return out;
  })(DEFAULTS, window.CFV_CONFIG);
  var B = CFG.backend || {};
  var SITE = CFG.site;
  var TZ = "America/Sao_Paulo";
  // usuário exibido -> e-mail técnico no Supabase Auth
  var USERS = { admin: "admin@coimbra-ferolla-viana.adsbr.internal" };
  var CLIENT_NAME = "Coimbra Ferolla e Viana Advogados";
  var LP_NAMES = { trabalhista: "Direito Trabalhista", familia: "Direito de Família" };
  var PATH_TO_LP = { "/": "trabalhista", "/index.html": "trabalhista", "/trabalhista": "trabalhista", "/familia": "familia", "/familia.html": "familia" };

  // Bloqueia o envio nativo antes de qualquer outra coisa (evita usuário/senha na URL)
  var loginForm = document.getElementById("login-form");
  if (loginForm) loginForm.addEventListener("submit", function (e) { e.preventDefault(); }, true);

  var sb = null;
  try {
    sb = window.supabase.createClient(B.supabaseUrl, B.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "cfv-dash-auth" }
    });
  } catch (e) {
    var le = document.getElementById("login-err");
    if (le) { le.textContent = "Não foi possível carregar o painel. Atualize a página."; le.hidden = false; }
    if (window.console) console.error("[cfv-dash] Supabase indisponível", e);
    return;
  }

  var $ = function (id) { return document.getElementById(id); };
  var chart = null;

  /* ---------- utilidades ---------- */
  var dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  var dtFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  function dayKey(iso) { return dayFmt.format(new Date(iso)); }               // AAAA-MM-DD no fuso de SP
  function todayKey() { return dayFmt.format(new Date()); }
  function addDays(key, n) { var d = new Date(key + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function startIso(key) { return new Date(key + "T00:00:00-03:00").toISOString(); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pct(l, v) { return v > 0 ? (l / v * 100) : 0; }
  function fmtPct(x) { return x.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%"; }

  function phoneDigits(w) {
    var d = String(w || "").replace(/\D/g, "");
    if (d.length === 10 || d.length === 11) d = "55" + d;
    return d;
  }
  function fmtPhone(w) {
    var d = phoneDigits(w);
    var l = d.indexOf("55") === 0 ? d.slice(2) : d;
    if (l.length === 11) return "(" + l.slice(0, 2) + ") " + l.slice(2, 7) + "-" + l.slice(7);
    if (l.length === 10) return "(" + l.slice(0, 2) + ") " + l.slice(2, 6) + "-" + l.slice(6);
    return w || "";
  }
  function lpFromOrigem(o) {
    var parts = String(o || "").split("|");
    var key = parts.length > 1 ? parts[parts.length - 1].trim().toLowerCase() : "trabalhista";
    return key || "trabalhista";
  }
  function fonteFromOrigem(o) { var p = String(o || "").split("|"); return (p.length > 1 ? p.slice(0, -1).join("|") : p[0]).trim() || "direto"; }
  function lpFromPath(p) { return PATH_TO_LP[p || "/"] || (p || "/"); }
  function lpName(k) { return LP_NAMES[k] || k; }

  /* ---------- busca paginada ---------- */
  function fetchAll(table, cols, fromIso, toIso) {
    var out = [], page = 1000;
    function step(offset) {
      return sb.from(table).select(cols).eq("site", SITE)
        .gte("created_at", fromIso).lt("created_at", toIso)
        .order("created_at", { ascending: false })
        .range(offset, offset + page - 1)
        .then(function (r) {
          if (r.error) throw r.error;
          out = out.concat(r.data || []);
          if ((r.data || []).length === page && out.length < 50000) return step(offset + page);
          return out;
        });
    }
    return step(0);
  }

  /* ---------- renderização ---------- */
  function renderChart(days, visits, leads) {
    var conv = days.map(function (_, i) { return +pct(leads[i], visits[i]).toFixed(1); });
    var labels = days.map(function (k) { return k.slice(8, 10) + "/" + k.slice(5, 7); });
    var data = {
      labels: labels,
      datasets: [
        { label: "Visitas", data: visits, borderColor: "#A1A1A1", backgroundColor: "#A1A1A1", yAxisID: "y", cubicInterpolationMode: "monotone", pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 },
        { label: "Cadastros", data: leads, borderColor: "#E5B54A", backgroundColor: "#E5B54A", yAxisID: "y", cubicInterpolationMode: "monotone", pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 },
        { label: "Conversão %", data: conv, borderColor: "#5EB98A", backgroundColor: "#5EB98A", yAxisID: "y2", cubicInterpolationMode: "monotone", pointRadius: 0, pointHoverRadius: 4, borderWidth: 1.5, borderDash: [4, 4] }
      ]
    };
    var grid = { color: "rgba(255,255,255,.06)", drawTicks: false };
    var ticks = { color: "#737373", font: { size: 11 } };
    var opts = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: "#1F1F1F", borderColor: "#333", borderWidth: 1, titleColor: "#EDEDED", bodyColor: "#A1A1A1",
          callbacks: { label: function (c) { return " " + c.dataset.label + ": " + (c.dataset.yAxisID === "y2" ? fmtPct(c.parsed.y) : c.parsed.y); } } }
      },
      scales: {
        x: { grid: { display: false }, ticks: Object.assign({ maxRotation: 0, autoSkipPadding: 12 }, ticks), border: { color: "#262626" } },
        y: { beginAtZero: true, grid: grid, ticks: Object.assign({ precision: 0, padding: 8 }, ticks), border: { display: false } },
        y2: { beginAtZero: true, position: "right", grid: { display: false }, ticks: Object.assign({ padding: 8, callback: function (v) { return v + "%"; } }, ticks), border: { display: false } }
      }
    };
    if (chart) { chart.data = data; chart.update(); }
    else chart = new window.Chart($("chart"), { type: "line", data: data, options: opts });
  }

  function renderLpTable(visits, leads) {
    var map = {};
    visits.forEach(function (v) { var k = lpFromPath(v.path); (map[k] = map[k] || { v: 0, l: 0 }).v++; });
    leads.forEach(function (l) { var k = lpFromOrigem(l.origem); (map[k] = map[k] || { v: 0, l: 0 }).l++; });
    var keys = Object.keys(map).sort(function (a, b) { return map[b].v - map[a].v; });
    $("tb-lp").innerHTML = keys.length ? keys.map(function (k) {
      var r = map[k];
      return "<tr><td>" + esc(lpName(k)) + "</td><td class=\"num\">" + r.v + "</td><td class=\"num\">" + r.l + "</td><td class=\"num\">" + (r.v ? fmtPct(pct(r.l, r.v)) : "—") + "</td></tr>";
    }).join("") : '<tr><td colspan="4" class="empty">Nenhum dado encontrado</td></tr>';
  }

  var WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.16c-.24.69-1.42 1.32-1.96 1.37-.5.05-.97.23-3.27-.68-2.77-1.09-4.52-3.92-4.66-4.1-.13-.18-1.11-1.48-1.11-2.82 0-1.34.7-2 .95-2.27.25-.27.54-.34.72-.34h.52c.17 0 .39-.06.61.47.24.56.79 1.92.86 2.06.07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.71 1.17 1.52 1.9 1.05.93 1.93 1.22 2.2 1.36.27.14.43.11.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.23.61-.14.25.09 1.59.75 1.86.89.27.14.45.2.52.32.07.11.07.66-.17 1.35Z"/></svg>';

  function renderLeads(leads) {
    $("tb-leads").innerHTML = leads.length ? leads.map(function (l) {
      var first = String(l.nome || "").trim().split(/\s+/)[0] || "";
      var msg = "Olá, " + first + ". Recebemos seu contato através da " + CLIENT_NAME + " e gostaria de dar continuidade ao seu atendimento.";
      var digits = phoneDigits(l.whatsapp);
      var link = "https://wa.me/" + digits + "?text=" + encodeURIComponent(msg);
      return "<tr><td>" + esc(l.nome) + "</td><td>" + esc(fmtPhone(l.whatsapp)) + "</td><td class=\"muted\">" + esc(lpName(lpFromOrigem(l.origem))) +
        "</td><td class=\"origem\" title=\"" + esc(l.origem) + "\">" + esc(fonteFromOrigem(l.origem)) + "</td><td class=\"muted\">" + esc(dtFmt.format(new Date(l.created_at))) +
        "</td><td>" + (digits.length >= 12 ? "<a class=\"wa-btn\" href=\"" + esc(link) + "\" target=\"_blank\" rel=\"noopener\">" + WA_ICON + "WhatsApp</a>" : "—") + "</td></tr>";
    }).join("") : '<tr><td colspan="6" class="empty">Nenhum lead encontrado</td></tr>';
  }

  /* ---------- carregamento ---------- */
  var loading = 0;
  function load() {
    var de = $("f-de").value, ate = $("f-ate").value;
    if (!de || !ate) return;
    if (de > ate) { var t = de; de = ate; ate = t; $("f-de").value = de; $("f-ate").value = ate; }
    var fromIso = startIso(de), toIso = startIso(addDays(ate, 1));
    var ticket = ++loading;
    $("status").className = "status"; $("status").textContent = "Atualizando…";
    Promise.all([
      fetchAll("lp_visits", "created_at,path", fromIso, toIso),
      fetchAll("lp_leads", "nome,whatsapp,origem,created_at", fromIso, toIso),
      sb.from("lp_leads").select("id", { count: "exact", head: true }).eq("site", SITE)
    ]).then(function (res) {
      if (ticket !== loading) return;
      var visits = res[0], leads = res[1], total = (res[2] && res[2].count) || 0;
      var days = [], k = de;
      while (k <= ate && days.length < 400) { days.push(k); k = addDays(k, 1); }
      var vMap = {}, lMap = {};
      visits.forEach(function (v) { var d = dayKey(v.created_at); vMap[d] = (vMap[d] || 0) + 1; });
      leads.forEach(function (l) { var d = dayKey(l.created_at); lMap[d] = (lMap[d] || 0) + 1; });
      renderChart(days, days.map(function (d) { return vMap[d] || 0; }), days.map(function (d) { return lMap[d] || 0; }));
      $("sum-v").textContent = visits.length; $("sum-l").textContent = leads.length; $("sum-c").textContent = fmtPct(pct(leads.length, visits.length));
      renderLpTable(visits, leads);
      renderLeads(leads);
      $("total-line").textContent = total + (total === 1 ? " lead no total" : " leads no total") + " · " + leads.length + " no período";
      $("status").textContent = "";
    }).catch(function (e) {
      if (ticket !== loading) return;
      $("status").className = "status err";
      $("status").textContent = "Não foi possível carregar os dados. Tente atualizar a página.";
      if (window.console) console.error("[cfv-dash]", e);
    });
  }

  /* ---------- sessão ---------- */
  function showDash() {
    $("view-login").hidden = true; $("view-dash").hidden = false;
    if (!$("f-ate").value) { $("f-ate").value = todayKey(); $("f-de").value = addDays(todayKey(), -29); }
    load();
  }
  function showLogin() { $("view-dash").hidden = true; $("view-login").hidden = false; $("login-pass").focus(); }

  $("login-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var u = $("login-user").value.trim().toLowerCase(), p = $("login-pass").value;
    var email = USERS[u] || (u.indexOf("@") > 0 ? u : null);
    var err = $("login-err"), btn = $("login-btn");
    if (!email || !p) { err.textContent = "Informe usuário e senha."; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = "Entrando…"; err.hidden = true;
    sb.auth.signInWithPassword({ email: email, password: p }).then(function (r) {
      btn.disabled = false; btn.textContent = "Entrar";
      if (r.error) { err.textContent = "Usuário ou senha incorretos."; err.hidden = false; return; }
      $("login-pass").value = "";
      showDash();
    }, function () {
      btn.disabled = false; btn.textContent = "Entrar";
      err.textContent = "Sem conexão com o servidor. Tente novamente."; err.hidden = false;
    });
  });
  $("logout").addEventListener("click", function () { sb.auth.signOut().finally(showLogin); });
  $("f-de").addEventListener("change", load);
  $("f-ate").addEventListener("change", load);

  sb.auth.getSession().then(function (r) { if (r.data && r.data.session) showDash(); else showLogin(); }, showLogin);

  window.CFV_DASH = { phoneDigits: phoneDigits, fmtPhone: fmtPhone, lpFromOrigem: lpFromOrigem, fonteFromOrigem: fonteFromOrigem, dayKey: dayKey };
})();
