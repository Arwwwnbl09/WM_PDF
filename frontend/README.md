# Frontend Secure PDF Watermark

Aplikasi Next.js untuk unggah PDF, pratinjau watermark, pengaturan kualitas, progres, dan unduhan hasil. Server pemrosesan PDF berada di folder `../backend`.

## Beberapa PDF sekaligus

Pilih beberapa PDF pada dialog unggahan atau tarik file-file tersebut ke area unggahan. Tombol **Tambah PDF** menambahkan file tanpa menghapus daftar sebelumnya; **Ganti semua** mengganti daftar.

Untuk membuat beberapa hasil dari satu PDF, unggah sekali lalu tekan **Buat salinan** pada file terpilih atau **Salin** di daftar. Salinan memakai PDF sumber yang sama, mengikuti pengaturan tampilannya, dan memiliki kolom teks watermark kosong untuk diisi. Setiap salinan diproses sendiri dengan nama hasil seperti `dokumen_secured_salinan_1.pdf`. Membuat salinan tidak menghapus hasil yang sudah selesai.

Setiap PDF memiliki teks dan pengaturan tampilan watermark sendiri. Isi teks pada daftar file, lalu pilih nama file untuk mengatur posisi, warna, dan huruf sambil melihat pratinjau. **Proses semua** memproses file bergantian menggunakan pengaturan masing-masing dan kualitas yang sama untuk seluruh daftar. Setiap hasil diunduh otomatis sebagai PDF terpisah setelah selesai, termasuk pada **Proses sisa**. Jika browser meminta izin unduhan beberapa file, pilih **Izinkan**. Tombol **Simpan PDF** pada setiap file tetap tersedia untuk menyimpan ulang. Dialog simpan memungkinkan penggantian nama dan pemilihan folder pada browser yang mendukungnya.

Jika satu file gagal, file berikutnya tetap diproses. **Proses sisa** mencoba kembali file yang belum selesai. Pembatalan menghentikan antrean tanpa membuang hasil yang sudah selesai. Pengaturan dikunci selama pemrosesan beberapa file; perubahan setelah selesai menghapus hasil lama untuk file yang diubah. Pemrosesan satu PDF tetap memulai unduhan secara otomatis seperti sebelumnya.

Kolom **Nama file hasil** tersedia sebelum proses untuk satu PDF dan pada setiap file di daftar. Nama dapat diubah lagi setelah PDF selesai diproses tanpa memproses ulang. Akhiran `.pdf` ditambahkan otomatis. Nama dengan spasi dan huruf Unicode dipertahankan; karakter yang tidak dapat digunakan dalam nama file ditolak. Nama dikunci selama pemrosesan.

**Kualitas PDF** menggunakan satu pilihan untuk seluruh daftar. File yang ditambahkan dan salinan mengikuti kualitas tersebut. Mengubah kualitas membuang hasil lama dari daftar agar semua file diproses ulang dengan pilihan baru. Teks, nama hasil, dan pengaturan tampilan watermark masing-masing file tetap tersimpan.

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

Repo menyediakan konfigurasi gabungan [Vercel Services](https://vercel.com/docs/services) pada `../vercel.json`. Untuk cara ini, pilih **Root Directory `./`** dan **Framework Preset `Services`**, lalu hapus `NEXT_PUBLIC_API_URL` agar permintaan API memakai domain yang sama. `/health` menguji backend. Batas unggahan/hasil 4,5 MB dan status proses per instance membuat cara ini terbatas untuk PDF kecil; baca [panduan hosting proyek](../README.md#frontend-dan-backend-dalam-vercel-services).

Jika frontend dipasang sendiri dan backend berada di layanan eksternal, gunakan:

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
