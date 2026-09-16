# Word Randomiser v0.2 — staging Teacher Voice media acceptance

Date: 31 August 2026  
Firebase project: `the-mandarin-room-staging` only  
Production project: read-only source

## Staging Storage

- Enabled the Firebase Storage API only for `the-mandarin-room-staging`.
- Created the default application bucket `the-mandarin-room-staging.firebasestorage.app` in `AUSTRALIA-SOUTHEAST1`.
- Deployed only `storage.staging.rules` with `firebase.staging.json` and the staging-project deployment guard.
- Public reads are limited to stable `vocabulary/{setId}/{itemId}/teacher-voice-{timestamp}` paths. Authenticated writes require an active staging teacher, an audio MIME type, and a size below 20 MB. All other paths are denied.
- Production Storage Rules, objects, metadata, Hosting, Functions, Firestore Rules and Authentication were not deployed or modified.

## Exact acceptance media copied

The copy was limited to the eight item IDs in the current production `year4-australian-states` set. The two obsolete territory metadata records were intentionally excluded.

| Item ID | Staging object path | Bytes |
| --- | --- | ---: |
| `victoria` | `vocabulary/year4-australian-states/victoria/teacher-voice-1786266814004` | 23,480 |
| `new-south-wales` | `vocabulary/year4-australian-states/new-south-wales/teacher-voice-1786266809792` | 35,072 |
| `queensland` | `vocabulary/year4-australian-states/queensland/teacher-voice-1786266805702` | 22,514 |
| `south-australia` | `vocabulary/year4-australian-states/south-australia/teacher-voice-1786266800110` | 31,208 |
| `western-australia` | `vocabulary/year4-australian-states/western-australia/teacher-voice-1786266796850` | 31,208 |
| `tasmania` | `vocabulary/year4-australian-states/tasmania/teacher-voice-1786266792427` | 29,276 |
| `northern-territory-mslpqmr1` | `vocabulary/year4-australian-states/northern-territory-mslpqmr1/teacher-voice-1786276480555` | 29,276 |
| `australian-capital-territory-mslpqmr1` | `vocabulary/year4-australian-states/australian-capital-territory-mslpqmr1/teacher-voice-1786276487397` | 55,358 |

Total: 8 objects, 257,392 bytes. All are `audio/webm;codecs=opus`.

## Firestore metadata and URL safety

- Copied exactly eight matching `vocabularyTeacherVoices/{setId}--{itemId}` documents to staging.
- Copied the current `vocabularySets/year4-australian-states` document after all media and metadata writes succeeded.
- Every `teacherAudioUrl` now targets `the-mandarin-room-staging.firebasestorage.app`.
- Generated a new download token for every staging object; no production token was reused.
- The verification script compared all eight staging URLs, object tokens, MIME types, object sizes and downloaded byte counts without printing any token or full signed URL.

## Verification results

- All eight tokenised media URLs returned HTTP 200 and their exact stored byte counts.
- A tokenless read of a valid Teacher Voice path returned HTTP 200 under the deployed staging Storage Rules.
- The public GitHub Pages staging app loaded the eight-item set in Local mode. After a draw, the **Teacher Voice** control appeared and entered the `Playing Teacher Voice…` state with no browser console warning/error.
- The Firebase CLI token could not be used as a Web teacher credential (`INVALID_IDP_RESPONSE: access_token audience is not for this project`), so it was not used or bypassed. The authorised teacher instead completed the real staging Google Web sign-in in an external browser.
- The teacher created a staging teacher-led session for the eight-item set. An anonymous student joined with the five-character class code and first received the bilingual waiting screen in `Live · connected / Draw 0` state.
- Authoritative teacher draws propagated to the student listener. The teacher confirmed the same final item shown on the student display: `北领地 / bei ling di` at Draw 3.
- The student **Teacher Voice** control appeared. Playing it entered `Playing Teacher Voice…` with no browser warning/error.
- The teacher ended the session. The student immediately changed to `Session ended / The teacher has ended this session`; the join-code lookup was removed by the normal staging callable lifecycle and the session is queued for normal cleanup.

## Billing and permission observations

- Bucket creation initially returned `403` because the Firebase Storage API was disabled. Enabling that API only in staging resolved it; bucket creation and the Storage Rules deployment then succeeded.
- No unexpected IAM or Storage Rules error occurred during the exact copy or the eight media reads.
- The staging regional bucket introduces normal Blaze Storage capacity/operation/egress billing. This acceptance copy added only 257,392 bytes plus eight object writes and a small number of verification reads. No broader media migration was performed.

## Reproducible tooling

- `scripts/copy-staging-vocabulary-audio.cjs` — guarded exact copy and URL/token rewrite.
- `scripts/verify-staging-australian-states-audio.cjs --storage-only` — read-only source and staging Storage/Firestore/media verification.
- `storage.staging.rules` — staging-only Storage Rules.
- `firebase.staging.json` — staging Storage deployment target and guard.
