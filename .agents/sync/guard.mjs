import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export const BEGIN = "<!-- TRIATHLON-FORK-BEGIN -->";
export const END = "<!-- TRIATHLON-FORK-END -->";

function git(repo, args, options = {}) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options
  });
}

function readRefFile(repo, ref, path) {
  try {
    return git(repo, ["show", `${ref}:${path}`]);
  } catch {
    return null;
  }
}

function forkChanges(repo, base, forkRef) {
  const output = git(repo, ["diff", "--name-status", "--find-renames=100%", base, forkRef]);
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, ...paths] = line.split("\t");
      return { status, path: paths.at(-1) };
    });
}

export function markerRegions(content, path) {
  const lines = content.split("\n");
  const regions = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === END) throw new Error(`${path}: unmatched ${END}`);
    if (lines[index] !== BEGIN) continue;

    const start = index;
    const end = lines.indexOf(END, start + 1);
    if (end === -1) throw new Error(`${path}: unmatched ${BEGIN}`);
    if (lines.slice(start + 1, end).includes(BEGIN)) {
      throw new Error(`${path}: nested fork markers are not supported`);
    }

    let before = start - 1;
    while (before >= 0 && lines[before].trim() === "") before -= 1;
    let after = end + 1;
    while (after < lines.length && lines[after].trim() === "") after += 1;

    regions.push({
      text: lines.slice(start, end + 1).join("\n"),
      before: before >= 0 ? lines[before] : null,
      after: after < lines.length ? lines[after] : null
    });
    index = end;
  }

  return regions;
}

export function withoutMarkerRegions(content, path) {
  const lines = content.split("\n");
  const output = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== BEGIN) {
      output.push(lines[index]);
      continue;
    }

    const end = lines.indexOf(END, index + 1);
    if (end === -1) throw new Error(`${path}: unmatched ${BEGIN}`);
    const blankBefore = output.at(-1) === "";
    const blankAfter = lines[end + 1] === "";
    index = blankBefore && blankAfter ? end + 1 : end;
  }

  return output.join("\n");
}

function exactLineIndexes(content, line) {
  if (line === null) return [];
  return content
    .split("\n")
    .flatMap((candidate, index) => (candidate === line ? [index] : []));
}

function writeBlockedReport(reportPath, upstreamRef, upstreamSha, problems) {
  const body = [
    "# Upstream sync blocked",
    "",
    `The reconcile guard stopped before Pi because \`${upstreamRef}\` at \`${upstreamSha}\` removed or obscured a Triathlon hook point.`,
    "",
    ...problems.map((problem) => `- ${problem}`),
    "",
    "No fork region was moved or dropped. A human must choose a new hook point, update the markers on the fork's main branch, and rerun the workflow.",
    ""
  ].join("\n");
  writeFileSync(reportPath, body);
}

export function preflight({ repo = process.cwd(), forkRef = "HEAD", upstreamRef = "upstream/main", reportPath }) {
  const base = git(repo, ["merge-base", forkRef, upstreamRef]).trim();
  const upstreamSha = git(repo, ["rev-parse", upstreamRef]).trim();
  const problems = [];

  for (const change of forkChanges(repo, base, forkRef)) {
    const forkContent = readRefFile(repo, forkRef, change.path);
    const upstreamContent = readRefFile(repo, upstreamRef, change.path);

    if (change.status === "A") {
      if (upstreamContent !== null) problems.push(`\`${change.path}\`: whole-file fork addition now collides with an upstream path.`);
      continue;
    }

    if (change.status !== "M" || forkContent === null) {
      problems.push(`\`${change.path}\`: fork delta type \`${change.status}\` is not marker-managed.`);
      continue;
    }

    const regions = markerRegions(forkContent, change.path);
    if (regions.length === 0) {
      problems.push(`\`${change.path}\`: modified fork file has no TRIATHLON-FORK region.`);
      continue;
    }
    if (upstreamContent === null) {
      problems.push(`\`${change.path}\`: upstream deleted the marker-managed file.`);
      continue;
    }

    for (const [index, region] of regions.entries()) {
      const before = exactLineIndexes(upstreamContent, region.before);
      const after = exactLineIndexes(upstreamContent, region.after);
      const ordered =
        region.before === null ||
        region.after === null ||
        (before.length === 1 && after.length === 1 && before[0] < after[0]);
      if ((region.before !== null && before.length !== 1) || (region.after !== null && after.length !== 1) || !ordered) {
        problems.push(`\`${change.path}\` region ${index + 1}: surrounding upstream hook lines are missing, duplicated, or reordered.`);
      }
    }
  }

  if (problems.length > 0) {
    if (reportPath) writeBlockedReport(reportPath, upstreamRef, upstreamSha, problems);
    throw new Error(problems.join("\n"));
  }
}

