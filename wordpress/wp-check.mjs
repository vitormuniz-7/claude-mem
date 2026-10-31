#!/usr/bin/env node
/**
 * Verificação SOMENTE LEITURA da API REST do WordPress.
 *
 * Suporta vários sites. Cada site tem um prefixo no .env (raiz do projeto):
 *   VITINDOCLIO_WP_URL / VITINDOCLIO_WP_USER / VITINDOCLIO_WP_APP_PASSWORD
 *   BROMELIA_WP_URL    / BROMELIA_WP_USER    / BROMELIA_WP_APP_PASSWORD
 * (as chaves antigas sem prefixo, WP_URL/WP_USER/WP_APP_PASSWORD, continuam
 *  valendo como fallback para o site padrão "vitindoclio").
 *
 * Exige HTTPS e executa apenas requisições GET:
 *   1. /wp-json/                      -> API ativa? métodos de autenticação?
 *   2. /wp-json/wp/v2/users/me        -> autenticação funciona? qual papel?
 *   3. páginas, posts, tema ativo, plugins instalados
 *   4. versão do WordPress (meta "generator" da home ou do feed RSS)
 *
 * A senha NUNCA é impressa. Só o nome do usuário autenticado aparece na saída.
 * Nada aqui cria, edita ou apaga conteúdo.
 *
 * Uso:  node wordpress/wp-check.mjs --site vitindoclio
 *       node wordpress/wp-check.mjs --site bromelia [--json]
 *       node wordpress/wp-check.mjs --all               (todos os sites, um após o outro)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARGS = process.argv.slice(2);
const JSON_OUT = ARGS.includes("--json");

// Sites conhecidos: nome -> prefixo das variáveis no .env e URL padrão.
export const SITES = {
  vitindoclio: { prefix: "VITINDOCLIO_", defaultUrl: "https://vitindoclio.com.br", label: "Vitor Muniz (artista)" },
  bromelia: { prefix: "BROMELIA_", defaultUrl: "https://bromeliagroove.com.br", label: "Bromélia Groove" },
};

if (ARGS.includes("--all")) {
  let worst = 0;
  for (const name of Object.keys(SITES)) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--site", name, ...ARGS.filter((a) => a !== "--all")], { stdio: "inherit" });
    worst = Math.max(worst, r.status ?? 1);
  }
  process.exit(worst);
}

const siteIdx = ARGS.indexOf("--site");
const SITE_NAME = siteIdx !== -1 ? ARGS[siteIdx + 1] : "vitindoclio";
const SITE = SITES[SITE_NAME];
if (!SITE) fail(`Site desconhecido "${SITE_NAME}". Opções: ${Object.keys(SITES).join(", ")}`);

// ---------- .env ----------
function loadEnv() {
  const file = resolve(ROOT, ".env");
  if (!existsSync(file)) {
    fail(`Arquivo .env não encontrado em ${file}. Copie .env.example para .env e preencha.`);
  }
  const env = {};
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function fail(msg) {
  console.error(`ERRO: ${msg}`);
  process.exit(1);
}

const env = loadEnv();
// Lê <PREFIXO>WP_X; para o site padrão aceita também WP_X sem prefixo.
const pick = (key) => env[SITE.prefix + key] ?? (SITE_NAME === "vitindoclio" ? env[key] : undefined) ?? "";
const WP_URL = (pick("WP_URL") || SITE.defaultUrl).replace(/\/+$/, "");
const WP_USER = pick("WP_USER");
// Senhas de aplicativo são exibidas com espaços a cada 4 chars; o WP aceita com ou sem.
const WP_APP_PASSWORD = pick("WP_APP_PASSWORD").replace(/\s+/g, "");

if (!/^https:\/\//i.test(WP_URL)) {
  fail(`${SITE.prefix}WP_URL deve começar com https:// (atual: ${WP_URL}). Autenticação não deve trafegar sem SSL. Parando.`);
}
const HAS_CREDS = Boolean(WP_USER && WP_APP_PASSWORD);
const AUTH_HEADER = HAS_CREDS
  ? "Basic " + Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString("base64")
  : null;

// ---------- HTTP helper (GET only) ----------
async function get(path, { auth = false, raw = false } = {}) {
  const url = path.startsWith("http") ? path : `${WP_URL}${path}`;
  const headers = { Accept: raw ? "*/*" : "application/json", "User-Agent": "claude-code-wp-check/1.0" };
  if (auth) {
    if (!AUTH_HEADER) return { ok: false, status: 0, error: "sem credenciais no .env" };
    headers.Authorization = AUTH_HEADER;
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25_000);
  try {
    const res = await fetch(url, { method: "GET", headers, redirect: "manual", signal: ctl.signal });
    const ctype = res.headers.get("content-type") || "";
    const text = await res.text();
    let body = text;
    if (!raw && ctype.includes("json")) {
      try { body = JSON.parse(text); } catch { /* deixa como texto */ }
    }
    return {
      ok: res.ok,
      status: res.status,
      location: res.headers.get("location"),
      ctype,
      server: res.headers.get("server"),
      body,
      total: res.headers.get("x-wp-total"),
    };
  } catch (e) {
    return { ok: false, status: 0, error: e?.cause?.code || e?.name || String(e) };
  } finally {
    clearTimeout(t);
  }
}

