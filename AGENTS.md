# Vocabulary Library: agent protocol (Claude, Codex and others)

This file is the shared protocol for every coding agent and person working in this repository. `CLAUDE.md` imports it, so the two cannot drift apart. Change the protocol here.

## 0. Shared standards (read first)

This repository is the **shared standards hub** for The Mandarin Room. Before any task, read:
- `docs/PROJECT_STANDARDS.md`: principles, collaboration rules, environments, the approval policy, reporting, the workspace map and operational knowledge.
- The owner document for your area (index in `docs/PROJECT_STANDARDS.md` §10):
  - `docs/VOCABULARY_SET_CREATION.md`: data, IDs, pinyin, English, imports;
  - `docs/ASSETS.md`: images, covers, audio, archive;
  - `docs/TOPICS.md`;
  - `HEADER-STANDARD-v1.0.txt`;
  - the website's `docs/design-references/README.md` for UI.

## 1. What this repository deploys

| Environment | Where | Deployed from | How |
|---|---|---|---|
| **Production app** | themandarinroom.github.io/vocabularylibrary/ (Library, editor, Student View, `tools/*`) | `main` | GitHub Pages builds `main` automatically. A change to `main` **is** a Production release |
| **Production data** | Firestore and Storage in `the-mandarin-room` | Editor saves; approved import scripts | `docs/VOCABULARY_SET_CREATION.md` §6 |
| **Firebase Rules** | `firestore.rules`, `storage.rules` | This repository's root, as the only authority (`docs/PROJECT_STANDARDS.md` §6) | `firebase deploy --only firestore:rules`, only with separate approval. ⚠ `storage.rules` is behind Production: never deploy it as-is |
| **Staging** | `the-mandarin-room-staging` | Local previews with the Staging runtime config; temporary github.io repositories for iPad tests | No automatic deploy |

## 2. Production protection

- **No Production change without the owner's explicit approval,** under the risk-based policy in `docs/PROJECT_STANDARDS.md` §5.
  - Content operations may be approved in advance.
  - Application code, games, Rules, schema, auth and infrastructure always need a separate approval after Staging.
  - Neither agent approves its own release.
- **Keep the push guard:** `remote.origin.pushurl` stays `PUSH-DISABLED-<date>`. Never re-enable it with `git config`. Approved pushes go to the explicit URL: `git push https://github.com/themandarinroom/vocabularylibrary.git <branch>`.
- **Never force-push, rebase, reset or delete a shared branch.** Never push directly to `main` except the approved fast-forward described in §6.
- **Never weaken a test, guard or check to make it pass.** A failing check is a finding to report.
- **`main` has no GitHub branch protection** (checked 28 Nov 2026), unlike the website's `production`. Whether to add it is an open owner decision. Until then, the rules above are the protection.

## 3. Branching

- Start from `origin/main` in a **new worktree**: `git fetch origin && git worktree add -b <agent>/<topic> ../vocabularylibrary-<topic> origin/main`.
  - Prefix: `claude/` for Claude Code, `codex/` for Codex.
  - Never work in the historical checkout `Documents/ChatGPT/The Mandarin Room`.
- One topic per branch. Bring in other work only as specific reviewed commits.
- Before starting, check `git branch -r`, open PRs (`gh pr list --repo themandarinroom/vocabularylibrary`) and §7 for related work.

## 4. Testing (before any Staging or Production step)

```bash
node --test tests/*.test.mjs        # all unit tests; every failure must be explained
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH \
  firebase emulators:exec --only firestore --project demo-topics "node --test tests/topic-rules.emulator.mjs"   # when rules or topics change
```

- Tool-specific browser harnesses and iPad checklists live with each tool's report (see §7 records).
- Viewport simulation is not a physical-device test. Games and audio changes need the owner's iPad 7 and iPad 9 check before acceptance.
- Never write to Production data while testing. Label Staging test data clearly (for example `year6-…-test`) and soft-delete it afterwards.

## 5. Approval gates

Stop and ask the owner before:
- any push to GitHub, Pull Request merge or Production release;
- any Firestore or Storage change in Production that the task's approval does not cover;
- any Rules, Functions, Auth, IAM, CORS or billing change;
- deleting data, objects, branches or repositories.

## 6. Release procedure

**A. Application code (the default; Decision 8)**
1. Branch per §3, implement the approved change, and run §4.
2. Verify in Staging where applicable, and get the owner's device check when the change affects classroom use.
3. With approval to publish the branch, push it to the explicit URL and open a Pull Request against `main`.
4. With the owner's approval of the release, **squash-merge** the PR. The PRs merged so far (#4–#9) were squash-merged from the `themandarinroom` account.
5. Wait for the Pages build, then verify every changed live file byte-for-byte against the merged commit, and smoke-test the affected pages and tools.
6. Record the release in §7, with the rollback point.

