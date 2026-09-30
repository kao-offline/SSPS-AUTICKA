export function getConvexUrl() {
  const value = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!value) throw new Error("NEXT_PUBLIC_CONVEX_URL is required");
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Invalid Convex URL");
  return value;
}
