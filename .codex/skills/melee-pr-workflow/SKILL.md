---
name: melee-pr-workflow
description: "Top-level Melee PR workflow skill. Use when refreshing the orchestrator-owned past-PR corpus, syncing or rebasing the parent doldecomp/melee checkout, preparing a PR for handoff, running PR regression checks, updating PR reports, or coordinating GitHub PR review/CI work."
---

# Melee PR Workflow

This is the single top-level skill for Melee PR-adjacent work. It routes to the
decomp orchestrator for PR knowledge refresh and regression gates, while keeping
parent Melee git/PR work separate from the nested `decomp-orchestrator/` repo.

## Guardrails

- Treat `decomp-orchestrator/` as an unrelated nested Git repository unless the user explicitly asks to work on the orchestrator itself.
- Run parent Melee git sync/rebase commands from the parent Melee checkout, not from inside `decomp-orchestrator/`.
- Mainline is `master`; use `origin/master` as the rebase and regression baseline.
- Do not stage, commit, reset, rebase, or push `decomp-orchestrator/` as part of parent Melee PR work.
- Inspect `git status --short --ignore-submodules=all` before mutating the parent checkout.
- Never use `git reset --hard` or discard local work as part of this workflow.

## Refresh PR Knowledge

Use this path when the user asks to refresh recent PR data, comments, reviews,
diffs, searchable postmortems, file-card context, or past-PR graph/search data.

Preview the fetch scope:

```bash
python3 decomp-orchestrator/knowledge/sources/past_prs/commands/fetch_recent_pr_dump.py --dry-run
```

Fetch missing recent PRs and scaffold searchable records:

```bash
python3 decomp-orchestrator/knowledge/sources/past_prs/commands/fetch_recent_pr_dump.py
```

Refresh recently updated PRs whose comments or reviews may have changed:

```bash
python3 decomp-orchestrator/knowledge/sources/past_prs/commands/fetch_recent_pr_dump.py \
  --activity updated \
  --refresh-existing \
  --postmortem-scope fetched
```

Run Pi-reviewed postmortems for the current dump:

```bash
python3 decomp-orchestrator/knowledge/sources/past_prs/commands/build_pr_postmortems.py \
  --dump-root decomp-orchestrator/knowledge/sources/past_prs/data/current \
  --run-agent \
  --rerun-existing \
  --jobs 16
```

Rebuild only the past-PR graph slice after corpus changes:

```bash
bun run --cwd decomp-orchestrator kg:rebuild -- --repo-root "$PWD" --sources past_prs
```

Notes:

- `kg-maintain` and `trigger-agent` can index pending postmortems and rebuild graph state, but they do not fetch fresh GitHub PR data.
- The PR corpus lives under `decomp-orchestrator/knowledge/sources/past_prs/data`.
- The fetcher uses `gh api`; GitHub CLI auth must be available.

## Sync Repo And PR Corpus

Use this path when the user asks to sync, refresh, rebase, or update the local
checkout and PR library together.

Standard sync:

```bash
python3 decomp-orchestrator/knowledge/sources/past_prs/commands/sync_repo_and_pr_library.py \
  --postmortem-scope fetched \
  --postmortem-jobs 16
```

Refresh recently updated PR records while syncing:

```bash
python3 decomp-orchestrator/knowledge/sources/past_prs/commands/sync_repo_and_pr_library.py \
  --pr-activity updated \
  --refresh-existing-prs \
  --postmortem-scope fetched \
  --postmortem-jobs 16
```

Skip git and only refresh the PR corpus:

```bash
python3 decomp-orchestrator/knowledge/sources/past_prs/commands/sync_repo_and_pr_library.py \
  --skip-git \
  --postmortem-scope fetched \
  --postmortem-jobs 16
```

If rebase stops, leave the worktree in Git's rebase state and report the
conflicted files plus Git's suggested next command.

## Prepare PR Handoff

Use this path when the user asks to prepare, finalize, refresh, build-check,
regression-check, update, or hand off a Melee PR.

1. Inspect status and PR context:

```bash
git status --short --branch --ignore-submodules=all
git -C decomp-orchestrator status --short
git remote -v
gh pr status --repo doldecomp/melee
```

2. Sync mainline and recently updated PR knowledge:

```bash
python3 decomp-orchestrator/knowledge/sources/past_prs/commands/sync_repo_and_pr_library.py \
  --pr-activity updated \
  --refresh-existing-prs \
  --postmortem-scope fetched \
  --postmortem-jobs 16
```

3. Pull active PR comments and reviews:

```bash
gh pr view --repo doldecomp/melee --comments
gh pr view --repo doldecomp/melee --json number,url,title,state,isDraft,baseRefOid,headRefOid,reviewDecision,mergeStateStatus
gh api --paginate repos/doldecomp/melee/pulls/<PR_NUMBER>/comments
gh api --paginate repos/doldecomp/melee/issues/<PR_NUMBER>/comments
gh api --paginate repos/doldecomp/melee/pulls/<PR_NUMBER>/reviews
```

4. Rebuild a baseline from current `origin/master`:

```bash
BASE_SHA="$(git rev-parse origin/master)"
BASE_DIR="/tmp/melee-baseline-${BASE_SHA}"
if [ ! -f "$BASE_DIR/build/GALE01/baseline.json" ]; then
  git worktree add --detach "$BASE_DIR" "$BASE_SHA"
  (cd "$BASE_DIR" && ninja baseline)
fi
cp "$BASE_DIR/build/GALE01/baseline.json" build/GALE01/baseline.json
```

5. Run build and regression gates:

```bash
ninja
bun run --cwd decomp-orchestrator orch -- \
  --repo-root "$PWD" \
  --state-dir "$PWD/.decomp-orchestrator-state/pr-prepare" \
  regression-check \
  --target changes_all \
  --report-title "Report for GALE01 PR handoff" \
  --report-max-rows 300
```

6. Fix and rerun until the handoff state is clean:

- `build/GALE01/main.dol: OK`
- zero broken matches
- zero fuzzy regressions in unmatched items
- zero unit, section, or function metric regressions
- no unresolved actionable review comments or relevant build warnings/errors

7. Commit or amend only parent Melee PR files, then push safely:

```bash
git status --short --untracked-files=no --ignore-submodules=all
git diff --check
git add <melee-source-files>
git commit --amend --no-edit
git push --force-with-lease fork HEAD:<branch>
```

8. Update or create the PR, then watch CI:

```bash
gh pr edit <PR_NUMBER> --repo doldecomp/melee --body-file <report.md>
gh pr checks <PR_NUMBER> --repo doldecomp/melee
gh run view <RUN_ID> --repo doldecomp/melee --log-failed
```

Include PR URL, head SHA, base SHA, changed units, match/regression summary,
local gate results, and CI state in the final response and PR body.

## Verification

For skill maintenance or command sanity checks:

```bash
python3 -m py_compile \
  decomp-orchestrator/knowledge/sources/past_prs/commands/sync_repo_and_pr_library.py \
  decomp-orchestrator/knowledge/sources/past_prs/commands/fetch_recent_pr_dump.py \
  decomp-orchestrator/knowledge/sources/past_prs/commands/build_pr_postmortems.py
```
