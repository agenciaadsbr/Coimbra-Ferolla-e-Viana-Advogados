/* Rota /redirect — abre o WhatsApp do escritório somente com número confirmado. */
(function () {
  "use strict";
  var CFG = window.CFV_CONFIG || {};
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
