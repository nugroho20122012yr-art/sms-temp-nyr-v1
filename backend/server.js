const http = require('http');
const fs = require('fs');
const path = require('path');
const countries = require('./src/countries');
const { provider, digits } = require('./src/providers');

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.API_KEY || '';
const TTL_NUMBERS = 60_000, TTL_MESSAGES = 8_000, LIMIT = 90; // LIMIT = request/menit/IP

const cache = new Map(), hits = new Map();
async function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  if (hit?.pending) return hit.pending;
  const pending = fn().then(value => { cache.set(key, { at: Date.now(), value }); return value; })
                      .catch(err => { cache.delete(key); throw err; });
  cache.set(key, { ...hit, pending });
  return pending;
}
setInterval(() => { hits.clear(); }, 60_000).unref();

const send = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'x-nyr-key' });
  res.end(JSON.stringify(body));
};
const fail = (res, code, error) => send(res, code, { success: false, error });

async function route(url, res) {
  const p = url.pathname.replace(/\/+$/, '');
  if (p === '/api/temp-phone/health') return send(res, 200, { success: true, uptime: Math.round(process.uptime()) });
  if (p === '/api/temp-phone/countries') {
    return send(res, 200, { success: true, countries: countries.map(({ slug, name }) => ({ slug, name })) });
  }
  const country = countries.find(c => c.slug === url.searchParams.get('country'));
  if (!country) return fail(res, 400, 'Negara tidak valid.');

  const list = () => cached('n:' + country.slug, TTL_NUMBERS, () => provider.listNumbers(country));

  if (p === '/api/temp-phone/numbers') return send(res, 200, { success: true, numbers: await list() });

  if (p === '/api/temp-phone/messages') {
    const want = digits(url.searchParams.get('number'));
    const phone = (await list()).find(x => digits(x.number) === want);
    if (!phone) return fail(res, 404, 'Nomor tidak ditemukan. Muat ulang daftar nomor.');
    const phoneId = digits(phone.href).slice(-12) || want;
    const msgs = await cached('m:' + phone.href, TTL_MESSAGES, () => provider.getMessages(phone.href));
    return send(res, 200, { success: true, number: phone.number, phoneId, messages: msgs.map(m => ({ ...m, phoneId })) });
  }
  return fail(res, 404, 'Endpoint tidak ada.');
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (url.pathname.startsWith('/api/')) {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim();
    if ((hits.set(ip, (hits.get(ip) || 0) + 1), hits.get(ip) > LIMIT)) return fail(res, 429, 'Terlalu banyak request. Tunggu sebentar.');
    if (API_KEY && req.headers['x-nyr-key'] !== API_KEY && !/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress)) return fail(res, 401, 'API key salah.');
    try { return await route(url, res); }
    catch (e) { console.error(e.message); return fail(res, 502, e.message || 'Gagal mengambil data dari sumber.'); }
  }
  // Sajikan frontend juga (buka http://localhost:3000 di HP)
  const file = path.join(__dirname, '..', 'index.html');
  fs.readFile(file, (err, html) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html);
  });
}).listen(PORT, () => console.log(`Nokos Nyr backend jalan di :${PORT} (provider: ${process.env.PROVIDER || 'scrape'})`));
