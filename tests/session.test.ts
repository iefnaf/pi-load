import { describe, expect, it } from "bun:test";
import { parseGistId } from "../extensions/load/session.ts";

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
