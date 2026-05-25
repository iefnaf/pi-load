import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { extractSessionJsonl, parseGistId } from "./session.js";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("load", {
    description: "Load a shared session from a pi.dev or gist.github.com URL",
    handler: async (args, ctx) => {
      // 1. Parse URL → Gist ID
      const gistId = parseGistId(args.trim());
      if (!gistId) {
        ctx.ui.notify(
          "Usage: /load <https://pi.dev/session/#... or https://gist.github.com/user/...>",
          "error",
        );
        return;
      }

      // 2. Verify gh is installed and logged in
      let authResult;
      try {
        authResult = await pi.exec("gh", ["auth", "status"]);
      } catch {
        ctx.ui.notify(
          "GitHub CLI (gh) is not installed. Install it from https://cli.github.com/",
          "error",
        );
        return;
      }
      if (authResult.code !== 0) {
        ctx.ui.notify(
          "GitHub CLI is not logged in. Run 'gh auth login' first.",
          "error",
        );
        return;
      }

      // 3. Download gist
      ctx.ui.notify("Loading session…", "info");
      const dl = await pi.exec("gh", ["gist", "view", gistId, "--filename", "session.html"]);
      if (dl.code !== 0) {
        ctx.ui.notify(`Failed to fetch session: ${dl.stderr.trim() || "unknown error"}`, "error");
        return;
      }

      // 4. Convert HTML → JSONL → temp file → switch session
      const tmpPath = join(tmpdir(), `pi-load-${gistId}.jsonl`);
      try {
        const jsonl = extractSessionJsonl(dl.stdout, ctx.cwd);
        writeFileSync(tmpPath, jsonl, "utf-8");
        await ctx.switchSession(tmpPath);
      } catch (err) {
        ctx.ui.notify(
          err instanceof Error ? err.message : String(err),
          "error",
        );
      } finally {
        try { unlinkSync(tmpPath); } catch { /* best-effort */ }
      }
    },
  });
}
