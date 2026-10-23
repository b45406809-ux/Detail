/** Use only the ingress-overwritten Cloudflare client IP header. */
export function trustedEdgeIp(request: Request): string | null {
  const value = request.headers.get('cf-connecting-ip')?.trim() ?? '';
  if (!value || value.length > 80 || value.includes(',')) return null;
  return value;
}
