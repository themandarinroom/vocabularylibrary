# The Mandarin Room: Shared Development Standards v1.0

**Status:** draft for review (Phase 3, 28 Nov 2026). Owner decisions approved 28 Nov 2026; Codex review (Phase 4) pending.

This is the shared standards hub for every agent (Claude Code, Codex) and person working on The Mandarin Room. It holds the rules that apply across repositories. Each detailed standard has exactly **one owner document**, listed in §10. Other files link there instead of repeating it.

**Governing principle:** Claude and Codex may work differently, but they follow the same project standards.

## 1. Principles and architecture

**Principles**
1. **Preserve what exists.** Vocabulary, illustrations, Teacher Voice recordings, stable set and item IDs, and approved designs are never regenerated, renamed or replaced as a side effect of other work.
2. **One implementation per job.** Reuse the existing components, scripts, data model and design tokens. Do not build a competing version.
3. **Staging first, Production only with authorisation** (§5).
4. **Evidence over assertion.** Every claim of "done" names what was verified and how (§7).
5. **Repository documentation is the memory.** Durable knowledge belongs in these documents, not in an agent's private memory or a past conversation.

**Architecture overview**

| Part | What it is | Source | Hosting |
|---|---|---|---|
| Website | themandarinroom.au: Home, Vocabulary, Units, Activities, Topics, Pinyin, Hanzi, About, teacher pages | `themandarinroom/website-integration-staging`, branch `production` | Firebase Hosting site `the-mandarin-room` (+ `the-mandarin-room.web.app`) |
| Vocabulary Library | Library, editor, Student View, and the tools in `tools/`: Word Randomiser, Bingo Solo (`bingo-board`), Build the Great Wall, Tarsia Puzzle, `listening-core`, `vocabulary-games-core` | `themandarinroom/vocabularylibrary`, branch `main` | GitHub Pages: themandarinroom.github.io/vocabularylibrary/ |
| Firebase backend | Firestore (`vocabularySets`, `vocabularyTeacherVoices`, Units, Journey and others), Storage, Auth (`authorizedTeachers`), Functions | Rules: this repo (§6). Functions: see the workspace map (§8) | Projects `the-mandarin-room` (Production) and `the-mandarin-room-staging` |
| Units, Speaking | Separate GitHub Pages apps linked from the website | `themandarinroom/units`, `themandarinroom/speaking` | GitHub Pages. Do not change their base paths |

- **Data flow:** the website and every tool read published vocabulary from the **Production** Firestore. The website reads it anonymously and read-only; the tools use the shared store (`js/vocabulary-store.js` and its vendored copies). There is one vocabulary database. No game or page keeps its own copy of the sets.
- **Classroom devices:** school iPads (7th gen on iPadOS 18, 9th gen) reach `themandarinroom.github.io`. The school's Zscaler filter blocks `*.web.app`, so classroom-facing Staging games are served from github.io, not from Firebase preview channels.

## 2. Collaboration rules (both agents)

1. Read the relevant repository's `AGENTS.md` and this document before starting a task.
2. Check current branches (`git branch -r`), open Pull Requests and both release-history tables (vocabularylibrary `AGENTS.md` §7, website `AGENTS.md` §7) for related work.
3. Reuse existing components, scripts and data models. Do not introduce competing implementations.
4. Do not silently change an approved convention. A new convention used in one task is a **proposal, not a precedent**. Report it and get approval before it becomes standard, then record it in its owner document (§10).
5. Get approval before deviating from an established standard. Record every deviation in the task report.
6. Preserve existing vocabulary, assets, Teacher Voice recordings and stable IDs.
7. Respect environment boundaries and deployment authorisation (§4, §5).
8. Document verification, limitations and unresolved issues clearly (§7).
9. Leave work so that the other agent can continue it: branch, commit, report and evidence paths named.
10. Store durable project knowledge in repository documentation. Do not read another agent's private memory store.

The aim is consistent outcomes and standards, not identical working methods.

## 3. Repository ownership

