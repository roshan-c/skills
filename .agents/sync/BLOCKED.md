# Upstream sync blocked

The reconcile guard stopped before Pi because `upstream/main` at `5beb35b040e3de97e54fa9e386d7e42d15c295c2` removed or obscured a Triathlon hook point.

- `.changeset/add-implement-spec-skill.md`: fork delta type `D` is not marker-managed.
- `.changeset/domain-modeling-trigger-context-adr.md`: fork delta type `D` is not marker-managed.
- `.changeset/fix-yaml-frontmatter-colons.md`: fork delta type `D` is not marker-managed.
- `.changeset/grilling-add-hr-between-questions.md`: fork delta type `D` is not marker-managed.
- `.changeset/grilling-remove-em-dashes.md`: fork delta type `D` is not marker-managed.
- `.changeset/remove-em-dashes-repo-wide.md`: fork delta type `D` is not marker-managed.
- `.changeset/skill-tool-invocation-terminology.md`: fork delta type `D` is not marker-managed.
- `.changeset/user-invoked-skill-invocation.md`: fork delta type `D` is not marker-managed.
- `.changeset/wait-what-context-map.md`: fork delta type `D` is not marker-managed.
- `.claude-plugin/plugin.json`: modified fork file has no TRIATHLON-FORK region.
- `CHANGELOG.md`: modified fork file has no TRIATHLON-FORK region.
- `package.json`: modified fork file has no TRIATHLON-FORK region.

No fork region was moved or dropped. A human must choose a new hook point, update the markers on the fork's main branch, and rerun the workflow.
