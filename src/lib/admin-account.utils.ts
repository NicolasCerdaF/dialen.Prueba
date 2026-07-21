const EMAIL_USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/;

export function normalizeAdminUsername(username: string): string {
  return username.trim().replace(/\s+/g, " ");
}

export function usernameToSlug(username: string): string {
  return normalizeAdminUsername(username)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/[._-]{2,}/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 32);
}

export function isValidAdminUsername(username: string): boolean {
  const clean = normalizeAdminUsername(username);
  const slug = usernameToSlug(clean);
  return clean.length >= 3 && clean.length <= 40 && EMAIL_USERNAME_RE.test(slug);
}

export function usernameToEmail(username: string): string {
  return `${usernameToSlug(username)}@admin.dialen.local`;
}