import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { preflight, verify } from "./guard.mjs";

function git(repo, ...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function fixture() {
  const repo = mkdtempSync(join(tmpdir(), "triathlon-sync-"));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  writeFileSync(join(repo, "tracker.md"), "# Tracker\n\nBefore hook\n\nAfter hook\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "base");
  git(repo, "branch", "upstream");
  git(repo, "switch", "-qc", "fork");
  writeFileSync(
    join(repo, "tracker.md"),
    "# Tracker\n\nBefore hook\n\n<!-- TRIATHLON-FORK-BEGIN -->\nTriathlon option\n<!-- TRIATHLON-FORK-END -->\n\nAfter hook\n"
  );
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "fork delta");
  return repo;
}

test("marker regions survive an upstream edit to their file", () => {
  const repo = fixture();
  git(repo, "switch", "-q", "upstream");
  writeFileSync(join(repo, "tracker.md"), "# Tracker updated\n\nBefore hook\n\nAfter hook\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "upstream edit");
  git(repo, "switch", "-q", "fork");

  preflight({ repo, forkRef: "fork", upstreamRef: "upstream" });
  writeFileSync(
    join(repo, "tracker.md"),
    "# Tracker updated\n\nBefore hook\n\n<!-- TRIATHLON-FORK-BEGIN -->\nTriathlon option\n<!-- TRIATHLON-FORK-END -->\n\nAfter hook\n"
  );
  verify({ repo, forkRef: "fork", upstreamRef: "upstream" });
});

test("a deleted upstream hook stops preflight and writes the PR report", () => {
  const repo = fixture();
  git(repo, "switch", "-q", "upstream");
  writeFileSync(join(repo, "tracker.md"), "# Tracker\n\nAfter hook\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "delete hook");
  git(repo, "switch", "-q", "fork");
  const reportPath = join(repo, "report.md");

  assert.throws(
    () => preflight({ repo, forkRef: "fork", upstreamRef: "upstream", reportPath }),
    /hook lines are missing/
  );
  assert.match(readFileSync(reportPath, "utf8"), /Upstream sync blocked/);
  assert.match(readFileSync(reportPath, "utf8"), /No fork region was moved or dropped/);
});

test("postflight rejects a changed marker region", () => {
  const repo = fixture();
  writeFileSync(
    join(repo, "tracker.md"),
    "# Tracker\n\nBefore hook\n\n<!-- TRIATHLON-FORK-BEGIN -->\nChanged option\n<!-- TRIATHLON-FORK-END -->\n\nAfter hook\n"
  );

  assert.throws(() => verify({ repo, forkRef: "fork", upstreamRef: "upstream" }), /regions changed/);
});
