# Word Randomiser v0.2 — Firebase security and staging review

Review date: 2026-08-30. Production project: `the-mandarin-room`. Staging project: `the-mandarin-room-staging`. Production deployment status: **not deployed**. Staging Firestore Rules/indexes and exactly seven live-session Functions were deployed successfully. Staging Authentication and Google teacher authorisation are configured, and the cloud multi-client acceptance suite passes 30/30 checks. Physical school-iPad testing remains pending.

## Firestore access matrix

| Path | Session teacher | Student device | Callable/Admin backend |
|---|---|---|---|
| `liveGameSessions/{sessionId}` | No direct read/write | No access | Full access; contains `teacherUid`, join code, pool, status, expiry |
| `public/state` | Single-document read | Single-document read with unguessable session ID | Write only through callables |
| `groups/{groupId}` | Get/list for own session | Get only; cannot enumerate groups | Authoritative public projection writes |
| `devices/{deviceId}` | Get/list for own session only | No access | Sanitised presence/name/group writes |
| `deviceViews/{viewId}` | Not needed | Get only using separate unguessable view ID; list denied | Group-assignment writes |
| `deviceSecrets/{deviceId}` | No access | No access | Token hash, role, group, presence and private view ID |
| `groupStates/{groupId}` | No access | No access | Remaining pool, controller and version state |
| `drawRequests/{requestId}` | No access | No access | Idempotency receipts |
| `liveGameJoinCodes/{code}` | No direct access | No direct access | Code-to-session lookup only |
| `liveGameJoinRateLimits/{key}` | No access | No access | Hashed rate counters only |

All client writes under the live-session hierarchy are denied. Firestore Admin SDK bypasses Rules, so callable service-account IAM remains part of the security boundary. Only the session owner—not every authorised teacher—can list the session's sanitised device documents.

### Public-field allowlist

`public/state` contains only `status`, mode, joining lock, temporary vocabulary pool, display/voice settings, expiry and update time. It does not contain join code, teacher UID/email, connected-device list, device token/hash, IP/rate data or private control state.

Public group projections contain the current vocabulary item, bounded history, draw/round/version counters, repeat/completion state and the active controller's random device ID/control epoch. The controller ID is required for a student to decide whether its draw button is active. It is not a secret and cannot locate `deviceSecrets`; the separate device-view ID is never placed in a group document.

### Why `deviceSecrets/{deviceId}` exists

Students intentionally have no Firebase Auth account. A per-device capability is therefore required to authenticate callable mutations. The plaintext 320-bit token is returned once over the callable response to that device and kept in `sessionStorage`; Firestore stores only an HMAC-SHA256 hash using `LIVE_SESSION_TOKEN_PEPPER`. A leaked hash cannot be replayed as the token.

Rules explicitly deny get/list/write on `deviceSecrets`, and no public projection copies its fields. Application logging never prints tokens or request bodies. Admin SDK access must remain restricted to the Functions service account. Student refresh recovery reuses `sessionStorage`; closing the browser loses the capability and requires a new join.

## Vocabulary source safety

The create-session callable ignores client-supplied Chinese, English, image and audio values. It accepts only stable `setId`/`itemId` selections, reads the current `vocabularySets` and `vocabularyTeacherVoices` documents with Admin SDK, and builds an ephemeral session snapshot. No live-session function has a write path to either source collection. Editing Vocabulary Library affects new sessions; an already-running session remains stable and consistent for all clients.

## Join-code review

- Codes use five characters from a 32-character ambiguity-free alphabet: 33,554,432 combinations.
- Code reservation is collision-checked transactionally and stores the same 12-hour expiry as the session.
- End Session deletes the lookup immediately. Join also re-reads code and session in one transaction and rejects locked, ended, expired, full or changed sessions before creating a device.
- Invalid, locked, ended and expired codes return the same generic unavailable response, reducing enumeration feedback.
- Join attempts use two 10-minute backend-only counters: maximum 30 attempts per HMAC-hashed network source and 50 per HMAC-hashed code. Raw IP addresses and plaintext attempted codes are not stored.
- A session accepts at most 60 device registrations. Function `maxInstances` remains capped at 20.
- Rate limiting reduces ordinary scanning but cannot completely defeat a large distributed attack. App Check, logs/alerts and staging traffic observation are the next layers.

