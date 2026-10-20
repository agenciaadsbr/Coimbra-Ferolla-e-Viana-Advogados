/*
 * Configuração central da LP — Coimbra Ferolla e Viana Advogados (Direito Trabalhista)
 * Tudo que depende do cliente ou de acessos externos fica aqui.
 * Alterar este arquivo NÃO exige mexer no HTML, CSS ou JS da página.
 */
window.CFV_CONFIG = {
  office: {
    name: "Coimbra Ferolla e Viana Advogados",
    shortName: "Coimbra Ferolla e Viana",
    area: "Direito Trabalhista",
    city: "Juiz de Fora",
    state: "Minas Gerais",
    // Inscrição da sociedade/advogados na OAB — PENDENTE. Quando preenchido, aparece no rodapé.
    oab: ""
  },

  // Identificador desta LP na coluna "site" de lp_visits / lp_leads
  site: "coimbra-ferolla-viana",
  // Página dentro do site (vai no fim da coluna "origem" do lead)
  pageKey: "trabalhista",

  whatsapp: {
    // Número confirmado pela ADS BR em 20/10/2026: (32) 99802-4060
    number: "5532998024060",
    confirmed: true,
    // Mensagem enviada ao abrir o WhatsApp após o formulário
    message: "Vim do Google e quero falar com um advogado trabalhista especialista."
  },

  // Backend de captura — Supabase "ADS BR CLIENTES" (mesmo das outras LPs da ADS BR).
  // Chave publicável (anon): só permite INSERIR visitas e leads; a leitura exige login (RLS + lp_acessos).
  backend: {
    supabaseUrl: "https://qxhnjzyhtllmtdrcyygi.supabase.co",
    supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aG5qenlodGxsbXRkcmN5eWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMzczNjgsImV4cCI6MjA5NzgxMzM2OH0.DWf4I_x9F--H7ZZHUt_n4V3B__Nlsf1jNZdUV0vNBLU",
    timeoutMs: 12000
  },

  redirect: {
    path: "/redirect.html",   // com o vercel.json (cleanUrls) o endereço final fica /redirect
    delayMs: 3000
  },

  // Mensuração — deixar vazio até existirem IDs reais. Nada é carregado enquanto estiver vazio.
  // A conversão do Google Ads é disparada na página /redirect (3 s antes de abrir o WhatsApp),
  // uma única vez por lead (não conta de novo se a pessoa recarregar a página).
  tracking: {
    metaPixelId: "",
    googleTagId: "",            // ex.: "AW-XXXXXXXXX" ou "G-XXXXXXX"
    googleAdsConversionLabel: "" // ex.: "AW-XXXXXXXXX/abcDEF123"
  },

  // URL de uma política de privacidade publicada. Vazio = o link não aparece.
  privacyPolicyUrl: ""
};
