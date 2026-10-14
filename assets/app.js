/* LP Direito Trabalhista — Coimbra Ferolla e Viana Advogados
 * Captura de atribuição (UTM / gclid / fbclid), validação do formulário,
 * envio ao backend (Supabase RPC) e encaminhamento para /redirect.
 */
(function () {
  "use strict";

  var CFG = window.CFV_CONFIG || {};
  var ATTR_KEY = "cfv_attr_v1";
  var LEAD_KEY = "cfv_lead_ok_v1";
  var ATTR_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id",
    "gclid", "gbraid", "wbraid", "fbclid", "campaign_id", "adset_id", "ad_id"];

  /* ---------- armazenamento seguro ---------- */
  function store(kind) {
    try { var s = window[kind]; var k = "__cfv_t"; s.setItem(k, "1"); s.removeItem(k); return s; } catch (e) { return null; }
  }
  var LS = store("localStorage");
  var SS = store("sessionStorage");
  function readJSON(s, k) { if (!s) return null; try { return JSON.parse(s.getItem(k) || "null"); } catch (e) { return null; } }
  function writeJSON(s, k, v) { if (!s) return; try { s.setItem(k, JSON.stringify(v)); } catch (e) { /* ignora */ } }

  /* ---------- atribuição de campanha ---------- */
  function clip(v, n) { return String(v == null ? "" : v).slice(0, n || 300); }

  function captureAttribution(search, href, referrer) {
    var params;
    try { params = new URLSearchParams(search || ""); } catch (e) { params = null; }
    var current = {};
    var found = false;
    if (params) {
      ATTR_FIELDS.forEach(function (f) {
        var v = params.get(f);
        if (v) { current[f] = clip(v, 300); found = true; }
      });
    }
    var saved = readJSON(LS, ATTR_KEY) || readJSON(SS, ATTR_KEY) || {};
    var now = new Date().toISOString();
    if (found) {
      // last-touch: parâmetros novos substituem os anteriores; first-touch preservado
      if (!saved.first) saved.first = { at: now, params: current };
      saved.last = { at: now, params: current, landing_url: clip(href, 600), referrer: clip(referrer, 600) };
    } else if (!saved.last) {
      saved.last = { at: now, params: {}, landing_url: clip(href, 600), referrer: clip(referrer, 600) };
    }
    writeJSON(LS, ATTR_KEY, saved);
    writeJSON(SS, ATTR_KEY, saved);
    return saved;
  }

  function buildTracking(saved) {
    var last = (saved && saved.last) || {};
    var p = last.params || {};
    var t = {};
    ATTR_FIELDS.forEach(function (f) { if (p[f]) t[f] = p[f]; });
    t.landing_url = last.landing_url || "";
    t.referrer = last.referrer || "";
    if (saved && saved.first && saved.first.params) t.first_touch = saved.first.params;
    t.page_url = clip(location.href.split("#")[0], 600);
    t.user_agent = clip(navigator.userAgent, 300);
    return t;
  }

  /* ---------- telefone ---------- */
  var DDD = [11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,
    61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99];

  function phoneDigits(raw) {
    var d = String(raw || "").replace(/\D/g, "");
    if (d.length >= 12 && d.indexOf("55") === 0) d = d.slice(2);   // DDI informado
    if (d.length >= 11 && d.charAt(0) === "0") d = d.replace(/^0+/, ""); // prefixo de longa distância
    return d;
  }

  /** Retorna o número em E.164 (+55…) ou null se inválido. Aceita celular (11 dígitos) e fixo (10). */
  function normalizePhone(raw) {
    var d = phoneDigits(raw);
    if (d.length !== 10 && d.length !== 11) return null;
    var ddd = parseInt(d.slice(0, 2), 10);
    if (DDD.indexOf(ddd) === -1) return null;
    var first = d.charAt(2);
    if (d.length === 11 && first !== "9") return null;
    if (d.length === 10 && !/[2-5]/.test(first)) return null;
    if (/^(\d)\1+$/.test(d.slice(2))) return null; // 99999-9999, 00000-0000…
    return "+55" + d;
  }

  function maskPhone(raw) {
    var d = phoneDigits(raw).slice(0, 11);
    if (d.length === 0) return "";
    if (d.length <= 2) return "(" + d;
    var ddd = d.slice(0, 2), rest = d.slice(2);
    if (rest.length <= 4) return "(" + ddd + ") " + rest;
    if (d.length <= 10) return "(" + ddd + ") " + rest.slice(0, 4) + "-" + rest.slice(4);
    return "(" + ddd + ") " + rest.slice(0, 5) + "-" + rest.slice(5);
  }

  function cleanName(raw) { return String(raw || "").replace(/\s+/g, " ").trim(); }
  function validateName(n) {
    if (n.length < 2) return "Informe seu nome.";
    if (n.length > 120) return "O nome pode ter até 120 caracteres.";
    if (!/\p{L}/u.test(n)) return "Informe seu nome usando letras.";
    return "";
  }

  /* ---------- envio ---------- */
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach(function (_, i) { b[i] = Math.random() * 256 | 0; });
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  function backendReady() {
    var b = CFG.backend || {};
    return !!(b.supabaseUrl && b.supabaseAnonKey && CFG.site);
  }

  function restInsert(table, row, timeoutMs) {
    var b = CFG.backend || {};
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || b.timeoutMs || 12000) : null;
    return fetch(b.supabaseUrl.replace(/\/$/, "") + "/rest/v1/" + table, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": b.supabaseAnonKey,
        "Authorization": "Bearer " + b.supabaseAnonKey,
        // anon só tem permissão de inserir (RLS); não pedimos o registro de volta
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(row),
      keepalive: table === "lp_visits",
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      // 201 Created = registro gravado no banco
      if (res.status !== 201 && res.status !== 204) throw { code: "http_" + res.status };
      return true;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw { code: err && err.name === "AbortError" ? "timeout" : "network" };
    });
  }

  function submitLead(row) {
    if (!backendReady()) return Promise.reject({ code: "not_configured" });
    return restInsert("lp_leads", row);
  }

  /* Origem legível para o painel: fonte · campanha | página */
  function buildOrigem(t) {
    var fonte = "";
    if (t.utm_source) fonte = t.utm_source + (t.utm_medium ? "/" + t.utm_medium : "");
    else if (t.gclid || t.gbraid || t.wbraid) fonte = "google-ads";
    else if (t.fbclid) fonte = "meta-ads";
    else if (t.referrer) {
      try { var h = new URL(t.referrer).hostname.replace(/^www\./, ""); if (h && h !== location.hostname.replace(/^www\./, "")) fonte = h; } catch (e) {}
    }
    if (!fonte) fonte = "direto";
    var out = fonte + (t.utm_campaign ? " · " + t.utm_campaign : "") + " | " + (CFG.pageKey || "trabalhista");
    return out.slice(0, 200);
  }

  /* 1 visita por carregamento da página */
  function trackVisit() {
    if (!backendReady()) return;
    var ref = document.referrer || "";
    restInsert("lp_visits", { site: CFG.site, referrer: ref ? ref.slice(0, 500) : null, path: location.pathname.slice(0, 200) }, 8000)
      .catch(function (e) { if (window.console) console.warn("[cfv] visita não registrada:", e && e.code); });
  }

  /* ---------- mensuração (só com IDs reais e só após confirmação) ---------- */
  function initTracking() {
    var t = CFG.tracking || {};
    if (t.metaPixelId) {
      /* Meta Pixel base */
      !function (f, b, e, v, n, s, x) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; s = b.createElement(e); s.async = !0; s.src = v;
        x = b.getElementsByTagName(e)[0]; x.parentNode.insertBefore(s, x); }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      window.fbq("init", t.metaPixelId);
      window.fbq("track", "PageView");
    }
    if (t.googleTagId) {
      var s = document.createElement("script");
      s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(t.googleTagId);
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date());
      window.gtag("config", t.googleTagId);
    }
  }
  function trackLeadConfirmed(leadId) {
    var t = CFG.tracking || {};
    try {
      if (t.metaPixelId && window.fbq) window.fbq("track", "Lead", { content_name: "Direito Trabalhista" }, { eventID: String(leadId) });
      if (t.googleTagId && window.gtag) {
        window.gtag("event", "generate_lead", { form_id: "lead-form", page: CFG.pageKey });
        if (t.googleAdsConversionLabel) window.gtag("event", "conversion", { send_to: t.googleAdsConversionLabel, transaction_id: String(leadId) });
      }
    } catch (e) { /* mensuração nunca bloqueia o fluxo */ }
  }

  /* ---------- UI ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }

  function setFieldError(input, errEl, msg) {
    if (msg) { input.setAttribute("aria-invalid", "true"); errEl.textContent = msg; errEl.hidden = false; }
    else { input.removeAttribute("aria-invalid"); errEl.textContent = ""; errEl.hidden = true; }
  }

  function showStatus(el, kind, msg) {
    el.className = "form-status is-" + kind;
    el.textContent = msg;
    el.hidden = false;
  }

  var ERROR_MSG = {
    not_configured: "O envio ainda não está ativo nesta versão da página. Seus dados não foram registrados.",
    timeout: "O envio demorou mais que o esperado e não foi confirmado. Verifique sua conexão e tente novamente.",
    network: "Não foi possível enviar seus dados agora. Verifique sua conexão e tente novamente.",
    invalid: "Confira o nome e o WhatsApp informados e tente novamente.",
    generic: "Não conseguimos confirmar o envio. Tente novamente em instantes."
  };

  function initForm() {
    var form = $("#lead-form");
    if (!form) return;
    var nome = $("#lead-nome"), tel = $("#lead-whatsapp");
    var errNome = $("#err-nome"), errTel = $("#err-whatsapp");
    var status = $("#form-status"), btn = $("#lead-submit");
    var submissionId = null; // mantido entre tentativas para evitar lead duplicado
    var sending = false;

    tel.addEventListener("input", function () {
      var atEnd = tel.selectionStart === tel.value.length;
      var masked = maskPhone(tel.value);
      if (masked !== tel.value) {
        tel.value = masked;
        if (atEnd) try { tel.setSelectionRange(masked.length, masked.length); } catch (e) {}
      }
      if (tel.getAttribute("aria-invalid") && normalizePhone(tel.value)) setFieldError(tel, errTel, "");
    });
    tel.addEventListener("blur", function () {
      if (tel.value && !normalizePhone(tel.value)) setFieldError(tel, errTel, "Informe um WhatsApp válido com DDD, por exemplo (32) 99999-9999.");
    });
    nome.addEventListener("input", function () {
      if (nome.getAttribute("aria-invalid") && !validateName(cleanName(nome.value))) setFieldError(nome, errNome, "");
    });
    [nome, tel].forEach(function (el) {
      el.addEventListener("input", function () { submissionId = null; if (!status.classList.contains("is-success")) status.hidden = true; });
    });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (sending) return;
      var n = cleanName(nome.value);
      var nErr = validateName(n);
      var phone = normalizePhone(tel.value);
      var tErr = phone ? "" : (tel.value ? "Informe um WhatsApp válido com DDD, por exemplo (32) 99999-9999." : "Informe seu WhatsApp com DDD.");
      setFieldError(nome, errNome, nErr);
      setFieldError(tel, errTel, tErr);
      if (nErr) { nome.focus(); return; }
      if (tErr) { tel.focus(); return; }

      if (!submissionId) submissionId = uuid();
      var tracking = buildTracking(readJSON(LS, ATTR_KEY) || readJSON(SS, ATTR_KEY));
      var payload = {
        site: CFG.site,
        nome: n,
        whatsapp: phone.replace(/\D/g, ""),   // 55 + DDD + número, só dígitos
        origem: buildOrigem(tracking)
      };

      sending = true;
      form.classList.add("is-loading");
      btn.setAttribute("aria-busy", "true");
      btn.disabled = true;
      status.hidden = true;
      $(".btn-label", btn).textContent = "Enviando…";

      submitLead(payload).then(function () {
        var leadId = submissionId;
        trackLeadConfirmed(leadId);
        writeJSON(SS, LEAD_KEY, { id: leadId, at: Date.now() });
        showStatus(status, "success", "Dados recebidos. Encaminhando para o WhatsApp…");
        $(".btn-label", btn).textContent = "Enviado";
        var target = (CFG.redirect && CFG.redirect.path) || "/redirect";
        setTimeout(function () { location.assign(target); }, 400);
      }, function (err) {
        var code = (err && err.code) || "generic";
        var msg = ERROR_MSG[code] || (code === "http_400" ? ERROR_MSG.invalid : ERROR_MSG.generic);
        showStatus(status, "error", msg);
        sending = false;
        form.classList.remove("is-loading");
        btn.removeAttribute("aria-busy");
        btn.disabled = false;
        $(".btn-label", btn).textContent = "Entrar em contato";
        if (window.console) console.warn("[cfv] envio não confirmado:", code);
      });
    });
  }

  function initHeader() {
    var h = $(".site-header");
    if (!h) return;
    var on = false;
    function tick() { var s = window.scrollY > 8; if (s !== on) { on = s; h.classList.toggle("is-scrolled", s); } }
    window.addEventListener("scroll", tick, { passive: true });
    tick();
  }

  function initContent() {
    var y = $("#ano"); if (y) y.textContent = String(new Date().getFullYear());
    var o = CFG.office || {};
    if (o.oab) { var f = $(".footer-oab"); if (f) { f.textContent = " · " + o.oab; f.hidden = false; } }
    if (CFG.privacyPolicyUrl) {
      var pl = $(".privacy-link");
      if (pl) { $("a", pl).href = CFG.privacyPolicyUrl; pl.hidden = false; }
    }
    document.querySelectorAll("[data-cta]").forEach(function (a) {
      a.addEventListener("click", function () {
        // Foco no primeiro campo depois da rolagem, sem roubar foco de quem navega por teclado de outra forma
        setTimeout(function () { var n = $("#lead-nome"); if (n && !n.value) try { n.focus({ preventScroll: true }); } catch (e) {} }, 650);
      });
    });
  }


  /* Fotos: se uma imagem não carregar, mostra o fundo gráfico com ícone */
  function initPhotos() {
    document.querySelectorAll(".photo").forEach(function (box) {
      var img = box.querySelector("img");
      function fail() {
        if (box.classList.contains("is-missing")) return;
        box.classList.add("is-missing");
        var name = box.getAttribute("data-fallback");
        if (name) box.insertAdjacentHTML("beforeend", '<svg class="ico fb-ico" aria-hidden="true"><use href="#i-' + name + '"/></svg>');
      }
      if (!img) return fail();
      if (img.complete && img.naturalWidth === 0) fail();
      img.addEventListener("error", fail);
    });
  }

  /* Seletor de situações (padrão ARIA de abas) */
  function initPicker() {
    var root = $("[data-picker]");
    if (!root) return;
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        if (!panel) return;
        if (on) {
          panel.hidden = false;
          panel.classList.remove("is-entering"); void panel.offsetWidth; panel.classList.add("is-entering");
          var im = panel.querySelector("img"); if (im) im.loading = "eager";
        } else { panel.hidden = true; }
      });
      if (focus) tab.focus();
      if (tab.scrollIntoView && window.matchMedia("(max-width: 760px)").matches) {
        try { tab.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); } catch (e) {}
      }
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t, false); });
      t.addEventListener("keydown", function (e) {
        var k = e.key, n = null;
        if (k === "ArrowRight" || k === "ArrowDown") n = tabs[(i + 1) % tabs.length];
        else if (k === "ArrowLeft" || k === "ArrowUp") n = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (k === "Home") n = tabs[0];
        else if (k === "End") n = tabs[tabs.length - 1];
        if (n) { e.preventDefault(); select(n, true); }
      });
    });
  }

  /* CTA fixo no celular: some quando o formulário ou o CTA do hero estão na tela */
  function initMobileCta() {
    var bar = $(".mcta");
    if (!bar || !("IntersectionObserver" in window)) return;
    var seen = new Set();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) seen.add(en.target); else seen.delete(en.target); });
      bar.classList.toggle("is-hidden", seen.size > 0);
    }, { threshold: 0.15 });
    [$(".hero-actions"), $("#contato")].forEach(function (el) { if (el) io.observe(el); });
  }

  // expõe utilitários para testes
  window.CFV_UTILS = { normalizePhone: normalizePhone, maskPhone: maskPhone, captureAttribution: captureAttribution, buildTracking: buildTracking, buildOrigem: buildOrigem };

  captureAttribution(location.search, location.href, document.referrer);
  function boot() { initHeader(); initContent(); initPhotos(); initPicker(); initMobileCta(); initForm(); initTracking(); trackVisit(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