| Repository | Owns | Owner documents |
|---|---|---|
| `vocabularylibrary` (hub) | Shared standards; vocabulary data model and content; topics taxonomy; assets and audio; import workflow; Firebase Rules; the Vocabulary Library app and tools | This file; `AGENTS.md`; `docs/VOCABULARY_SET_CREATION.md`; `docs/ASSETS.md`; `docs/TOPICS.md`; `HEADER-STANDARD-v1.0.txt` (tool header) |
| `website-integration-staging` | Website architecture, build, deployment and UI design | Its `AGENTS.md`; `docs/ARCHITECTURE.md`; `docs/design-references/README.md` (UI and design standard); `docs/TOPICS.md` (website topic pages) |

`CLAUDE.md` in both repositories is only `@AGENTS.md`. Change the protocol in `AGENTS.md`.

## 4. Environments and parity

| | Production | Staging |
|---|---|---|
| Firebase project | `the-mandarin-room` | `the-mandarin-room-staging` |
| Storage bucket | `the-mandarin-room.firebasestorage.app` | `the-mandarin-room-staging.firebasestorage.app` |
| Website | themandarinroom.au (Hosting `the-mandarin-room`) | Preview channels `the-mandarin-room-staging--<channel>.web.app`; legacy GitHub Pages staging from `codex/unified-website-v1` (auto-deploys on push) |
| Vocabulary Library | GitHub Pages from `main` | Local previews with a Staging runtime config, or a temporary github.io repository for iPad tests |

**Environment rules**
- The website's `dist/` is pinned to Staging. `scripts/build-production.mjs` rewrites it to Production with exact match counts. **Never test against `dist/` and assume it shows Production:** always check the built `build/production/` or the live files.
- The public games (Bingo, Build the Great Wall) enforce their Production configuration and refuse Staging overrides. Staging checks of game compatibility therefore use their data adapters. Full game UI checks happen after Production publication.

**Parity (Decision 10).** Staging is a development and verification environment, not an exact replica. Synchronisation is limited and controlled:

| Data | Standard |
|---|---|
| Published vocabulary content | Keep aligned where practical |
| Topics | Keep aligned where practical |
| Data schema | Keep compatible |
| Test vocabulary sets | Differences permitted |
| Experimental features | Differences permitted |
| Teacher Voice recordings | No mandatory synchronisation |
| Storage references | Isolated per environment by default |

- Document intentional differences. Report any unexpected difference relevant to your task.
- Never run an unapproved full overwrite, bulk sync or migration between environments.
- **Known discrepancies, each needing a separate decision:**
  - **Fruit I:** titled "Fruit / 水果" in Staging, "Fruit I / 水果 I" in Production (observed 28 Nov).
  - **Pets:** `year1-pets` is "Pets" with 11 entries in Staging but "Pets I" with 6 entries in Production (capitalisation audit, 27 Nov).
  - **Cross-environment cover reference:** Staging `year3-fruit` and Staging `year3-fruit-ii` use the Production Storage URL of Fruit I's cover.
  - Leave these unresolved until the owner decides.

## 5. Approvals and releases

**Approval policy (Decision 6), risk-based**

Explicit **advance approval** is permitted for narrowly scoped, low-risk **content operations**:
- creating new vocabulary sets;
- adding or replacing vocabulary illustrations;
- correcting specified vocabulary content;
- updating vocabulary covers.

A task instruction such as "Publish to Production once Staging verification passes" is conditional advance approval for that specified operation, and only that operation. Every required verification must pass first.

**Separate approval after Staging verification** is always required for:
- website application code and UI;
- game engines and gameplay logic;
- Firebase Security Rules;
- database schema changes and migrations;
- authentication and permissions;
- core architecture and deployment infrastructure.

Advance approval for a content operation never authorises related code changes.

**Stop and report** if:
- verification fails;
- an unexpected difference is found;
- the work exceeds the approved scope.

When Production approval is absent or ambiguous, do not publish.

Approval for one action never carries over to the next. Neither agent may approve its own Production release. The push guards and protected branches stay in force.

