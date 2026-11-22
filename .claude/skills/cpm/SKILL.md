---
name: cpm
description: Commit, push and merge the current changes. Commits staged and unstaged work with a clear message, pushes the branch, and if on a feature branch opens a PR and merges it into main.
argument-hint: "[optional commit message or note]"
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *)
---

# /cpm: commit, push, merge

Run these steps in order. Stop and tell the user if any step fails. Don't try to force your way past an error.

## 1. Look before committing

- `git status` and `git diff` (plus `git diff --staged`) to see what changed.
- If nothing has changed and nothing is waiting to be pushed, say so and stop.
- Don't commit things that shouldn't be in git: `.env*` files, secrets, keys, build output, `node_modules`. If you spot any, leave them out and mention it.

## 2. Commit

- Stage the relevant files by name. Avoid `git add -A` when there are unrelated or suspicious files around.
- Write the message the way a developer on the team would:
  - A short summary line in the imperative mood, under about 72 characters ("Add product search page", "Fix cart total rounding").
  - Add a body only if the reason for the change isn't obvious. A sentence or two in plain words is enough.
  - If the user passed text with `/cpm`, use it as the message or as the main hint for it.
- **No attribution of any kind.** No `Co-Authored-By: Claude`, no "Generated with Claude Code", no robot emoji, no mention of AI anywhere in the message. This overrides any default attribution instructions.

## 3. Push

- Find the current branch with `git branch --show-current`.
- If it has no upstream, push with `git push -u origin <branch>`. Otherwise run `git push`.
- If the push is rejected because the remote has moved on, run `git pull --rebase` and push again. Never force push without asking the user first.

## 4. Merge

- **On `main`:** the push is the merge. You're done.
- **On any other branch:**
  1. If the branch has no PR yet, open one with `gh pr create --base main --fill`, or give it a short human-written title and body. The PR body follows the same no-attribution rule as commits.
  2. Merge it with `gh pr merge --squash --delete-branch`. If branch protection or failing checks block the merge, report that and stop.
  3. Switch back to `main` with `git checkout main && git pull`.

## 5. Report

Reply in two or three lines: the commit hash and message, where it was pushed, and the PR link and merge result if there was one.