const strip = (html) => String(html ?? "").replace(/<[^>]+>/g, "").trim();

// ---------- diagnóstico de bloqueios ----------
function diagnose(step, r) {
  const code = r.body && typeof r.body === "object" ? r.body.code : undefined;
  const isHtml = typeof r.body === "string" && /<html/i.test(r.body);

  if (r.status === 0) {
    return `Falha de rede (${r.error}). Verifique DNS/firewall do ambiente ou se o domínio está apontado.`;
  }
  if (step === "index" && r.status === 404) {
    return "404 em /wp-json/: permalinks provavelmente em 'Padrão/plain'. Liberar: Painel WP > Configurações > Links permanentes > escolher 'Nome do post' e salvar. Alternativa: usar ?rest_route=/ .";
  }
  if (r.status === 401 && (code === "rest_not_logged_in" || code === "rest_forbidden")) {
    return "401 com credenciais enviadas: o header Authorization está sendo removido pelo servidor (comum em LiteSpeed/Apache da Hostinger) ou a senha de aplicativo está errada/revogada. Liberar: no .htaccess, dentro do bloco de rewrite do WP, adicionar `RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]`. Conferir também se o usuário é o LOGIN (não o e-mail).";
  }
  if (r.status === 401 && code === "incorrect_password") {
    return "401 incorrect_password: a senha de aplicativo não confere. Gere outra em Usuários > Perfil > Senhas de aplicativo e atualize o .env.";
  }
  if (r.status === 401 && code === "application_passwords_disabled") {
    return "Senhas de aplicativo desativadas no site (filtro wp_is_application_passwords_available ou site sem HTTPS). Liberar: remover o filtro/plugin que desativa, ou ativar SSL.";
  }
  if (r.status === 403 && (code === "rest_cannot_access" || code === "rest_disabled" || code === "rest_api_restricted")) {
    return "403 rest_cannot_access: um plugin de segurança está restringindo a API REST a usuários logados (ex.: Solid/iThemes Security > 'REST API' = Restricted Access; plugin 'Disable REST API'; Wordfence). Liberar: definir acesso padrão da API REST ou permitir o namespace wp/v2 para o usuário.";
  }
  if (r.status === 403 && isHtml) {
    return "403 com página HTML: bloqueio no nível do servidor/WAF (firewall da Hostinger, Cloudflare ou mod_security). Liberar: na Hostinger, hPanel > Segurança/Firewall, adicionar a regra de exceção para /wp-json/ ou liberar o IP de origem.";
  }
  if (r.status === 403 && code === "rest_user_cannot_view") {
    return "403 rest_user_cannot_view: o usuário autenticou mas não tem a capability necessária (ex.: listar plugins exige 'activate_plugins' = Administrador).";
  }
  if (r.status === 429) return "429: rate limit do servidor/WAF. Esperar e tentar de novo.";
  if (r.status >= 500) return `${r.status}: erro do servidor WordPress/PHP. Ver logs no hPanel.`;
  if (r.status >= 300 && r.status < 400) return `Redirecionamento para ${r.location} (confira se WP_URL está com www/sem www e https corretos).`;
  if (!r.ok) return `HTTP ${r.status}${code ? ` (${code})` : ""}.`;
  return null;
}

// ---------- execução ----------
const report = {
  checkedAt: new Date().toISOString(),
  site: SITE_NAME,
  siteLabel: SITE.label,
  siteUrl: WP_URL,
  https: true,
  httpRedirectsToHttps: null,
  api: {},
  auth: {},
  wordpressVersion: null,
  theme: null,
  plugins: null,
  pages: null,
  posts: null,
  blockers: [],
};

