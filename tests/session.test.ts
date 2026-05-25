import { describe, expect, it } from "bun:test";
import { parseGistId } from "../extensions/load/session.ts";
import { extractSessionJsonl } from "../extensions/load/session.ts";

function makeSessionHtml(data: unknown): string {
  const b64 = Buffer.from(JSON.stringify(data)).toString("base64");
  return `<script id="session-data" type="application/json">${b64}</script>`;
}

describe("parseGistId", () => {
  it("parses pi.dev session URL", () => {
    expect(parseGistId("https://pi.dev/session/#55817e280d94c4caefdbbf07bd539fca"))
      .toBe("55817e280d94c4caefdbbf07bd539fca");
  });

  it("parses gist.github.com URL", () => {
    expect(parseGistId("https://gist.github.com/iefnaf/55817e280d94c4caefdbbf07bd539fca"))
      .toBe("55817e280d94c4caefdbbf07bd539fca");
  });

  it("accepts bare hex ID", () => {
    expect(parseGistId("55817e280d94c4caefdbbf07bd539fca"))
      .toBe("55817e280d94c4caefdbbf07bd539fca");
  });

  it("returns null for unrecognized input", () => {
    expect(parseGistId("https://example.com/foo")).toBeNull();
    expect(parseGistId("")).toBeNull();
    expect(parseGistId("not-a-url")).toBeNull();
  });

  it("returns null for pi.dev URL without fragment", () => {
    expect(parseGistId("https://pi.dev/session/")).toBeNull();
  });
});

describe("extractSessionJsonl", () => {
  const baseData = {
    header: {
      type: "session",
      version: 3,
      id: "test-id",
      timestamp: "2026-01-01T00:00:00Z",
      cwd: "/sender/original/path",
    },
    entries: [
      { id: "e1", parentId: null, type: "model_change", modelId: "claude" },
      { id: "e2", parentId: "e1", type: "message", message: { role: "user" } },
      { id: "e3", parentId: "e2", type: "message", message: { role: "assistant" } },
    ],
    leafId: "e3",
    systemPrompt: "some system prompt",
    tools: [{ name: "bash" }],
  };

  it("replaces cwd with the provided currentCwd", () => {
    const html = makeSessionHtml(baseData);
    const jsonl = extractSessionJsonl(html, "/my/local/path");
    const header = JSON.parse(jsonl.split("\n")[0]);
    expect(header.cwd).toBe("/my/local/path");
  });

  it("preserves other header fields", () => {
    const html = makeSessionHtml(baseData);
    const jsonl = extractSessionJsonl(html, "/my/path");
    const header = JSON.parse(jsonl.split("\n")[0]);
    expect(header.type).toBe("session");
    expect(header.version).toBe(3);
    expect(header.id).toBe("test-id");
  });

  it("outputs entries in root→leaf (chronological) order", () => {
    const html = makeSessionHtml(baseData);
    const jsonl = extractSessionJsonl(html, "/my/path");
    const lines = jsonl.trim().split("\n").slice(1); // skip header
    const ids = lines.map((l) => JSON.parse(l).id);
    expect(ids).toEqual(["e1", "e2", "e3"]);
  });

  it("re-linearizes parentId chain", () => {
    const html = makeSessionHtml(baseData);
    const jsonl = extractSessionJsonl(html, "/my/path");
    const lines = jsonl.trim().split("\n").slice(1);
    const entries = lines.map((l) => JSON.parse(l));
    expect(entries[0].parentId).toBeNull();
    expect(entries[1].parentId).toBe("e1");
    expect(entries[2].parentId).toBe("e2");
  });

  it("preserves all other entry fields", () => {
    const html = makeSessionHtml(baseData);
    const jsonl = extractSessionJsonl(html, "/my/path");
    const lines = jsonl.trim().split("\n").slice(1);
    const first = JSON.parse(lines[0]);
    expect(first.type).toBe("model_change");
    expect(first.modelId).toBe("claude");
  });

  it("excludes systemPrompt and tools from output", () => {
    const html = makeSessionHtml(baseData);
    const jsonl = extractSessionJsonl(html, "/my/path");
    expect(jsonl).not.toContain("some system prompt");
    expect(jsonl).not.toContain('"bash"');
  });

  it("only includes entries on the active branch (leafId path)", () => {
    const branchData = {
      ...baseData,
      entries: [
        { id: "root", parentId: null, type: "model_change" },
        { id: "A", parentId: "root", type: "message" },
        { id: "B", parentId: "root", type: "message" },   // active branch
        { id: "A2", parentId: "A", type: "message" },     // dead branch
      ],
      leafId: "B",
    };
    const html = makeSessionHtml(branchData);
    const jsonl = extractSessionJsonl(html, "/my/path");
    const lines = jsonl.trim().split("\n").slice(1);
    const ids = lines.map((l) => JSON.parse(l).id);
    expect(ids).toEqual(["root", "B"]);
    expect(ids).not.toContain("A");
    expect(ids).not.toContain("A2");
  });

  it("throws when no session-data script found", () => {
    expect(() => extractSessionJsonl("<html>no data here</html>", "/my/path"))
      .toThrow("Invalid session: no session data found");
  });

  it("throws when leafId is not found in entries", () => {
    const badData = { ...baseData, leafId: "nonexistent-id" };
    expect(() => extractSessionJsonl(makeSessionHtml(badData), "/my/path"))
      .toThrow("Invalid session: leafId not found");
  });

  it("handles null leafId as empty session (header only)", () => {
    const nullLeaf = { ...baseData, leafId: null };
    const jsonl = extractSessionJsonl(makeSessionHtml(nullLeaf), "/my/path");
    const lines = jsonl.trim().split("\n");
    expect(lines.length).toBe(1);
    JSON.parse(lines[0]); // must be valid JSON (the header)
  });
});