**B. Documentation-only or data-model commits** (such as Topics, rules authority) were historically fast-forwarded to `main` by an explicit-URL push after approval. A PR is preferred for these too.

**C. Vocabulary content publication** (new sets, images, covers, content corrections) is a data operation, not a code release. It needs no PR. Follow `docs/VOCABULARY_SET_CREATION.md` §6. It is recorded in its import report, not in §7.

**Rollback:**
- Open a revert commit (`git revert <range>`) through a PR, or an approved fast-forward. Never force-push.
- The previous good commit for each release is in §7.
- For data, use the import's before-snapshot and the documented reverse operation.

## 7. Release history (`main`)

| Date | Commit (PR) | Change | Previous good |
|---|---|---|---|
| 2026-11-28 | `e589848` (#9) | Tarsia Puzzle v0.1 (Vocabulary Games). Record: Codex `outputs/tarsia-release/RELEASE-RECORD.md` | `4f78de6` |
| 2026-11-28 | `4f78de6` (#8) | Build the Great Wall: Listening Break (shared `tools/bingo-board/listen-guard.mjs`, separate break per game). iPad 7 and 9 accepted | `71bc6a6` |
| 2026-11-27 | `71bc6a6` (#7) | Bingo Solo: Great Wall-style selector, Line Bingo only, Listening Break. iPad 7 accepted 28 Nov | `dfcf342` |
| 2026-11-26 | `dfcf342` | Topics v1.1 post-release: import helper, `docs/TOPICS.md`, `AGENTS.md` (docs and scripts) | `56db84f` |
| 2026-11-25 | `e94cacd`, `56db84f` | Topics v1.1: 13 topics, multi-topic `topicIds` (with Firestore rules `17af1788`; website `5b2c8405ab5fecf5`) | `2a084e2` |
| 2026-11-25 | `2a084e2` | `firestore.rules` aligned with live Production (ruleset `3c3d85b4`) | `6fc48a2` |
| 2026-11-24 | `6fc48a2` | Topics: canonical taxonomy and `topicId` | `b3a29f2` |
| 2026-11-23 | `b3a29f2` | AI Voice: name a standard Mandarin voice (iPad 7) | `4c8e819` |
| 2026-11-22 | `5b116eb`…`4c8e819` | Listening Games headers | `49131a8` |
| 2026-11-22 | `8ab9ab5`…`49131a8` | Build the Great Wall v0.1 → v0.2 | `54d0a4f` |
| 2026-11-22 | `afecc7e`, `54d0a4f` | Unified tool header v1.0 (`HEADER-STANDARD-v1.0.txt`) | `fc008be` |
| 2026-11-22 | `fa3fbb6` (#5), `fc008be` (#6) | Bingo Solo v0.1.1 and board text size | `04d9a15` |
| 2026-11-18 | `04d9a15` | Local image upload for covers and item images | `71de5b0` |
| 2026-11-15 | `71de5b0` (#4) | Bingo Solo v0.1.0 | `5cfd0fc` |

Detailed release records for these are in the Codex workspace `outputs/` (`bingo-solo-release-*`, `tarsia-release`, `vocab-image-upload`) and `work/great-wall-listen-guard/RELEASE-RECORD.md`.

## 8. Vocabulary sets and topics

- Follow `docs/VOCABULARY_SET_CREATION.md`. Topics are required.
- Use the 13 canonical topic IDs in `js/topic-taxonomy.js`. A set has `topicIds` (one or more) plus the legacy mirror `topicId = topicIds[0]`.
  - **Do not remove `topicId`.** Its deprecation plan is in `docs/TOPICS.md` and needs separate approval.
- Build the topic fields with `topicFieldsFor()` (`scripts/vocabulary-import/topic-fields.mjs`) and run `node scripts/vocabulary-import/check-set.mjs <set.json> --project <project>` before any write.
- Never invent a topic, write a display label, use a retired ID (such as `greetings`), or reuse or change an existing set or item ID.

## 9. Agent-specific notes

Machine facts both agents need are in `docs/PROJECT_STANDARDS.md` §9: OpenJDK PATH, git identity, push URL, Firebase CLI and iPad preview port.

- **Claude Code:** the desktop app's browser pane cannot complete Google sign-in and blocks the microphone. Hand signed-in editor tests and Teacher Voice tests to the owner's Chrome. Durable findings go into these documents, not only into Claude's memory.
- **Codex:** keep durable findings in these documents rather than in Codex's own memory store.