## App Check and school iPads

Firebase lists App Check, Firestore and Functions as supported in iOS Safari and Safari. The web Randomiser/PWA uses the same Web SDK and the invisible reCAPTCHA Enterprise provider. This is compatible in principle with the target devices, but it does not prove compatibility with school content filters, managed Safari settings, private browsing/storage restrictions or older WebKit behaviour.

Rollout:

1. Create the staging web app and reCAPTCHA Enterprise score-based key; add the staging/localhost domains.
2. Load `firebase-app-check.js` before Firebase services and enable automatic token refresh. The code does this only when a staging site key is supplied.
3. Keep Functions `enforceAppCheck: false` and Firebase products in monitoring-only mode. Existing auth, capability tokens, rate limits and Rules continue to protect mutations.
4. Test normal Safari and installed Home Screen/PWA on the 7th- and 9th-generation school iPads, including background/foreground and reconnect.
5. Review callable verification logs for `VALID`, `MISSING` and `INVALID`, and review App Check metrics. Do not enforce while legitimate devices appear missing/invalid.
6. Enforce in staging first. Repeat the full device matrix.
7. For production, ship token generation in monitoring mode first; enforce only after real classroom iPads show reliable verified traffic.

## Presence and estimated billing

Heartbeat is every **120 seconds**, only while the page is visible. A heartbeat transaction reads and writes only the backend-only device-secret document. It does not update the public session or the teacher device document unless a previously stale device reconnects. A scheduled job runs every two minutes and marks devices stale after five minutes. The teacher calculates connected count from its own `devices` listener; students do not listen to that collection. Second-level precision is intentionally not provided.

Typical estimate: 30 minutes, one teacher, 20 student devices, one 11-word set, 20–30 draws, about six teacher control actions, all pages foregrounded.

| Usage | Approximate operations |
|---|---:|
| Callable calls (create, join, draw, controls, heartbeat) | 362–372 |
| Scheduled presence invocations | about 15 |
| Firestore reads, including listeners | about 1,190–1,430 |
| Firestore writes/deletes | about 520–560 |
| App Check assessments | roughly 21–42, depending on token timing/TTL |

The estimates include about 315 heartbeat calls, reads and writes; heartbeat is therefore the largest avoidable recurring cost. Moving to a three-minute heartbeat would reduce this to about 210 per class but would make disconnect status slower. The two-minute/five-minute design is the staging baseline. Background tabs pause heartbeats. Join no longer updates a student-readable connected-count field, and students listen only to their assigned group, preventing fan-out reads from joins and unrelated group draws.

Actual billed reads can be higher after long offline reconnects, transaction retries, repeated audio metadata loads or additional controls. The session snapshot includes the current Teacher Voice URL, avoiding one metadata read per word per student device.

Cloud Functions deployment requires Blaze even when the expected classroom usage fits within no-cost quotas. Blaze links a billing account and charges usage beyond the included quotas; deployment also uses Cloud Build/Artifact Registry and can incur small storage/build charges. This design uses one Secret Manager version; the current free allowance covers up to six active versions and 10,000 monthly accesses, but the billing account aggregates that allowance across projects. App Check's reCAPTCHA Enterprise integration creates a billable assessment when its token refreshes (normally about twice per hour per active client), with charges only above its no-cost quota. Configure a budget alert and a Cloud Run Functions spend cap before staging deployment; budget alerts alone do not cap charges.

## Session cleanup

- `expiresAt` is fixed at creation time to 12 hours. Rules and callables enforce it immediately even if deletion has not run.
- Active sessions use `cleanupAt = expiresAt`. Ending a session deletes its join-code lookup immediately, marks public state ended and advances `cleanupAt` to one hour later so final screens can settle.
- The hourly scheduled cleanup queries only `cleanupAt <= now`, deletes the matching join lookup, then recursively deletes that one session and its subcollections. A future active session cannot match the query.
- Firestore TTL on the root `liveGameSessions.expiresAt` field is a delayed fallback and handles root retention; TTL is not relied on for immediate access revocation and does not recursively delete subcollections. The scheduled recursive cleanup owns descendant deletion.
- Expired rate-limit documents are deleted by the same hourly job and may also receive a TTL policy after staging validation.

