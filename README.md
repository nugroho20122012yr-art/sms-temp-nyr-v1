# Nokos Nyr

Frontend (Vercel) → `api/[...path].js` (proxy) → backend Node.js (Termux/VPS) → sumber SMS publik.

## 1. Backend di Termux
```bash
pkg install nodejs git cloudflared -y
cd nokos-nyr/backend
npm install
PROVIDER=mock npm start   # tes UI tanpa internet (nomor & OTP palsu)
node check.js             # tes sumber data asli
npm start                 # jalan asli di :3000
```
Termux ada di belakang NAT, jadi butuh URL publik. Di tab Termux kedua:
```bash
cloudflared tunnel --url http://localhost:3000   # catat URL https://xxxx.trycloudflare.com
```
(URL quick tunnel berubah tiap restart → update `VPS_URL` di Vercel. Kalau punya VPS/IP publik, pakai `http://IP:3000`.)

Opsional: `API_KEY=rahasia npm start` (isi nilai yang sama di Vercel).

## 2. Deploy Vercel
Upload folder ini ke Vercel (backend/ otomatis diabaikan lewat `.vercelignore`), lalu di
Settings → Environment Variables isi:

| Nama | Isi |
|---|---|
| `VPS_URL` | URL tunnel / IP VPS, tanpa `/` di akhir |
| `API_KEY` | (opsional) sama dengan di backend |

Redeploy. Kalau VPS mati, status header berubah jadi **VPS Offline** dan frontend coba lagi tiap 15 detik.

## Atur negara
Edit `backend/src/countries.js`. Ganti sumber: env `SCRAPE_BASE`, atau ubah selector di `backend/src/providers.js`.
