# Reconcile the Triathlon skills fork

Reconcile the checked-out fork with upstream. The action has already merged the upstream ref without committing, and the deterministic preflight has confirmed that every fork marker still has an unambiguous upstream hook point.

1. Inspect the worktree and locate every merge-conflict marker.
2. Resolve every conflict by taking the upstream version for every file and line except these fork-owned forms:
   - Preserve each complete region from `<!-- TRIATHLON-FORK-BEGIN -->` through `<!-- TRIATHLON-FORK-END -->` byte-for-byte and keep it at its verified hook point.
   - Preserve each whole new file added by the fork byte-for-byte when that path is absent upstream.
3. Finish with no conflict markers and no generated notes, summaries, reports, or unrelated edits. The action owns staging, verification, commits, pushes, and pull requests.

The postflight guard compares the result to both refs. It accepts upstream content plus the exact fork-owned regions and files; every other result fails the run.