function block(where, msg) {
  if (msg) report.blockers.push({ where, msg });
}

// 0. http -> https ?
{
  const r = await get(WP_URL.replace(/^https:/i, "http:"), { raw: true });
  report.httpRedirectsToHttps =
    r.status >= 300 && r.status < 400 && /^https:/i.test(r.location || "") ? true : r.status === 0 ? null : false;
}

// 1. índice da API
{
  const r = await get("/wp-json/");
  const b = r.body && typeof r.body === "object" ? r.body : null;
  report.api = {
    status: r.status,
    active: Boolean(b && b.namespaces),
    siteName: b ? strip(b.name) : null,
    description: b ? strip(b.description) : null,
    home: b?.home ?? null,
    timezone: b?.timezone_string ?? null,
    namespaces: b?.namespaces ?? null,
    authMethods: b?.authentication ? Object.keys(b.authentication) : null,
    appPasswordsAdvertised: Boolean(b?.authentication?.["application-passwords"]),
    server: r.server,
  };
  block("GET /wp-json/", diagnose("index", r));
  // Plugins frequentemente expõem seus namespaces no índice (pista sem autenticação)
  if (Array.isArray(b?.namespaces)) {
    report.api.pluginHintsFromNamespaces = b.namespaces.filter((n) => !/^(wp\/v2|wp-site-health\/v1|wp-block-editor\/v1|oembed\/1\.0|batch\/v1)$/.test(n));
  }
}

// 2. autenticação
if (!HAS_CREDS) {
  report.auth = { status: null, ok: false, note: `${SITE.prefix}WP_USER/${SITE.prefix}WP_APP_PASSWORD vazios no .env — etapas autenticadas puladas.` };
} else {
  const r = await get("/wp-json/wp/v2/users/me?context=edit", { auth: true });
  const b = r.body && typeof r.body === "object" ? r.body : {};
  report.auth = {
    status: r.status,
    ok: r.ok,
    id: b.id ?? null,
    name: b.name ?? null,
    slug: b.slug ?? null,
    roles: b.roles ?? null,
    isAdmin: Array.isArray(b.roles) ? b.roles.includes("administrator") : null,
  };
  block("GET /wp/v2/users/me", diagnose("me", r));
}

const authed = report.auth.ok === true;

// 3a. páginas (com auth vê rascunhos também)
{
  const q = authed ? "&status=publish,draft,pending,private,future&context=edit" : "";
  const r = await get(`/wp-json/wp/v2/pages?per_page=100&orderby=title&order=asc&_fields=id,title,slug,status,link,modified,parent${q}`, { auth: authed });
  if (Array.isArray(r.body)) {
    report.pages = r.body.map((p) => ({ id: p.id, title: strip(p.title?.rendered ?? p.title?.raw), slug: p.slug, status: p.status, link: p.link, modified: p.modified, parent: p.parent }));
    report.pagesTotal = Number(r.total ?? r.body.length);
  } else block("GET /wp/v2/pages", diagnose("pages", r));
}

// 3b. posts
{
  const q = authed ? "&status=publish,draft,pending,private,future&context=edit" : "";
  const r = await get(`/wp-json/wp/v2/posts?per_page=100&orderby=date&order=desc&_fields=id,title,slug,status,link,date${q}`, { auth: authed });
  if (Array.isArray(r.body)) {
    report.posts = r.body.map((p) => ({ id: p.id, title: strip(p.title?.rendered ?? p.title?.raw), slug: p.slug, status: p.status, link: p.link, date: p.date }));
    report.postsTotal = Number(r.total ?? r.body.length);
  } else block("GET /wp/v2/posts", diagnose("posts", r));
}

// 3c. tema ativo (requer auth)
if (authed) {
  const r = await get("/wp-json/wp/v2/themes?status=active", { auth: true });
  if (Array.isArray(r.body) && r.body[0]) {
    const t = r.body[0];
    report.theme = {
      stylesheet: t.stylesheet,
      name: strip(t.name?.rendered ?? t.name?.raw),
      version: t.version,
      template: t.template,
      isChildTheme: Boolean(t.template && t.template !== t.stylesheet),
      isBlockTheme: t.is_block_theme ?? null,
      author: strip(t.author?.rendered ?? t.author?.raw),
    };
  } else block("GET /wp/v2/themes?status=active", diagnose("themes", r));
}