**Release workflows**
- **Application code** (Decision 8): branch → change → tests → Staging verification where applicable → Pull Request → owner approval → merge → deploy when authorised → verify live → record the release and rollback reference.
  - The procedures are in each repository's `AGENTS.md` (vocabularylibrary §4–§7, website §4–§7).
- **Vocabulary content publication** (new sets, images, covers, content corrections) changes Firestore and Storage data, not code. It needs no code Pull Request.
  - It follows `docs/VOCABULARY_SET_CREATION.md` §6.
  - It is recorded in its import report (`The Mandarin Room/imports/<set>/`), not in the code release tables.

## 6. Firebase Rules authority

- **Firestore Rules:** `firestore.rules` on vocabularylibrary `main` is the authoritative source, and since `2a084e2` (25 Nov 2026) it matches the deployed Production ruleset. The deployed rulesets are `17af1788` (Topics v1.1; previous `3c3d85b4`). Rule copies in other repositories (Speaking, Units, the website) are non-authoritative and must never be deployed.
- **Storage Rules: known discrepancy.** The repository's `storage.rules` is **behind Production**. It lacks the Unit Library (`units/` worked-examples) clause present in the deployed Production Storage ruleset (reported as `fd474066` on 25 Nov; unverified since).
  - It must not be assumed to represent the deployed ruleset.
  - Verify the deployed rules (Firebase console → Storage → Rules, or the Rules API) before any future Rules deployment.
  - A known-outdated file must never overwrite Production.
- **All Rules changes need separate owner approval** and an emulator test (§9).
- **Older notice:** `FIREBASE_RULES_AUTHORITY.md` exists only in the historical workspace checkout `ChatGPT/The Mandarin Room` (not on `main`). It said the same: the vocabularylibrary root rules are authoritative. This section supersedes it.
- **Future task:** read-only verification of the deployed Firestore and Storage rulesets against the repository files, then a separately approved repository alignment.

## 7. Reporting, evidence and handover (Decision 9)

**What goes where**

| Kind | Location |
|---|---|
| Durable knowledge: standards, architecture, approved design decisions, maintained scripts and tests, release records, rollback references, essential handover | Git repositories (the owner documents in §10; release tables in each `AGENTS.md`) |
| General task evidence: screenshots, browser results, logs, investigation files | Workspace `outputs/<task>/` (Codex workspace `Documents/Codex/2026-11-02/files-pasted-by-the-user-the/outputs/`) |
| Vocabulary import evidence | `Documents/ChatGPT/The Mandarin Room/imports/<set>/` |
| Formal audits | `Documents/ChatGPT/The Mandarin Room/audit-reports/<audit>/` |

- New task reports are Markdown (`REPORT.md`).
- Historical evidence stays where it is. Do not move or delete it to conform. That includes the evidence committed under website `docs/` and the `REPORT.txt` files in `imports/`.

**Every task report contains:**
1. Scope and approval reference.
2. Changes made.
3. Affected repositories, environments, IDs and versions.
4. Verification completed.
5. Verification not completed.
6. Deviations from approved standards.
7. Outstanding issues and risks.
8. Rollback information.
9. Evidence locations.
10. Handover notes, where applicable.

**Kinds of verification.** Reports keep these separate, and never present one as another:
- automated tests;
- browser simulation (viewport sizes in a desktop browser);
- live Production verification;
- physical-device tests (named device and OS);
- classroom acceptance.

**Handover:**
- When work reaches Production, add a row to the relevant release table.
- When work stops before release, the report names the branch, commit, preview URL and expiry, and the next approval needed.
- `outputs/HANDOVER.md` (22 Nov) is historical. Its durable content now lives in this document and the two `AGENTS.md` files.

## 8. Workspace map (as of 28 Nov 2026)

Paths are on the owner's Mac. **Do not delete, reset, clean, stash, relocate or consolidate** any checkout or worktree listed here. None is assumed disposable.

