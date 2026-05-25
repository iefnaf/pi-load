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

interface SessionHeader {
  type: string;
  version: number;
  id: string;
  timestamp: string;
  cwd: string;
}

interface SessionEntry {
  id: string;
  parentId: string | null;
  [key: string]: unknown;
}

interface SessionData {
  header: SessionHeader;
  entries: SessionEntry[];
  leafId: string | null;
}

/**
 * Extracts the active branch from a pi session HTML export and returns it
 * as a JSONL string ready for SessionManager.open() / ctx.switchSession().
 *
 * The caller's cwd replaces the sender's cwd to avoid MissingSessionCwdError.
 * systemPrompt and tools are intentionally excluded — pi regenerates them.
 */
export function extractSessionJsonl(html: string, currentCwd: string): string {
  // 1. Find the session-data script tag
  const idx = html.indexOf('id="session-data"');
  if (idx === -1) throw new Error("Invalid session: no session data found");
  const start = html.indexOf(">", idx) + 1;
  const end = html.indexOf("</script>", start);
  if (end === -1) throw new Error("Invalid session: malformed session data");
  const raw = html.slice(start, end).trim();

  // 2. Decode and parse
  const decoded = Buffer.from(raw, "base64").toString("utf-8");
  let data: SessionData;
  try {
    data = JSON.parse(decoded);
  } catch {
    throw new Error("Invalid session: corrupted payload");
  }

  // 3. Replace cwd
  const header: SessionHeader = { ...data.header, cwd: currentCwd };

  // 4. Handle null leafId — output header only
  if (data.leafId === null) {
    return JSON.stringify(header) + "\n";
  }

  // 5. Build id→entry map and verify leafId
  const byId = new Map<string, SessionEntry>();
  for (const entry of data.entries) {
    byId.set(entry.id, entry);
  }
  if (!byId.has(data.leafId)) {
    throw new Error("Invalid session: leafId not found");
  }

  // 6. Walk parentId chain from leafId to root (leaf→root), then reverse
  const branch: SessionEntry[] = [];
  let current: string | null = data.leafId;
  while (current !== null) {
    const entry = byId.get(current);
    if (!entry) break;
    branch.push(entry);
    current = entry.parentId;
  }
  branch.reverse(); // now root→leaf

  // 7. Re-linearize parentId values
  const linearized = branch.map((entry, i) => ({
    ...entry,
    parentId: i === 0 ? null : branch[i - 1].id,
  }));

  // 8. Serialize to JSONL (systemPrompt/tools already excluded — they are not in entries)
  const lines = [JSON.stringify(header), ...linearized.map((e) => JSON.stringify(e))];
  return lines.join("\n") + "\n";
}
