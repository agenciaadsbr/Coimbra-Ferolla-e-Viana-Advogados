/* Rota /redirect — abre o WhatsApp do escritório somente com número confirmado. */
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
  var wa = CFG.whatsapp || {};

  /** Número válido para wa.me: só dígitos, DDI 55 + DDD + 8 ou 9 dígitos. */
  function validWaNumber(n) {
    var d = String(n || "").replace(/\D/g, "");
    return /^55[1-9]\d(9\d{8}|[2-5]\d{7})$/.test(d) ? d : null;
  }

  function buildWaUrl(number, message) {
    return "https://wa.me/" + number + "?text=" + encodeURIComponent(message || "");
  }

  function boot() {
    var number = wa.confirmed ? validWaNumber(wa.number) : null;
    var openEl = document.getElementById("rd-open");
    var pendEl = document.getElementById("rd-pending");

    if (!number) {
      // Sem número confirmado: nunca publicar um link de WhatsApp possivelmente inválido.
      pendEl.hidden = false;
      if (window.console) console.warn("[cfv] WhatsApp do escritório ainda não confirmado em config.js — redirecionamento desativado.");
      return;
    }

    var url = buildWaUrl(number, wa.message);
    var delay = (CFG.redirect && CFG.redirect.delayMs) || 3000;
    var btn = document.getElementById("rd-btn");
    var bar = document.getElementById("rd-bar");
    btn.href = url;
    openEl.hidden = false;
    bar.style.setProperty("--rd-ms", delay + "ms");
    requestAnimationFrame(function () { requestAnimationFrame(function () { bar.classList.add("run"); }); });
    setTimeout(function () { location.href = url; }, delay);
  }

  window.CFV_REDIRECT = { validWaNumber: validWaNumber, buildWaUrl: buildWaUrl };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