| Path | What it is | Notes |
|---|---|---|
| `Documents/ChatGPT/The Mandarin Room - Claude/vocabularylibrary` | Main vocabularylibrary clone | Checked out on the old branch `claude/vocab-local-image-upload` (`04d9a15`). `remote.origin.pushurl = PUSH-DISABLED-2026-11-07`. Feature worktrees hang off it |
| `…/vocabularylibrary-<feature>` (12 worktrees) | Feature worktrees: `ai-voice`, `gate3d` (Production Functions topic patch, `claude/topics-v1.1-functions`), `great-wall`, `great-wall-v0.2`, `great-wall-v02`, `gw-listen-guard`, `listening-header`, `solo-v011`, `staging-fns`, `tarsia`, `topics` (`claude/topics-post-release`), `shared-standards` | Mostly released branches. `gate3d` and `great-wall-v02` have one uncommitted change each |
| `…/website-integration` | Main website clone | On `claude/feedback-reconcile` (deferred Feedback work, one uncommitted change). Push guard set |
| `…/website-<feature>` | Website worktrees: `pinyin` (unreleased Pinyin initials, `claude/pinyin-initials-on-topics-v1.1`), `topics`, `vocabulary-games`, `shared-standards` | Two more website worktrees live under the Codex workspace `work/` |
| `Documents/ChatGPT/The Mandarin Room` | **Historical workspace checkout**: a vocabularylibrary clone at `e8c79f2` with about 52 uncommitted changes, nested app folders, and the untracked `imports/`, `scripts/`, `audit-reports/` | Not a release source. Its owner should review it. It holds the only copies of the Staging Functions source and the feedback backend source (`functions/`, uncommitted) |
| `Documents/Codex/2026-11-02/files-pasted-by-the-user-the/` | Shared task workspace | `outputs/<task>/` reports and evidence; `work/<task>/` test workspaces and preview servers |
| `Desktop/🍊中文/Units of Work …/` | Owner's teaching resources | Local asset archive destination (see `docs/ASSETS.md` §5) |

**Canonical sources**
- **Release source:** `origin/main` (vocabularylibrary) and `origin/production` (website). Start new work from these, in a new worktree or branch, never in the historical checkout.
- **Topics helper dependency:** the import scripts in `imports/colours-i-ii` and `imports/fruit-ii` load `topic-fields.mjs` from the **`vocabularylibrary-topics` worktree**. That worktree's content was identical to `main` on 28 Nov. Future maintained tools must import from a checkout of `origin/main`.
- **Website build dependency:** `build-production.mjs` reads `../../vocabularylibrary/js/firebase-config.js`. `tests/topics-restructure.test.mjs` looks for `../vocabularylibrary-topics`, then `../vocabularylibrary` (override with `VOCABULARY_LIBRARY_DIR`). Point them at a clean `git archive` of `origin/main` when in doubt.
- **Functions:**
  - **Production source:** commit `27ffd1d` plus the Topics v1.1 patch on branch `claude/topics-v1.1-functions` (`e399672`).
  - **Word Randomiser live-session Functions:** this repo's `functions/`.
  - **Staging Functions:** recorded on branch `claude/staging-functions-record` (`ede4d1f`, not a deploy source). Their working source is the uncommitted `Documents/ChatGPT/The Mandarin Room/functions`.
  - **Future task:** commit the Functions source to one canonical location.
- **Future maintained tools** (such as the import tool, §10 of the creation guide) live in this repository under `scripts/`.

## 9. Operational knowledge

**Project requirements (all machines)**
- **AI Voice on the iPad 7:** speech must name a standard Mandarin voice (Tingting is preferred), not just `lang = "zh-CN"`. With only the language set, the iPadOS 18 iPad 7 picks a novelty voice that "plays" for about 70 ms in silence. Do not treat `onend` as proof the speech was heard.
  - Implemented in `chooseMandarinVoice` (`js/audio.js`, released `b3a29f2`, 23 Nov 2026).
  - Test new audio code on both the iPad 7 and the iPad 9.
- **Teacher Voice:** recordings are keyed by `vocabularyTeacherVoices/{setId}--{itemId}`, so set and item IDs must never change (`docs/ASSETS.md` §6).
  - Saving a recording deletes the previous one (`uploadTeacherVoice()`), so other features must not reuse that function for their own recordings.
