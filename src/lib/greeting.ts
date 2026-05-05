// Time-based English greeting + English first-name extraction.

export function getTimeGreeting(date: Date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 18) return 'Good afternoon';
  if (h >= 18 && h < 22) return 'Good evening';
  return 'Hello';
}

type ProfileLike = {
  name?: string | null;
  hdec_eng_name?: string | null;
  login_id?: string | null;
} | null | undefined;

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Extracts a single English first name from the profile.
 * Returns empty string if none can be derived.
 */
export function extractEnglishFirstName(profile: ProfileLike): string {
  if (!profile) return '';

  const candidates: string[] = [];
  if (profile.hdec_eng_name) candidates.push(profile.hdec_eng_name);
  if (profile.name) candidates.push(profile.name);

  for (const raw of candidates) {
    const match = raw.match(/[A-Za-z][A-Za-z.'-]*/);
    if (match) return titleCase(match[0]);
  }

  if (profile.login_id) {
    const first = profile.login_id.split(/[_.\-\s]/)[0];
    if (first && /[A-Za-z]/.test(first)) return titleCase(first);
  }

  return '';
}
