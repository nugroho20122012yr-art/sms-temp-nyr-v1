// Proxy Vercel -> VPS (Termux). Kalau VPS mati/timeout, balas JSON offline (bukan halaman error).
module.exports = async (req, res) => {
  const base = (process.env.VPS_URL || '').replace(/\/+$/, '');
  const offline = msg => res.status(503).json({ success: false, offline: true, error: msg });
  if (!base) return offline('VPS_URL belum diatur di Vercel.');
  try {
    const r = await fetch(base + req.url, {
      headers: { accept: 'application/json', 'x-nyr-key': process.env.API_KEY || '', 'x-forwarded-for': String(req.headers['x-forwarded-for'] || '') },
      signal: AbortSignal.timeout(9000)
    });
    if (!/json/.test(r.headers.get('content-type') || '')) return offline('VPS offline.');
    res.status(r.status).setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.send(await r.text());
  } catch { offline('VPS offline atau timeout.'); }
};
