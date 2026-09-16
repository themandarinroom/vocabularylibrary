# Word Randomiser v0.2 live-session review

This design is implemented behind a transport interface and covered by the local multi-client simulator. The reviewed backend is exported by `functions/index.js` for staging, while `firebase.staging.json` and its deploy guard prevent use of the production project. See `LIVE_SESSION_REVIEW.md` for the full security and billing review.

## Data model

```text
liveGameJoinCodes/{ABCDE}                 server-only code → session lookup
liveGameJoinRateLimits/{hashedWindow}     server-only join throttles
liveGameSessions/{unguessableSessionId}   private owner/status/config/ephemeral pool
  public/state                            student-readable safe session view
  groups/{class|group-1|...}              student-readable current word/history/version
  groupStates/{groupId}                   server-only remaining pool/controller/request state
  devices/{deviceId}                      teacher-readable name/group/last-seen status
  deviceViews/{unguessableViewId}         one device's current group assignment
  deviceSecrets/{deviceId}                server-only token hash and role
  drawRequests/{requestId}                server-only idempotency receipt
```

The pool is an ephemeral snapshot of the teacher's current Vocabulary Library selection. It is necessary so every device renders the same content during a session, but it is never written back to `vocabularySets` and is deleted with the session. Vocabulary Library remains the source of truth for new sessions.

The public state contains display and voice settings, status, lock state, expiry, and the temporary pool. Connected count is calculated only on the teacher client from its protected device listener. Each public group document contains `version`, `round`, `drawNumber`, `currentItem`, chronological `historyItems`, repeat mode, remaining count, completion state, and the current controller epoch/device ID. Private state contains full remaining keys and recent processed-request IDs.

## Identity and security

- Creating, resetting, delegating, locking, and ending a session requires the existing signed-in, verified, authorised teacher identity.
- Students do not create individual Firebase Auth accounts. A join callable exchanges the short code for an unguessable session ID plus an opaque per-device token stored in `sessionStorage`.
- Short join codes are only lookup handles and cannot read Firestore directly. They expire and are collision-checked transactionally.
- Device tokens are hashed with a server secret. Neither tokens nor hashes appear in readable documents.
- Clients cannot write Firestore. Every mutation goes through callable functions; proposed rules expose only safe live views by unguessable session ID.
- App Check begins in monitoring-only mode. Staging enforcement follows successful real 7th-/9th-generation iPad Safari/PWA tests; production remains unenforced until equivalent monitoring succeeds.

## Authoritative draws and concurrency

`drawLiveGameWord` runs one Firestore transaction over the private session, group state, device secret, and `drawRequests/{requestId}` receipt. It verifies:

1. session is active and unexpired;
2. token and role are valid;
3. device belongs to the requested group;
4. controller device and `controlEpoch` still match;
5. `expectedVersion` matches current group state.

The callable chooses from the server-side pool and atomically stores the private state, public state, and request receipt. A repeated `requestId` returns its original result without another draw. A stale version or revoked epoch is rejected. Random input is created once outside the transaction and hashed with session/group/version/request ID, so a Firestore transaction retry cannot silently choose a different word.

Student delegation defaults to one draw. The successful delegated transaction atomically returns control to the teacher and increments `controlEpoch`; stale queued taps therefore fail. Group documents are independent transaction targets, so Group A and Group B do not block or mutate one another.

## Lifecycle and recovery

1. Teacher creates a session; the current pool/settings are snapshotted and a 5-character join code is reserved.
2. Student joins and receives session/device credentials. The credentials remain in `sessionStorage`, so a refresh resumes the same device instead of creating a session.
3. Firestore snapshot listeners restore the current public session/group state after reconnect. A draw in progress is represented only by UI state; authoritative results always come from Firestore.
4. A lightweight callable heartbeat runs every 120 seconds while visible. Device count means active within the five-minute presence window, not a permanent membership count. Disconnected devices never participate in draw transactions.
5. Teacher End marks the session ended, revokes the join code, and removes controls immediately.
6. `expiresAt` defaults to 12 hours. After approval, enable a Firestore TTL policy on the live-session collection group and a scheduled cleanup for descendants/join codes. TTL deletion is not instantaneous, so access rules also enforce expiry.

## Billing implications

- Each connected display listens to one public session document and one or more group documents. It incurs initial document reads and another read whenever a listened document changes.
- Each draw invokes one 2nd-generation callable and performs several Firestore reads/writes for state and idempotency. Delegation, reset, join, heartbeat, and end also invoke functions and write documents.
- Presence heartbeat is the main avoidable recurring cost. Staging uses a 120-second cadence only while visible, pauses while backgrounded, and derives the count using a five-minute active window.
- Temporary pool/history data consumes small short-lived storage. History should be capped (the MVP pool is small) and sessions expire after 12 hours.
- Firestore TTL deletes are billed as document deletes; a scheduled descendant cleanup also consumes function time and operations.
- Scheduled presence/cleanup jobs use Cloud Scheduler as well as Cloud Functions, so their Google Cloud job charges and invocations must be included in the budget.
- Cloud Functions require the Blaze plan. Current published Firebase quotas include no-cost allowances, but classroom concurrency and listener/read volume must be monitored before rollout.

## Review/deployment gate

Before production: create or identify a non-production Firebase project; deploy with `firebase.staging.json`; configure the token-pepper secret, staging web app and App Check monitoring; run the same multi-client suite against the Emulator Suite and real iPads; then review `LIVE_SESSION_REVIEW.md` again before requesting production approval.
