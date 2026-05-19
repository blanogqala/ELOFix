const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when the string looks like an email (legacy stored display names). */
export function isEmailLike(value: string | undefined | null): boolean {
  return EMAIL_LIKE.test(String(value || '').trim());
}

/**
 * Show a person's name only — never an email. Use for chat, notes, notifications.
 */
export function formatPersonDisplayName(
  value: string | undefined | null,
  fallback = 'User'
): string {
  const t = String(value || '').trim();
  if (!t || isEmailLike(t)) return fallback;
  return t;
}

/**
 * Strip legacy support messages like "Name (email@x.com): body" → "Name: body" or just body.
 */
export function sanitizeNotificationMessage(message: string): string {
  const m = String(message || '');
  const nameAndEmail = m.match(/^(.+?)\s*\([^)]*@[^)]+\):\s*([\s\S]*)$/);
  if (nameAndEmail) {
    const name = formatPersonDisplayName(nameAndEmail[1], 'User');
    const body = nameAndEmail[2] ?? '';
    return body ? `${name}: ${body}` : name;
  }
  const emailOnly = m.match(/^[^\s@]+@[^\s@]+\.[^\s@]+:\s*([\s\S]*)$/);
  if (emailOnly) return emailOnly[1] ?? m;
  return m;
}
