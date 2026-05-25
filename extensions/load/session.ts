/**
 * Extracts a GitHub Gist ID from a pi share URL or bare ID.
 *
 * Accepts:
 *   https://pi.dev/session/#<id>
 *   https://gist.github.com/<user>/<id>
 *   <bare-hex-id>
 */
export function parseGistId(url: string): string | null {
  const trimmed = url.trim();

  // pi.dev viewer URL: https://pi.dev/session/#<id>
  const piDevMatch = trimmed.match(/^https:\/\/pi\.dev\/session\/#([0-9a-f]{20,})$/i);
  if (piDevMatch) return piDevMatch[1];

  // GitHub Gist URL: https://gist.github.com/<user>/<id>
  const gistMatch = trimmed.match(/^https:\/\/gist\.github\.com\/[^/]+\/([0-9a-f]{20,})$/i);
  if (gistMatch) return gistMatch[1];

  // Bare hex ID (≥20 chars, only hex)
  if (/^[0-9a-f]{20,}$/i.test(trimmed)) return trimmed;

  return null;
}