// 3d. plugins (requer administrador)
if (authed) {
  const r = await get("/wp-json/wp/v2/plugins", { auth: true });
  if (Array.isArray(r.body)) {
    report.plugins = r.body.map((p) => ({ plugin: p.plugin, name: strip(p.name), version: p.version, status: p.status, networkOnly: p.network_only ?? false }));
  } else block("GET /wp/v2/plugins", diagnose("plugins", r));
}

// 4. versão do WordPress (não há endpoint REST público para isso)
{
  let version = null;
  let reachable = false;
  const home = await get(WP_URL + "/", { raw: true });
  if (home.status !== 0) reachable = true;
  if (typeof home.body === "string") {
    const m = home.body.match(/<meta[^>]+name=["']generator["'][^>]+content=["']WordPress\s*([\d.]+)/i)
      || home.body.match(/content=["']WordPress\s*([\d.]+)["'][^>]+name=["']generator["']/i);
    if (m) version = m[1];
    const theme = home.body.match(/\/wp-content\/themes\/([^\/"'?]+)\//);
    if (theme && !report.theme) report.themeHintFromHtml = theme[1];
    const plugs = [...home.body.matchAll(/\/wp-content\/plugins\/([^\/"'?]+)\//g)].map((x) => x[1]);
    if (plugs.length && !report.plugins) report.pluginHintsFromHtml = [...new Set(plugs)];
  }
  if (!version) {
    const feed = await get(WP_URL + "/feed/", { raw: true });
    if (feed.status !== 0) reachable = true;
    const m = typeof feed.body === "string" ? feed.body.match(/wordpress\.org\/\?v=([\d.]+)/i) : null;
    if (m) version = m[1];
  }
  report.wordpressVersion = version
    ?? (reachable ? "não exposta (generator oculto — provável plugin de segurança)" : "não verificada (site inacessível)");
}

// ---------- saída ----------
if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.blockers.length ? 2 : 0);
}

const yes = (v) => (v === true ? "sim" : v === false ? "NÃO" : "indeterminado");
console.log(`\n=== WordPress REST API — verificação somente leitura ===`);
console.log(`Site:                 ${SITE.label} [${SITE_NAME}]  ${WP_URL}`);
console.log(`HTTPS:                ${yes(report.https)}   (http→https redireciona: ${yes(report.httpRedirectsToHttps)})`);
console.log(`API ativa:            ${yes(report.api.active)}  [HTTP ${report.api.status}]  nome: ${report.api.siteName ?? "-"}`);
console.log(`Senhas de aplicativo: ${report.api.appPasswordsAdvertised ? "anunciadas no índice" : "NÃO anunciadas no índice"}`);
console.log(`Autenticação:         ${report.auth.ok ? `OK como "${report.auth.name}" (${(report.auth.roles || []).join(", ")})` : report.auth.note || `FALHOU [HTTP ${report.auth.status}]`}`);
console.log(`WordPress:            ${report.wordpressVersion}`);
console.log(`Tema ativo:           ${report.theme ? `${report.theme.name} ${report.theme.version}${report.theme.isChildTheme ? ` (child de ${report.theme.template})` : ""}` : report.themeHintFromHtml ? `${report.themeHintFromHtml} (pista no HTML; sem auth)` : "-"}`);
console.log(`Plugins:              ${report.plugins ? `${report.plugins.length} instalados, ${report.plugins.filter((p) => p.status === "active").length} ativos` : report.pluginHintsFromHtml ? `pistas no HTML: ${report.pluginHintsFromHtml.join(", ")}` : "-"}`);
if (report.plugins) for (const p of report.plugins) console.log(`   - [${p.status === "active" ? "x" : " "}] ${p.name} ${p.version}  (${p.plugin})`);
console.log(`Páginas:              ${report.pages ? report.pagesTotal : "-"}`);
if (report.pages) for (const p of report.pages) console.log(`   - #${p.id} ${p.title || "(sem título)"} [${p.status}] /${p.slug}`);
console.log(`Posts:                ${report.posts ? report.postsTotal : "-"}`);
if (report.posts) for (const p of report.posts) console.log(`   - #${p.id} ${p.title || "(sem título)"} [${p.status}] ${p.date?.slice(0, 10)}`);
if (report.api.pluginHintsFromNamespaces?.length) console.log(`Namespaces extras:    ${report.api.pluginHintsFromNamespaces.join(", ")}`);
console.log(`\nBloqueios encontrados: ${report.blockers.length ? "" : "nenhum"}`);
for (const b of report.blockers) console.log(`   ! ${b.where}: ${b.msg}`);
console.log("");
process.exit(report.blockers.length ? 2 : 0);
