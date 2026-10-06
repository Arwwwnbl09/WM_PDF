# Secure PDF Watermark

Aplikasi untuk memberi watermark pada seluruh halaman PDF. Dokumen dipilih melalui tombol unggah atau seret dan lepas, lalu diperiksa di pratinjau sebelum diproses.

## Struktur proyek

```text
frontend/   Next.js, antarmuka, pratinjau, dan tes browser
backend/    FastAPI, pemrosesan PDF, dan tes Python
scripts/    Pembuatan paket sumber hosting
vercel.json Konfigurasi frontend dan backend dalam satu proyek Services
render.yaml Konfigurasi deployment backend Docker
```

Frontend dan backend mempunyai folder aplikasi masing-masing. Konfigurasi `vercel.json` pada root repo menjalankan keduanya dalam satu proyek [Vercel Services](https://vercel.com/docs/services), dengan **Root Directory `./`** dan **Framework Preset `Services`**. Pilihan ini cocok untuk pemeriksaan deployment dan PDF kecil, dengan batas platform yang dijelaskan pada bagian hosting.

Untuk memasang aplikasi sebagai proyek terpisah, gunakan pengaturan berikut:

| Aplikasi | Root Directory | Framework Preset |
| -------- | -------------- | ---------------- |
| Frontend | `frontend`     | `Next.js`        |
| Backend  | `backend`      | `FastAPI`        |

Masing-masing folder juga memiliki `vercel.json` untuk deployment terpisah. Panduan backend Docker untuk dokumen besar tersedia pada bagian hosting.

## Penggunaan

1. Pilih satu file PDF.
2. Atur teks, huruf, posisi, rotasi, warna, kepekatan, dan pola watermark.
3. Pilih kualitas PDF hasil, lalu tekan **Proses PDF**.
4. Tunggu proses selesai. Unduhan dimulai otomatis setelah PDF hasil diterima.

Selama proses, aplikasi menampilkan persentase dan label `processed`. Persentase dihitung dari halaman yang selesai. Angka dapat bertahan di 0% saat unggahan dan 99% saat hasil disiapkan. Tombol **Batalkan** menghentikan pekerjaan setelah halaman yang sedang dikerjakan selesai. Jika langsung memproses ulang, aplikasi menunggu pembatalan tersebut sebelum mengirim pekerjaan baru.

Nama hasil mengikuti nama dokumen dengan tambahan `_secured.pdf`. Agar browser menanyakan nama dan lokasi penyimpanan, aktifkan pengaturan **Tanyakan lokasi penyimpanan setiap file sebelum mendownload** pada Chrome atau Edge. Dialog penyimpanan otomatis mengikuti pengaturan browser. Tombol **Simpan ulang** tersedia setelah proses selesai.

Perubahan file atau pengaturan memerlukan proses ulang. **Atur ulang** mengembalikan pengaturan awal.

## Kualitas PDF

| Pilihan                 | Resolusi | Penggunaan                                                           |
| ----------------------- | -------- | -------------------------------------------------------------------- |
| Ringan & jelas (bawaan) | 150 DPI  | Teks dan tabel tetap cukup jelas dengan ukuran file lebih kecil.     |
| Hemat                   | 100 DPI  | Ukuran lebih kecil; teks kecil dan detail gambar dapat berkurang.    |
| Seimbang                | 150 DPI  | Kualitas gambar dan ukuran file untuk penggunaan umum.               |
| Tinggi                  | 300 DPI  | Detail lebih baik untuk dokumen teknis atau cetak; file lebih besar. |

Ringan & jelas memakai kompresi palet warna atau JPEG sesuai isi halaman. Target internal sekitar 10 MiB tidak menjadi batas ukuran: aplikasi mempertahankan resolusi dan kualitas minimum, sehingga hasil dapat melebihi target. Jumlah halaman, gambar, dan warna memengaruhi ukuran akhir.

Setiap halaman hasil berupa gambar yang sudah memuat watermark. Teks tidak dapat dipilih atau dicari, dan formulir serta tautan interaktif tidak dipertahankan. PDF berbasis teks dapat menjadi lebih besar setelah proses ini. Pratinjau menampilkan dokumen asli dan posisi watermark; kualitas kompresi perlu diperiksa pada PDF hasil.

Batas unggahan adalah 50 MiB dan 200 halaman. PDF yang dilindungi kata sandi tidak didukung. Server juga membatasi ukuran raster setiap halaman.

## Menjalankan secara lokal

Gunakan Node.js 24 dan Python 3.11 atau lebih baru. Pengujian proyek memakai Python 3.13. Jalankan frontend dan backend pada terminal terpisah.

Frontend, dari folder proyek pada terminal pertama:

```powershell
Set-Location frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Perintah penyalinan konfigurasi hanya diperlukan pada pemasangan baru. Konfigurasi frontend berada di `frontend/.env.local`. Buka `http://localhost:3000`. Aset PDF.js disiapkan otomatis saat pemasangan dependensi dan build, sehingga pratinjau tidak memerlukan CDN.

Backend, dari folder proyek pada terminal kedua:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
Set-Location backend
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Pada Linux, gunakan `.venv/bin/python`. Pastikan server mempunyai font Liberation atau DejaVu. Font lain dapat disediakan melalui `WATERMARK_FONT_DIR`. Panduan API tersedia di [backend/README.md](backend/README.md).

## Koneksi frontend dan backend

`PDF_API_URL` berisi alamat backend yang dapat dijangkau oleh server Next.js. Nilai lokalnya adalah `http://127.0.0.1:8000`. Browser meminta `/api/pdf/...` pada alamat frontend, lalu Next.js meneruskan permintaan ke backend. Dengan cara ini, pengguna dari jaringan kantor tidak perlu mengakses port backend.

Untuk akses pengembangan melalui IP, sesuaikan `allowedDevOrigins` pada `frontend/next.config.ts` dengan IP server. Alamat IP tidak memakai protokol atau port pada pengaturan tersebut. Restart frontend setelah konfigurasi berubah.

`NEXT_PUBLIC_API_URL` dipakai untuk koneksi browser langsung ke backend dan wajib diisi saat memasang frontend Vercel dengan backend eksternal. Alamatnya harus dapat dijangkau perangkat pengguna, dan `FRONTEND_ORIGINS` backend harus mencantumkan alamat frontend. Nilai `NEXT_PUBLIC_API_URL` ditetapkan sebelum build; perubahan memerlukan redeploy. Kosongkan variabel ini untuk Vercel Services agar browser memakai `/api/pdf/...` pada domain yang sama. Pada server lokal atau server kantor yang menjalankan Next.js sendiri, nilai kosong memakai proxy bawaan.

Backend membaca variabel lingkungan saat dimulai. File `backend/.env.example` hanya contoh dan tidak dimuat otomatis. Daftar `FRONTEND_ORIGINS` dipisahkan koma, memakai alamat lengkap tanpa path atau wildcard.

## Pemeriksaan

Jalankan dari folder `frontend`:

```powershell
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Tes browser menggunakan Edge dan membutuhkan backend aktif. Jika perlu memasang browser pengujian, jalankan `npx playwright install msedge`. Untuk menguji alamat tertentu, isi `LAN_TEST_URL` sebelum menjalankan tes.

Untuk pengujian lokal, pasang `backend/requirements-dev.txt`. Jalankan tes backend dari folder `backend`:

```powershell
.venv/Scripts/python.exe -m pytest
.venv/Scripts/python.exe -m ruff check app tests
.venv/Scripts/python.exe -m ruff format --check app tests
```

Tes memeriksa pengolahan PDF, kualitas gambar, validasi, unggahan, pembatalan, proses ulang, dan unduhan. `backend/scripts/verify_download.py` dipakai oleh tes browser untuk memeriksa struktur PDF hasil.

## Persiapan hosting

Aplikasi memerlukan layanan **Node.js untuk Next.js** dan **Python untuk FastAPI**, beserta ruang penyimpanan sementara dan RAM untuk pengolahan PDF. Paket ini dijalankan sebagai aplikasi server; unggahan HTML statis saja tidak menjalankan pemrosesan PDF.

### Frontend Vercel dan backend terpisah

Deployment yang memakai Root Directory `frontend` hanya menjalankan Next.js. Backend Python perlu berjalan sebagai layanan terpisah dengan alamat HTTPS. `127.0.0.1:8000` dan alamat jaringan kantor tidak dapat dipakai untuk menghubungkan Vercel ke komputer lokal. Konfigurasi build menolak alamat HTTP atau alamat jaringan privat pada `NEXT_PUBLIC_API_URL` di Vercel.

Salah satu cara memasang backend adalah melalui [Render](https://render.com/docs/docker):

Konfigurasi backend sudah tersedia. Buka [Deploy backend ke Render](https://render.com/deploy?repo=https://github.com/Arwwwnbl09/WM_PDF) untuk meninjau dan membuat layanan dari `render.yaml`, lalu ikuti langkah penyambungan di bawah.

1. Di Render, pilih **New → Blueprint**, lalu hubungkan repo `Arwwwnbl09/WM_PDF`. File `render.yaml` menyiapkan layanan Docker backend, font, satu instance, dan pemeriksaan `/health`.
2. Tinjau paket layanan sebelum membuatnya. Blueprint memakai paket gratis untuk uji coba file kecil. Layanan gratis dapat berhenti saat tidak digunakan dan RAM-nya terbatas; gunakan sumber daya yang sesuai untuk dokumen kantor banyak halaman. Informasi paket tersedia di [panduan Render](https://render.com/docs/free).
3. Tunggu backend aktif. Buka `https://alamat-backend/health` dan pastikan responsnya `{"status":"ok"}`.
4. Di Vercel, buat atau pilih proyek frontend. Pada **Settings → Build and Deployment**, isi **Root Directory `frontend`** dan **Framework Preset `Next.js`**. Pengaturan install dan build terdapat di `frontend/vercel.json`.
5. Pada **Settings → Environment Variables**, isi `NEXT_PUBLIC_API_URL` dengan `https://alamat-backend`, tanpa tambahan `/api/pdf`, pada lingkungan **Production**.
6. Di backend, isi `FRONTEND_ORIGINS=https://wmpdf.vercel.app`. Blueprint mengizinkan domain ini dan domain lama `https://wm-pdf.vercel.app`. Sesuaikan nilai tersebut jika domain frontend berubah. Tambahkan domain lain yang dipakai, dipisahkan koma; jangan menggunakan wildcard.
7. Redeploy frontend Vercel agar alamat backend masuk ke build baru. Uji satu PDF kecil, lalu dokumen dengan ukuran dan jumlah halaman yang biasa dipakai di kantor. Uji juga pembatalan dan proses ulang.

Dengan konfigurasi ini, unggahan, progres, pembatalan, dan hasil PDF dikirim langsung antara browser dan backend. Proxy Vercel tidak dipakai untuk pemrosesan PDF karena [batas waktu proxy eksternal 120 detik](https://vercel.com/docs/limits#proxied-request-timeout). Menempatkan pemroses PDF sebagai Vercel Function juga memerlukan perubahan arsitektur karena [batas badan permintaan dan respons 4,5 MB](https://vercel.com/docs/functions/limitations#request-body-size).

Pesan batas hosting 4,5 MB berarti permintaan atau hasil ditolak oleh Vercel. Pilihan kualitas PDF baru diterapkan setelah unggahan diterima, sehingga kompresi tersebut tidak mengatasi batas unggahan. Pesan kegagalan layanan hosting memerlukan pemeriksaan `/health` dan Runtime Logs backend. Batas aplikasi 50 MiB berlaku ketika permintaan sudah mencapai FastAPI.

Backend juga bisa dijalankan di Railway atau server kantor melalui [Dockerfile backend](backend/Dockerfile); sesuaikan alamat HTTPS dan origin frontend. Jalankan satu instance dan satu worker Uvicorn agar progres serta pembatalan menuju proses yang sama.

### Frontend dan backend dalam Vercel Services

1. Impor repo sebagai satu proyek dengan **Root Directory `./`** dan **Framework Preset `Services`**. Hapus override build atau output lama pada dashboard; perintah masing-masing aplikasi sudah ditetapkan dalam `vercel.json` root.
2. Hapus `NEXT_PUBLIC_API_URL` dari lingkungan deployment tersebut untuk memakai backend dalam Services. `PDF_API_URL` tidak diperlukan pada Vercel; variabel ini dipakai oleh proxy lokal.
3. Redeploy. `/` membuka antarmuka Next.js; `/health` memeriksa FastAPI; `/docs`, `/docs/oauth2-redirect`, `/redoc`, dan `/openapi.json` diarahkan ke backend. Seluruh `/api/...`, termasuk pemrosesan, progres, dan pembatalan, juga menuju FastAPI dengan path asli.
4. Pastikan `/health` menghasilkan `{"status":"ok"}`, lalu uji PDF kecil. Jika muncul `FUNCTION_INVOCATION_FAILED`, periksa Runtime Logs backend; konfigurasi routing tidak mengatasi kegagalan startup Python.

[Services tetap menggunakan Vercel Functions](https://vercel.com/docs/services/pricing). Batas [unggahan dan respons 4,5 MB](https://vercel.com/docs/functions/limitations#request-body-size) berlaku pada pemrosesan PDF saat ini, termasuk hasil yang membesar setelah rasterisasi. Progres dan pembatalan disimpan per instance; penskalaan otomatis dapat mengirim permintaan ke instance berbeda. Untuk pemakaian kantor dengan PDF 6 MB, hasil sekitar 10 MB, atau banyak halaman, gunakan backend terpisah yang dijelaskan di atas. Dukungan penuh melalui Vercel membutuhkan penyimpanan file dan status pekerjaan bersama serta alur pemrosesan yang sesuai batas waktu Function.

### Server sendiri dan paket sumber

Buat paket sumber dari folder proyek:

```powershell
npm --prefix frontend run package:hosting
```

Hasilnya adalah `output/hosting/Secure-PDF-Watermark.zip`, dengan folder `frontend` dan `backend` terpisah. Paket hanya memuat sumber aplikasi, konfigurasi, daftar dependensi, contoh variabel lingkungan, dan panduan. File `.env.local`, dependensi lokal, cache, hasil build, tes, dan dokumen pengujian tidak dimasukkan. Folder tes tetap tersedia pada proyek lokal. Aset `frontend/public/pdfjs` dibuat ulang saat `npm ci` atau `npm run build` dari folder `frontend`.

Pada server, ekstrak paket dan masuk ke folder `frontend`. Pasang dependensi dengan `npm ci`, tetapkan `PDF_API_URL` ke alamat backend sebelum `npm run build`, lalu jalankan `npm start`. Jangan menggunakan `npm run dev` untuk layanan kantor.

Pasang dependensi backend dari `backend/requirements.txt`, sediakan font, lalu jalankan dari folder `backend`:

```text
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Contoh tersebut memakai frontend dan backend pada server yang sama. Gunakan alamat layanan internal jika ditempatkan terpisah. `requirements.lock.txt` menyimpan versi lingkungan pengujian, termasuk alat pengembangan; `requirements.txt` memuat dependensi aplikasi.

Gunakan HTTPS dan pengelola proses agar layanan berjalan kembali setelah restart. Atur reverse proxy untuk unggahan 50 MiB beserta tambahan multipart dan waktu proses dokumen panjang. Proxy Next.js sudah memiliki batas badan permintaan 51 MiB dan waktu tunggu 30 menit; batas penyedia hosting juga perlu sesuai.

Jalankan satu worker backend karena pembatasan pekerjaan dan status proses disimpan per instance. Penempatan beberapa instance memerlukan penyesuaian pengelolaan pekerjaan dan progres. Aplikasi belum menyediakan akun pengguna; pengelola server perlu menentukan akses sesuai jaringan dan kebijakan kantor.