- **Microphone:** the live website sends `Permissions-Policy: microphone=()` on every page. Recording happens in the Vocabulary Library editor (github.io), not on themandarinroom.au.
- **Storage CORS:** both buckets have a GET-only CORS policy for `https://themandarinroom.github.io`, applied 26 Nov 2026 for Tarsia's picture export. Other origins (including `*.web.app` previews) get no CORS.

**Machine-specific notes (owner's Mac, 28 Nov 2026)**
- **Emulator:** the Firebase emulator needs Java. OpenJDK 21 is installed by Homebrew but not on PATH. Prefix commands with `PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH`. Example: `firebase emulators:exec --only firestore --project demo-topics "node --test tests/topic-rules.emulator.mjs"`.
- **Git identity:** none is configured globally. Commits pass `-c user.name="Wei Wang" -c user.email="weiwang@Weis-MBP.modem"`.
- **Push guard:** both main clones have `remote.origin.pushurl = PUSH-DISABLED-2026-11-07`. Approved pushes go to the explicit https URL. Never re-enable pushing with `git config`.
- **Firebase CLI:** logged in on this Mac. Import scripts reuse its token through `firebase-tools` internals. Never print or copy the token.
- **Agent browser panes:** Google sign-in pop-ups fail in the Claude desktop browser pane. The pane also blocks the microphone. Signed-in editor tests and Teacher Voice tests need the owner's own Chrome, for example at a localhost preview.
- **iPad previews:** the school iPad reaches only port 8806 on the Mac, through a device allowlist. The Mac's LAN address changes.
- **No gcloud:** neither agent has gcloud credentials. Bucket-level changes such as CORS are run by the owner in Cloud Shell.

## 10. Standards index (one owner per standard)

| Standard | Owner document |
|---|---|
| Principles, collaboration, environments, approvals, reporting, workspace | This file |
| Repository protocol, tests, release and rollback, release history | `AGENTS.md` (each repository) |
| Vocabulary data model, IDs, pinyin, English capitalisation, import workflow, future import tool | `docs/VOCABULARY_SET_CREATION.md` |
| Images, covers, Storage paths, AI and Teacher Voice, local archive | `docs/ASSETS.md` |
| Topics taxonomy, schema, legacy `topicId` plan | `docs/TOPICS.md` |
| Tool header (Vocabulary Library apps) | `HEADER-STANDARD-v1.0.txt` |
| Website architecture | website `docs/ARCHITECTURE.md` |
| UI and design system, decision log | website `docs/design-references/README.md` |
| Website topic pages | website `docs/TOPICS.md` |

## 11. Open items carried forward

- **Owner actions:**
  - delete the temporary `themandarinroom/tarsia-staging` repository (agents lack the `delete_repo` scope);
  - review the historical workspace checkout.
- **Future tasks (each needs approval):**
  - Rules verification and alignment (§6);
  - commit the Functions source (§8);
  - the maintained import tool (`docs/VOCABULARY_SET_CREATION.md` §10);
  - pinyin `ü` in import validators;
  - drop the legacy `topicId` (`docs/TOPICS.md`);
  - move Unit publication to the new topic IDs.
- **Website (from the 18–22 Nov handover):**
  - Feedback & Comments is deferred (branch `claude/feedback-reconcile`, tag `archive/feedback-reconcile-2026-11-19`). It must be rebuilt on the latest `origin/production` before any release; requirements are in that branch's `docs/FEEDBACK-RELEASE-STATUS.md`.
  - The feedback backend source is uncommitted (§8).
  - Shared staging `codex/unified-website-v1` lags Production.
- **Unreleased work on branches:**
  - Pinyin initials: website `claude/pinyin-initials-on-topics-v1.1`, Staging preview expires 10 Dec.
  - Bingo Live v2 L2: paused before the Rules review.
- **Physical-device checks still outstanding:** website covers and image upload on the iPad 7 and iPad 9.
