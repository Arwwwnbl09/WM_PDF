import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Secure PDF Watermark",
  description:
    "Tambahkan watermark ke PDF, atur tampilannya, lalu simpan hasilnya.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
