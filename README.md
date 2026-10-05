# Secure PDF Watermark

Aplikasi untuk memberi watermark pada seluruh halaman PDF. Dokumen dipilih melalui tombol unggah atau seret dan lepas, lalu diperiksa di pratinjau sebelum diproses.

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

Frontend, dari folder proyek:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Perintah penyalinan konfigurasi hanya diperlukan pada pemasangan baru. Buka `http://localhost:3000`. Aset PDF.js disiapkan otomatis saat pemasangan dependensi dan build, sehingga pratinjau tidak memerlukan CDN.

Backend, dari folder proyek:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
Set-Location backend
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Pada Linux, gunakan `.venv/bin/python`. Pastikan server mempunyai font Liberation atau DejaVu. Font lain dapat disediakan melalui `WATERMARK_FONT_DIR`. Panduan API tersedia di [backend/README.md](backend/README.md).

## Koneksi frontend dan backend

`PDF_API_URL` berisi alamat backend yang dapat dijangkau oleh server Next.js. Nilai lokalnya adalah `http://127.0.0.1:8000`. Browser meminta `/api/pdf/...` pada alamat frontend, lalu Next.js meneruskan permintaan ke backend. Dengan cara ini, pengguna dari jaringan kantor tidak perlu mengakses port backend.

Untuk akses pengembangan melalui IP, sesuaikan `allowedDevOrigins` pada `next.config.ts` dengan IP server. Alamat IP tidak memakai protokol atau port pada pengaturan tersebut. Restart frontend setelah konfigurasi berubah.

`NEXT_PUBLIC_API_URL` dipakai untuk koneksi browser langsung ke backend dan wajib diisi saat hosting frontend di Vercel. Alamatnya harus dapat dijangkau perangkat pengguna, dan `FRONTEND_ORIGINS` backend harus mencantumkan alamat frontend. Nilai `NEXT_PUBLIC_API_URL` ditetapkan sebelum build; perubahan memerlukan redeploy. Pada server lokal atau server kantor yang menjalankan Next.js sendiri, kosongkan variabel ini untuk memakai proxy bawaan.

Backend membaca variabel lingkungan saat dimulai. File `backend/.env.example` hanya contoh dan tidak dimuat otomatis. Daftar `FRONTEND_ORIGINS` dipisahkan koma, memakai alamat lengkap tanpa path atau wildcard.

## Pemeriksaan

Jalankan dari folder proyek:

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

Deployment Next.js di Vercel tidak menjalankan folder `backend/`. Backend Python perlu berjalan sebagai layanan terpisah dengan alamat HTTPS. `127.0.0.1:8000` dan alamat jaringan kantor tidak dapat dipakai untuk menghubungkan Vercel ke komputer lokal. Konfigurasi build sekarang memeriksa `NEXT_PUBLIC_API_URL` pada Vercel agar pengaturan tersebut tidak terlewat.

Salah satu cara memasang backend adalah melalui [Render](https://render.com/docs/docker):

1. Di Render, pilih **New → Blueprint**, lalu hubungkan repo `Arwwwnbl09/WM_PDF`. File `render.yaml` menyiapkan layanan Docker backend, font, satu instance, dan pemeriksaan `/health`.
2. Tinjau paket layanan sebelum membuatnya. Blueprint memakai paket gratis untuk uji coba file kecil. Layanan gratis dapat berhenti saat tidak digunakan dan RAM-nya terbatas; gunakan sumber daya yang sesuai untuk dokumen kantor banyak halaman. Informasi paket tersedia di [panduan Render](https://render.com/docs/free).
3. Tunggu backend aktif. Buka `https://alamat-backend/health` dan pastikan responsnya `{"status":"ok"}`.
4. Di Vercel, buka proyek **wm-pdf → Settings → Environment Variables**. Isi `NEXT_PUBLIC_API_URL` dengan `https://alamat-backend`, tanpa tambahan `/api/pdf`, pada lingkungan **Production**.
5. Di backend, isi `FRONTEND_ORIGINS=https://wm-pdf.vercel.app`. Blueprint sudah memakai alamat ini. Tambahkan domain lain yang dipakai, dipisahkan koma; jangan menggunakan wildcard.
6. Redeploy frontend Vercel agar alamat backend masuk ke build baru. Uji satu PDF kecil, lalu dokumen dengan ukuran dan jumlah halaman yang biasa dipakai di kantor. Uji juga pembatalan dan proses ulang.

Dengan konfigurasi ini, unggahan, progres, pembatalan, dan hasil PDF dikirim langsung antara browser dan backend. Proxy Vercel tidak dipakai untuk pemrosesan PDF karena [batas waktu proxy eksternal 120 detik](https://vercel.com/docs/limits#proxied-request-timeout). Menempatkan pemroses PDF sebagai Vercel Function juga memerlukan perubahan arsitektur karena [batas badan permintaan dan respons 4,5 MB](https://vercel.com/docs/functions/limitations#request-body-size).

Backend juga bisa dijalankan di Railway atau server kantor melalui [Dockerfile backend](backend/Dockerfile); sesuaikan alamat HTTPS dan origin frontend. Jalankan satu instance dan satu worker Uvicorn agar progres serta pembatalan menuju proses yang sama.

### Server sendiri dan paket sumber

Buat paket sumber dari folder proyek:

```powershell
npm run package:hosting
```

Hasilnya adalah `output/hosting/Secure-PDF-Watermark.zip`. Paket hanya memuat sumber aplikasi, konfigurasi, daftar dependensi, contoh variabel lingkungan, dan panduan. File `.env.local`, dependensi lokal, cache, hasil build, tes, dan dokumen pengujian tidak dimasukkan. Folder tes tetap tersedia pada proyek lokal. Aset `public/pdfjs` dibuat ulang saat `npm ci` atau `npm run build`.

Pada server, ekstrak paket dan pasang dependensi frontend dengan `npm ci`. Tetapkan `PDF_API_URL` ke alamat backend sebelum `npm run build`, lalu jalankan `npm start`. Jangan menggunakan `npm run dev` untuk layanan kantor.

Pasang dependensi backend dari `backend/requirements.txt`, sediakan font, lalu jalankan dari folder `backend`:

```text
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Contoh tersebut memakai frontend dan backend pada server yang sama. Gunakan alamat layanan internal jika ditempatkan terpisah. `requirements.lock.txt` menyimpan versi lingkungan pengujian, termasuk alat pengembangan; `requirements.txt` memuat dependensi aplikasi.

Gunakan HTTPS dan pengelola proses agar layanan berjalan kembali setelah restart. Atur reverse proxy untuk unggahan 50 MiB beserta tambahan multipart dan waktu proses dokumen panjang. Proxy Next.js sudah memiliki batas badan permintaan 51 MiB dan waktu tunggu 30 menit; batas penyedia hosting juga perlu sesuai.

Jalankan satu worker backend karena pembatasan pekerjaan dan status proses disimpan per instance. Penempatan beberapa instance memerlukan penyesuaian pengelolaan pekerjaan dan progres. Aplikasi belum menyediakan akun pengguna; pengelola server perlu menentukan akses sesuai jaringan dan kebijakan kantor.