## Staging integration and deployment status

- `functions/index.js` exports the reviewed live-session backend.
- `firebase.staging.json` references staging-only Rules/indexes and runs `scripts/guard-staging-deploy.cjs`.
- The guard rejects `the-mandarin-room`, missing project IDs and IDs that do not clearly contain `staging`, `stage`, `test` or `dev`.
- `firestore.rules`, production data and the production Firebase project are unchanged.
- Firebase project `the-mandarin-room-staging` and Web App `Word Randomiser Staging` were created on 2026-08-30.
- Staging Firebase Hosting is configured as an allowlisted minimal build containing only Word Randomiser and its required browser modules. The build replaces the shared Firebase config with a generated staging-only module and rejects any production project reference before deployment.
- On 2026-08-31, that 21-file frontend payload was deployed with Firebase Hosting only to `https://the-mandarin-room-staging.web.app`. The classroom test URL is `https://the-mandarin-room-staging.web.app/tools/word-randomizer/?set=year1-pets`; the student join page is `https://the-mandarin-room-staging.web.app/tools/word-randomizer/join.html`. Both public HTTPS pages were loaded successfully after release. No Functions, Firestore, Rules, Authentication or production resource was included in this deployment.
- Because managed school iPads/Zscaler could not trust the `*.web.app`/`*.firebaseapp.com` frontend certificate path, a separate temporary public repository, `themandarinroom/word-randomiser-staging`, was created for GitHub Pages. Its allowlisted 22-file static payload is pinned to `the-mandarin-room-staging`; it contains only public Firebase Web SDK configuration and no Admin credentials, tokens, secrets, backend source or Rules. Production Pages and Firebase resources are not part of this deployment.
- The GitHub Pages teacher URL is `https://themandarinroom.github.io/word-randomiser-staging/tools/word-randomizer/?set=year1-pets&firebase=staging`; the student join page is `https://themandarinroom.github.io/word-randomiser-staging/tools/word-randomizer/join.html?firebase=staging`. Relative join-link generation keeps students on the same GitHub Pages repository path.
- Staging Auth now additionally authorises only the hostname `themandarinroom.github.io`. A preflight request from that Origin to the existing staging `joinLiveGameSession` callable returned HTTP 204 with the expected Origin, POST method and callable headers allowed. App Check remains non-enforcing.
- Its Standard Firestore database is isolated in `australia-southeast2`, matching production. Reviewed staging Rules compiled in Firebase and were released with the required presence index.
- The staging Hosting hostnames automatically select the staging Web SDK config. Local development can still use `?firebase=staging`; ordinary non-staging hosts retain their existing Firebase configuration.
- App Check has no site key and remains non-enforcing; callable Functions use `enforceAppCheck: false` and log missing/valid status for monitoring. A staging reCAPTCHA Enterprise key must not be enforced until physical 7th/9th-generation iPad testing is clean.
- `LIVE_SESSION_TOKEN_PEPPER` version 1 was created in staging Secret Manager without logging or persisting its value locally.
- Exactly seven Node.js 22 second-generation functions now exist in `australia-southeast1`: five callable functions plus the two scheduled presence/cleanup functions. The unrelated image-generation function and its production secret were explicitly excluded.
- Artifact Registry repository `gcf-artifacts` in `australia-southeast1` now deletes Functions images older than one day. The command completed successfully with no permission or billing error.
- Firebase Authentication with Identity Platform was initialised only in `the-mandarin-room-staging`. Google (`google.com`) is the only enabled provider. The provider has a staging-generated Web OAuth client; external OAuth client safelists are empty after the temporary acceptance client was removed.
- Auth project settings are public name `The Mandarin Room Staging`, support email `wei.wang.mandarin@gmail.com`, and authorised domains `the-mandarin-room-staging.firebaseapp.com`, `the-mandarin-room-staging.web.app`, `localhost`, and `127.0.0.1`.
- Staging teacher `wei.wang.mandarin@gmail.com` is a verified Google user with UID `7GjyLABFvqWNJu86lWqXWYuPtEA2`. The backend allowlist is the staging-only document `authorizedTeachers/7GjyLABFvqWNJu86lWqXWYuPtEA2` with `active: true`, `provider: google.com`, and `scope: staging-only`. Students remain unauthenticated capability-token clients; Anonymous Auth was not enabled.
- `scripts/copy-live-test-vocabulary.cjs` performed a one-way, production-read-only copy of the current `year1-pets` document plus 11 matching Teacher Voice metadata documents into staging. Its target guard refuses production or an ambiguously named project.
- A real unauthenticated REST probe returned HTTP 200 for `vocabularySets/year1-pets` and HTTP 403 for both `deviceSecrets` and the protected teacher `devices` collection.
- Local browser regression loaded all six existing sets and selected all 11 Pets words with no console errors. The explicit staging URL also loaded the Pets test snapshot. Automated local live-state tests pass 15/15. The staging cloud suite passed 30/30 checks with one teacher and three simulated no-login students across teacher-led draw, delegated draw, stale/double-tap protection, revoke, join lock, reconnect, No Repeat, Allow Repeats, two independent groups, heartbeat and end-session rejection.

