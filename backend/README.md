# Backend Secure PDF Watermark

Layanan FastAPI untuk menambahkan watermark pada seluruh halaman PDF. PyMuPDF merender halaman, Pillow menyatukan watermark dengan gambar halaman, lalu layanan membuat PDF hasil.

## Menjalankan layanan

Dari folder proyek pada Windows PowerShell:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
Set-Location backend
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Gunakan Python 3.11 atau lebih baru. Pada Linux, jalankan Python dari `.venv/bin/python`. Font Liberation atau DejaVu harus tersedia pada server. Direktori font tambahan dapat ditetapkan melalui `WATERMARK_FONT_DIR`.

`requirements.txt` berisi dependensi aplikasi. `requirements-dev.txt` menambahkan pytest, HTTPX, dan Ruff untuk pengembangan. `requirements.lock.txt` mencatat versi lingkungan pengujian lengkap.

- Pemeriksaan layanan: `GET /health` mengembalikan `{"status":"ok"}`.
- Dokumentasi interaktif: `/docs`.
- Skema API: `/openapi.json`.

## Pemrosesan PDF

`POST /api/pdf/process` menerima `multipart/form-data` dengan kolom `file` berisi PDF dan `config` berisi JSON pengaturan. Kolom `progressId` opsional berisi UUID v4 untuk memeriksa progres dan membatalkan proses.

Contoh `config`:

```json
{
  "text": "DOKUMEN INTERNAL",
  "font": "Arial",
  "fontSize": 32,
  "position": "middle-center",
  "angle": 45,
  "color": "#E64610",
  "opacity": 0.4,
  "type": "single",
  "spaceX": 20,
  "spaceY": 20,
  "outputQuality": "compact"
}
```

| `outputQuality` | Pilihan | Resolusi dan kompresi |
| --- | --- | --- |
| `compact` | Ringan & jelas (bawaan) | 150 DPI, palet warna/Flate atau JPEG kualitas 70–75. |
| `economy` | Hemat | 100 DPI, JPEG kualitas 70. |
| `balanced` | Seimbang | 150 DPI, JPEG kualitas 80. |
| `high` | Tinggi | 300 DPI, JPEG kualitas 85. |

Mode `compact` memilih palet 256 warna ketika perubahan warna masih dalam batas dan ukuran lebih kecil daripada JPEG. Halaman dengan foto atau warna kompleks dapat menggunakan JPEG. Resolusi tetap 150 DPI dan kualitas JPEG tidak diturunkan di bawah 70. Target sekitar 10 MiB dapat terlampaui untuk mempertahankan kualitas.

Hasil berhasil mempunyai tipe `application/pdf` dan nama `<nama_asli>_secured.pdf`. Nama file dibersihkan sebelum dipakai. Pesan kegagalan dikirim sebagai JSON pada kolom `detail`.

| Kode | Arti |
| --- | --- |
| 200 | PDF hasil tersedia. |
| 413 | Ukuran unggahan melebihi batas. |
| 415 | Format unggahan bukan PDF. |
| 422 | PDF atau pengaturan tidak didukung. |
| 499 | Pekerjaan dibatalkan. |
| 503 | Server sedang memproses PDF lain atau masih menyelesaikan pembatalan. |
| 500 | Pemrosesan atau pemeriksaan hasil gagal. |

Batas bawaan: 50 MiB per unggahan, 200 halaman, dan 25 juta piksel per halaman. Teks watermark wajib berisi 1–256 karakter, ukuran huruf 8–200 pt, rotasi −180 sampai 180 derajat, kepekatan 0–1, jarak 0–200 mm, serta warna HEX enam digit. Kolom pengaturan tambahan ditolak. PDF dengan kata sandi tidak didukung.

## Progres dan pembatalan

