import { normalizeEmail } from '../../utils/email.js';

// Extrae el email de contacto del sitio web de un negocio.
// Gratis: no usa ninguna API paga, solo baja el HTML y busca el correo.
// Resiliente: cualquier error (timeout, DNS, TLS, redirect) devuelve null y sigue.

const FETCH_TIMEOUT_MS = 8000;
const UA =
  'Mozilla/5.0 (compatible; ProspeccionBot/1.0; +https://panel.chilimexshop.com)';

// Páginas típicas donde el negocio publica su email si no está en la home
const CONTACT_PATHS = ['/contacto', '/contact', '/contactanos', '/contact-us', '/contacto.html'];

// Valores que parecen email pero NO son un correo de contacto real
const JUNK_PATTERNS: RegExp[] = [
  /\.(png|jpe?g|gif|svg|webp|bmp|ico|css|js|mjs|woff2?|ttf|eot)$/i,
  /@(?:example|domain|dominio|yourdomain|tudominio|email|correo|test|mail)\.(?:com|org|net)$/i,
  /@(?:.*\.)?(?:sentry|wixpress|wix|godaddy|squarespace|cloudflare|jsdelivr|gstatic|googleapis|schema|w3|shopify|myshopify|sentry-next|cdn)\./i,
  /^[a-f0-9]{16,}@/i, // hashes (tracking)
  /(?:your|tu|nombre|name|user|usuario)@/i, // placeholders "tuemail@..."
  /^(?:no-?reply|noreply|donotreply|postmaster|mailer-daemon|abuse)@/i,
  /\.(?:png|jpg|gif)@/i,
  /@sentry/i,
  /u003e|u003c|x[0-9a-f]{2}/i, // fragmentos de JS escapado
];

// Prefijos de correo que suelen ser el contacto comercial
const PREFERRED_LOCAL = [
  'info', 'contacto', 'contact', 'ventas', 'sales', 'hola', 'hello',
  'comercial', 'atencion', 'administracion', 'admin', 'consultas', 'clientes',
];

function looksJunk(email: string): boolean {
  return JUNK_PATTERNS.some((re) => re.test(email));
}

// Desofusca emails escritos como "info [at] dominio [dot] com" o con entidades HTML
function deobfuscate(html: string): string {
  return html
    .replace(/&#0*64;/gi, '@')
    .replace(/&#0*46;/gi, '.')
    .replace(/&commat;/gi, '@')
    .replace(/&period;/gi, '.')
    .replace(/\s*[\[(]\s*(?:at|arroba)\s*[\])]\s*/gi, '@')
    .replace(/\s*[\[(]\s*(?:dot|punto)\s*[\])]\s*/gi, '.');
}

function scoreEmail(email: string, siteDomain: string): number {
  let s = 0;
  const [local, dom] = email.split('@');
  if (dom === siteDomain || dom.endsWith('.' + siteDomain) || siteDomain.endsWith('.' + dom)) s += 5;
  if (PREFERRED_LOCAL.includes(local)) s += 3;
  // correos gratuitos son válidos para pymes, pero un poco menos ideales que uno con dominio propio
  if (/@(gmail|hotmail|outlook|yahoo|live|icloud)\./.test(email)) s += 1;
  return s;
}

function extractEmailsFromHtml(html: string, siteHost: string): string[] {
  const text = deobfuscate(html);
  const found = new Set<string>();

  // 1) mailto: → señal fuerte de que es el correo de contacto
  const mailtoRe = /mailto:([^"'>?\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = mailtoRe.exec(text)) !== null) {
    let raw = m[1];
    try { raw = decodeURIComponent(raw); } catch { /* dejar como está */ }
    const e = normalizeEmail(raw);
    if (e && !looksJunk(e)) found.add(e);
  }

  // 2) cualquier email en el texto
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  while ((m = re.exec(text)) !== null) {
    const e = normalizeEmail(m[0]);
    if (e && !looksJunk(e)) found.add(e);
  }

  const domain = siteHost.replace(/^www\./, '');
  return [...found].sort((a, b) => scoreEmail(b, domain) - scoreEmail(a, domain));
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (ct && !ct.includes('text/') && !ct.includes('xml')) return null;
    const body = await res.text();
    return body.slice(0, 600_000); // no leer páginas gigantes
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Devuelve el mejor email de contacto encontrado en el sitio, o null.
export async function extractEmailFromSite(website: string): Promise<string | null> {
  let url: URL;
  try {
    const withProto = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    url = new URL(withProto);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  // Redes sociales / acortadores: no se puede scrapear el email (login wall)
  if (/(?:^|\.)(facebook|instagram|linkedin|twitter|tiktok|whatsapp|goo|linktr|bit|maps)\.[a-z]/.test(host) ||
      /wa\.me|t\.me/.test(host)) {
    return null;
  }

  // Home
  const home = await fetchText(url.toString());
  if (home) {
    const emails = extractEmailsFromHtml(home, host);
    if (emails.length) return emails[0];
  }

  // Páginas de contacto
  for (const path of CONTACT_PATHS) {
    let contactUrl: string;
    try { contactUrl = new URL(path, url.origin).toString(); } catch { continue; }
    const html = await fetchText(contactUrl);
    if (html) {
      const emails = extractEmailsFromHtml(html, host);
      if (emails.length) return emails[0];
    }
  }

  return null;
}

// Ejecuta fn sobre items con un tope de concurrencia (para no colgar la generación).
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await fn(items[cur], cur);
    }
  });
  await Promise.all(workers);
  return results;
}