### Measured cloud acceptance traffic

The successful suite generated 30 callable requests: 2 create, 8 join (including two expected rejected joins), 11 draw (including duplicate/stale/unauthorised probes), 8 control and 1 heartbeat. Its simulated clients performed 43 unauthenticated student document gets, one authenticated teacher device-list read and one staging vocabulary-source read.

Cloud Monitoring's minute-level window also contained the immediately preceding 16-call assertion dry run. The combined observed totals were exactly 46 Cloud Run callable requests, 267 Firestore document reads, 145 writes and 2 deletes, plus one scheduled presence invocation that matched no stale documents. Subtracting the fully recorded dry run (16 calls, 96 reads and 48 writes) attributes **30 calls, 171 reads, 97 writes and 2 deletes** to the successful acceptance suite. This matches the operation-by-operation transaction/read accounting; no unexpected retry amplification was observed.

The 30-minute/20-student estimate remains 362–372 callable calls, 1,190–1,430 reads and 520–560 writes/deletes. The small acceptance suite is not a duration-scaled billing simulation: it intentionally exercises more control/error branches per student while running only one heartbeat. No unexpected charge appeared. Enabling Identity Platform changes staging Auth to MAU pricing, but Google/social sign-in remains no-cost through the current 50,000-MAU monthly tier; this test created one active teacher user and no student Auth users.

The failed assertion run left one temporary session active; it was explicitly marked ended, its join-code lookup was deleted, and `cleanupAt` was set so the hourly recursive cleanup can remove only that session. Both successful test sessions ended through the callable and are also queued for normal cleanup.

## Production release

Production deployment was approved on 17 September 2026. The production project uses the same authoritative `vocabularySets` and `vocabularyTeacherVoices` collections as Vocabulary Library; no vocabulary or media copy was performed. Production received the reviewed Firestore rules, one `deviceSecrets` presence index, `LIVE_SESSION_TOKEN_PEPPER` version 1, and exactly the seven Live Session Functions. Existing `generateVocabularyImage` and `unitLibraryIndex` Functions were preserved.

The public teacher URL is `https://themandarinroom.github.io/vocabularylibrary/tools/word-randomizer/`; student join links remain under the same GitHub Pages origin. App Check remains non-enforcing pending continued physical 7th-/9th-generation iPad monitoring. Authentication, device capability tokens, join throttling and server-authoritative draws remain enforced independently.

Official references:

- https://firebase.google.com/docs/web/environments-js-sdk
- https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- https://firebase.google.com/docs/app-check/monitor-functions-metrics
- https://firebase.google.com/docs/firestore/security/rules-query
- https://firebase.google.com/docs/firestore/ttl
- https://firebase.google.com/docs/firestore/pricing