`GET /api/pdf/progress/{progressId}` mengembalikan `{"percentage": n}` selama pekerjaan aktif. Progres mengikuti jumlah halaman yang selesai. Nilainya dibatasi sampai 99 sebelum hasil selesai disimpan dan diperiksa. Frontend menunggu PDF diterima sebelum menutup indikator progres.

`POST /api/pdf/cancel/{progressId}` meminta penghentian pekerjaan. Worker menyelesaikan halaman yang sedang dikerjakan, membuang hasil parsial, dan melepas pekerjaan aktif. Permintaan pembatalan mengembalikan 204 setelah itu, sehingga proses berikutnya dapat dimulai. ID yang sudah tidak aktif juga menghasilkan 204. Jika penghentian belum selesai dalam 60 detik, layanan mengembalikan 503.

ID tidak valid menghasilkan 422. Permintaan progres untuk ID yang tidak aktif menghasilkan 404. Respons progres dan hasil menggunakan `Cache-Control: no-store`. ID hanya dipakai untuk pekerjaan terkait dan tidak perlu dibagikan kepada pengguna lain.

## Hasil dan penyimpanan sementara

Ukuran, urutan, dan jumlah halaman dipertahankan. Setiap halaman hasil memuat satu gambar dengan watermark yang menyatu. Teks tidak lagi dapat dipilih atau dicari. Formulir, tautan, lampiran, dan lapisan terpisah dari PDF asli tidak disalin.

Layanan memproses satu halaman pada satu waktu. Gambar kerja dilepas setelah halaman selesai. Dokumen sumber dan gambar hasil yang sudah dikompresi tetap memakai memori sampai PDF disimpan; kebutuhan RAM dan ukuran hasil bertambah mengikuti isi dokumen.

Input, hasil, dan progres disimpan pada direktori sementara. Direktori dibersihkan setelah hasil dikirim atau proses gagal. Layanan tidak menyimpan riwayat dokumen. PDF berbasis teks dapat menjadi lebih besar setelah seluruh halaman diubah menjadi gambar; ukuran akhir tidak dijamin lebih kecil daripada sumber.

## Konfigurasi server

Frontend secara bawaan memakai proxy Next.js melalui `PDF_API_URL`. Backend dapat tetap berada di `127.0.0.1:8000` jika keduanya berjalan pada server yang sama.

Untuk koneksi browser langsung ke backend, tetapkan `FRONTEND_ORIGINS` ke origin frontend yang diizinkan, misalnya `https://pdf.kantor.example`. Beberapa origin dipisahkan koma. Origin harus memakai HTTP atau HTTPS tanpa path, wildcard, atau kredensial. Nilai bawaan mengizinkan `http://localhost:3000` dan `http://127.0.0.1:3000`.

Variabel lingkungan ditetapkan sebelum Uvicorn dimulai. `backend/.env.example` adalah contoh dan tidak dibaca otomatis. CORS tidak menentukan siapa yang boleh menggunakan layanan dari klien non-browser; pengaturan akses tetap dilakukan pada infrastruktur kantor.

Jalankan satu worker Uvicorn. Satu instance hanya mengerjakan satu PDF pada saat yang sama; permintaan tambahan mendapat 503. Pengelolaan progres dan pembatalan juga berada pada instance tersebut. Penambahan instance memerlukan pengelolaan pekerjaan dan status bersama.

Sediakan RAM, ruang penyimpanan sementara, HTTPS, dan waktu tunggu reverse proxy yang sesuai untuk dokumen panjang. Panduan frontend dan pembuatan paket hosting tersedia pada [README proyek](../README.md).

## Tes

Dari folder `backend`, pasang `requirements-dev.txt`, lalu jalankan:

```powershell
.venv/Scripts/python.exe -m pytest
.venv/Scripts/python.exe -m ruff check app tests
.venv/Scripts/python.exe -m ruff format --check app tests
```

Tes berada pada proyek lokal dan tidak disertakan dalam paket sumber hosting. `scripts/verify_download.py` dipakai oleh tes browser untuk memeriksa PDF yang diunduh.
