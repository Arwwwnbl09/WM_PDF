# Frontend Secure PDF Watermark

Aplikasi Next.js untuk unggah PDF, pratinjau watermark, pengaturan kualitas, progres, dan unduhan hasil. Server pemrosesan PDF berada di folder `../backend`.

## Menjalankan secara lokal

Dari folder `frontend`:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Salin contoh konfigurasi hanya pada pemasangan baru agar konfigurasi lokal yang sudah ada tetap tersimpan. Buka `http://localhost:3000`. Jalankan backend pada terminal terpisah mengikuti [panduan backend](../backend/README.md).

`PDF_API_URL` menunjuk backend yang dijangkau server Next.js, dengan nilai bawaan `http://127.0.0.1:8000`. Jika backend memakai port 8080, ubah nilai tersebut pada `.env.local` menjadi `http://127.0.0.1:8080`, lalu restart frontend.

## Deploy frontend ke Vercel

- Root Directory: `frontend`
- Framework Preset: `Next.js`
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `.next`
- Environment Variable: `NEXT_PUBLIC_API_URL` berisi alamat HTTPS backend yang sudah aktif, tanpa `/api/pdf`.

Pengaturan build tersedia di `vercel.json`. Tetapkan URL backend di dashboard Vercel sebelum deploy. Perubahan variabel memerlukan redeploy. Backend perlu mengizinkan domain frontend melalui `FRONTEND_ORIGINS`.

## Pemeriksaan

```powershell
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Tes browser memakai server produksi pada port 3101 dan backend lokal pada port 8000. Panduan lengkap dan paket sumber hosting tersedia pada [README proyek](../README.md).
