export function apiUrl(path: string): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  // Use the frontend's origin so LAN browsers never call their own localhost.
  if (!configured) return path;
  let base: URL;
  try {
    base = new URL(configured);
  } catch {
    throw new Error("Alamat server pemrosesan tidak valid.");
  }
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error("Alamat server pemrosesan tidak valid.");
  return `${base.origin}${base.pathname.replace(/\/+$/, "")}${path}`;
}
