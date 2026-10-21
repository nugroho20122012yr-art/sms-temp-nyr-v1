const load = html => require('cheerio').load(html); // lazy: mode mock tidak butuh cheerio
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const PHONE = /\+\d[\d\s().-]{6,}\d/;
const digits = v => String(v || '').replace(/\D/g, '');

function parseWhen(text) {
  const s = String(text || '').trim().toLowerCase();
  const now = Date.now();
  if (!s || /just now|baru saja|now/.test(s)) return new Date(now).toISOString();
  const m = s.match(/(\d+)\s*(second|sec|minute|min|hour|hr|day|week|month)s?/);
  if (m) {
    const unit = { second: 1e3, sec: 1e3, minute: 6e4, min: 6e4, hour: 36e5, hr: 36e5, day: 864e5, week: 6048e5, month: 2592e6 }[m[2]];
    return new Date(now - Number(m[1]) * unit).toISOString();
  }
  const t = Date.parse(text);
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date(now).toISOString();
}

// ---------- Provider: scrape (default) ----------
const BASE = (process.env.SCRAPE_BASE || 'https://receive-smss.com').replace(/\/+$/, '');

async function get(url) {
  const r = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', accept: 'text/html' },
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error(`Sumber data membalas HTTP ${r.status}`);
  return r.text();
}

const scrape = {
  async listNumbers(country) {
    const $ = load(await get(BASE + '/'));
    const out = [], seen = new Set();
    $('a[href*="/sms/"]').each((_, a) => {
      const href = new URL($(a).attr('href'), BASE).href;
      if (seen.has(href)) return;
      let el = $(a), text = '';
      for (let i = 0; i < 5; i++) {            // naik ke atas sampai ketemu kartu yang memuat nomor
        text = el.text().replace(/\s+/g, ' ');
        if (PHONE.test(text)) break;
        el = el.parent();
      }
      const num = text.match(PHONE);
      if (!num) return;
      const low = text.toLowerCase();
      const ok = country.aliases.some(x => new RegExp(`\\b${x}\\b`).test(low)) ||
                 digits(num[0]).startsWith(country.dial) && !/\b(usa|canada)\b/.test(low) && country.dial !== '1';
      if (!ok) return;
      seen.add(href);
      out.push({ number: num[0].replace(/\s+/g, ' ').trim(), href });
    });
    return out;
  },

  async getMessages(href) {
    const $ = load(await get(href));
    const out = [];
    $('[class*="message_details"], [class*="message-details"]').each((_, el) => {
      const box = $(el);
      const sender = box.find('[class*="sender"]').first().text().replace(/^\s*(from|sender)\s*:?/i, '').trim();
      const content = box.find('[class*="msg"]').first().clone().children('span:first-child:not(:only-child)').remove().end().text().replace(/^\s*message\s*:?/i, '').trim();
      const time = box.find('[class*="time"]').first().text().replace(/^\s*(time|received)\s*:?/i, '').trim();
      if (content) out.push({ sender: sender || 'Unknown', content, receivedAt: parseWhen(time) });
    });
    return out;
  }
};

// ---------- Provider: mock (untuk tes UI tanpa internet) ----------
const mock = {
  async listNumbers(country) {
    return Array.from({ length: 8 }, (_, i) => {
      const n = `+${country.dial} ${555000 + i * 137} ${String(1000 + i * 91)}`;
      return { number: n, href: `mock://${country.slug}/${digits(n)}` };
    });
  },
  async getMessages(href) {
    const id = Number(digits(href).slice(-6)) || 1;
    const senders = [['Google', 'G-%c is your Google verification code.'], ['WhatsApp', 'Your WhatsApp code: %c. Do not share this code.'], ['Telegram', 'Kode login Telegram Anda: %c'], ['Tokopedia', 'JANGAN BAGIKAN KODE. Kode OTP Tokopedia: %c berlaku 5 menit.']];
    const slot = Math.floor(Date.now() / 45000);            // pesan baru tiap 45 detik
    return Array.from({ length: 6 }, (_, i) => {
      const s = slot - i, [sender, tpl] = senders[(s + id) % senders.length];
      const code = String(((s * 7919 + id * 104729) % 900000) + 100000);
      return { sender, content: tpl.replace('%c', code), receivedAt: new Date(s * 45000).toISOString() };
    });
  }
};

module.exports = { provider: process.env.PROVIDER === 'mock' ? mock : scrape, digits };
