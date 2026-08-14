const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAILS = 10;

export function parseEmails(input: string | string[] | undefined | null): string[] {
  if (Array.isArray(input)) {
    return input.map(e => String(e).trim()).filter(isValidEmail).slice(0, MAX_EMAILS);
  }
  if (!input) return [];
  return String(input)
    .split(/[,;]/)
    .map(e => e.trim())
    .filter(isValidEmail)
    .filter((e, i, arr) => arr.indexOf(e) === i)
    .slice(0, MAX_EMAILS);
}

export function formatEmails(emails: string[] | undefined | null): string {
  if (!emails || emails.length === 0) return '';
  return emails.join(', ');
}

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function hasInvalidEmail(input: string): boolean {
  if (!input.trim()) return false;
  return String(input)
    .split(/[,;]/)
    .map(e => e.trim())
    .filter(Boolean)
    .some(e => !isValidEmail(e));
}