export function verify({ repo = process.cwd(), forkRef = "HEAD", upstreamRef = "upstream/main" }) {
  const base = git(repo, ["merge-base", forkRef, upstreamRef]).trim();
  const changes = forkChanges(repo, base, forkRef);
  const allowed = new Set(changes.map((change) => change.path));
  const problems = [];

  const unmerged = git(repo, ["diff", "--name-only", "--diff-filter=U"]).trim();
  if (unmerged) problems.push(`Unmerged paths remain: ${unmerged.replaceAll("\n", ", ")}.`);

  for (const change of changes) {
    const forkContent = readRefFile(repo, forkRef, change.path);
    const upstreamContent = readRefFile(repo, upstreamRef, change.path);
    const worktreePath = `${repo}/${change.path}`;
    const worktreeContent = existsSync(worktreePath) ? readFileSync(worktreePath, "utf8") : null;

    if (change.status === "A") {
      if (worktreeContent !== forkContent) problems.push(`\`${change.path}\`: whole-file fork addition changed.`);
      continue;
    }

    if (change.status !== "M" || forkContent === null || upstreamContent === null || worktreeContent === null) {
      problems.push(`\`${change.path}\`: marker-managed file is missing or has an unsupported delta.`);
      continue;
    }

    const expectedRegions = markerRegions(forkContent, change.path).map((region) => region.text);
    const actualRegions = markerRegions(worktreeContent, change.path).map((region) => region.text);
    if (JSON.stringify(actualRegions) !== JSON.stringify(expectedRegions)) {
      problems.push(`\`${change.path}\`: TRIATHLON-FORK regions changed.`);
    }
    if (withoutMarkerRegions(worktreeContent, change.path) !== upstreamContent) {
      problems.push(`\`${change.path}\`: content outside TRIATHLON-FORK regions does not exactly match upstream.`);
    }
  }

  const upstreamDiff = git(repo, ["diff", "--name-only", upstreamRef]).trim().split("\n").filter(Boolean);
  for (const path of upstreamDiff) {
    if (!allowed.has(path)) problems.push(`\`${path}\`: differs from upstream without a fork-owned delta.`);
  }

  const untracked = git(repo, ["ls-files", "--others", "--exclude-standard"]).trim().split("\n").filter(Boolean);
  for (const path of untracked) {
    if (!allowed.has(path)) problems.push(`\`${path}\`: unexpected untracked file.`);
  }

  if (problems.length > 0) throw new Error(problems.join("\n"));
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

if (process.argv[1]?.endsWith("guard.mjs")) {
  const mode = process.argv[2];
  try {
    if (mode === "preflight") {
      preflight({
        forkRef: process.env.FORK_REF ?? "HEAD",
        upstreamRef: process.env.UPSTREAM_REF ?? "upstream/main",
        reportPath: process.env.SYNC_REPORT_PATH
      });
      setOutput("blocked", "false");
    } else if (mode === "verify") {
      verify({
        forkRef: process.env.FORK_REF ?? "HEAD",
        upstreamRef: process.env.UPSTREAM_REF ?? "upstream/main"
      });
    } else {
      throw new Error("Usage: node .agents/sync/guard.mjs <preflight|verify>");
    }
  } catch (error) {
    setOutput("blocked", "true");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
