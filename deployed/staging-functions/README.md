# Deployed Staging Cloud Functions: source record (26 Nov 2026)

This is the exact source currently deployed for every Cloud Function in `the-mandarin-room-staging` (region `australia-southeast1`).
- **How it was made:** each Function's deployed source archive was downloaded read-only from Cloud Functions (v2). There is one folder per distinct archive. `manifest.json` lists every Function, its deploy time and the SHA-256 of its archive and of every file.
- **Why it exists:** Staging's server code had no version control. It was deployed from an uncommitted working folder, `The Mandarin Room/functions`, and, for Bingo, from work folders outside any repository.
- **What it is not:** this is a **record**, not a deploy source. Nothing here is wired into `firebase.json`, and no Function was redeployed to create it.

**Check it is still current (read-only):**

```bash
node deployed/staging-functions/verify.mjs
```

On 26 Nov 2026 it reported: "All 23 Staging Functions match this record."

## Bundles

| Folder | Functions | Source |
|---|---|---|
| `2026-08-30_ae97b635c6ad` | drawLiveGameWord, expireDisconnectedLiveDevices, joinLiveGameSession, cleanupExpiredLiveSessions, controlLiveGameSession, heartbeatLiveGameSession | Word Randomiser live sessions (early working folder) |
| `2026-09-01_43dc120db45a` | createLiveGameSession | same codebase, later redeploy |
| `2026-11-01_d89e832e3213` | saveJourney, publishJourney | working folder (Learning Journeys) |
| `2026-11-01_a9b40bce6534` | unpublishPublicUnit | working folder (student Unit publication) |
| `2026-11-02_ed294fc8e73c` | bingoTeacherCommand, bingoSync, bingoRoundTask, bingoCreateRoom, bingoRecovery, bingoJoinRoom | **separate Bingo codebase** (`index.mjs`, `adapters/`, `core/`, `shared/`); the source otherwise exists only in Codex `work/…/functions-bingo` folders |
| `2026-11-04_fe2f015c2ab6` | bingoAnswer | Bingo codebase, later redeploy. Includes `.env.the-mandarin-room-staging`, which holds only two non-secret feature flags (`BINGO_PERF_ENABLED`, `BINGO_FAST_ACK_ENABLED`) |
| `2026-11-07_4f3be2145d61` | saveUnitLibraryOrder, readUnitLibraryOrder | working folder (Unit Library ordering) |
| `2026-11-15_ec2852d66f63` | listPublicFeedback, moderateFeedback, submitFeedback | working folder; **byte-identical (16/16 files) to `The Mandarin Room/functions` as it stood on 26 Nov** |
| `2026-11-25_f3fa5b8ed7b7` | publishPublicUnit | Topics v1.1: the 1 Nov live Staging source plus the two-line topic patch (`patch-public-units.py`) |

Each Function runs the code of the bundle it was last deployed with. Several Functions therefore run older copies of shared files: Staging is **not** one consistent source version.

## Staging and Production

**Production** (`the-mandarin-room`) is also deployed per Function. As of 26 Nov:

| Production bundle (deploy time) | Functions | Matches |
|---|---|---|
| 2026-11-07 04:37 (3 bundles) | live-session Functions; generateVocabularyImage; unitLibraryIndex | no commit exactly (closest: `4f0e0cb` / `27ffd1d`, 2–4 files of 5–7 differ) |
| 2026-11-07 04:40 | saveUnitLibraryOrder, readUnitLibraryOrder | no commit exactly |
| 2026-11-07 21:08 | saveJourney, unpublishPublicUnit | `4f0e0cb` (branch `claude/functions-source-v1`), 14/14 |
| 2026-11-08 03:10 | setActiveAcademicYear, publishJourney | `27ffd1d` (branch `claude/gate3d-backend`), 14/14 |
| 2026-11-25 11:38 | publishPublicUnit | `e399672` (branch `claude/topics-v1.1-functions`), 14/14 |

**How the two compare:**
- **Same logic:** `publishPublicUnit`. Both projects accept the same 13 Topics v1.1 IDs and convert retired IDs identically.
  - **Staging:** the 1 Nov Staging source plus the patch.
  - **Production:** Gate 3D (`27ffd1d`) plus the patch.
  - The two differ only in Gate 3D changes that Staging never received: teacher-only lessons and worked examples.
- **Staging only:** Bingo (9 Functions) and Feedback (3).
- **Production only:** generateVocabularyImage, setActiveAcademicYear, unitLibraryIndex.
- **The live website** (themandarinroom.au) uses **Production** Functions only. The Production build rewrites every Staging reference.

## Rule for future Staging deploys
Deploy Staging Functions only from committed source, and refresh this record afterwards. Either add the new bundle folder and update `manifest.json`, or re-run the extraction. Then run `verify.mjs`.
