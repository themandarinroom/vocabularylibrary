# Word Randomiser v0.2 — physical school-iPad checklist

Test only against `the-mandarin-room-staging`. Do not enable App Check enforcement during this checklist.

Public GitHub Pages staging URLs (do not use `localhost`, `*.web.app` or `*.firebaseapp.com` as the frontend on managed physical iPads):

- Teacher / Randomiser: <https://themandarinroom.github.io/word-randomiser-staging/tools/word-randomizer/?set=year1-pets&firebase=staging>
- Student join page: <https://themandarinroom.github.io/word-randomiser-staging/tools/word-randomizer/join.html?firebase=staging>

Both URLs are served over GitHub Pages HTTPS and are pinned to only the staging Firebase project and staging Functions. The frontend repository is temporary; authoritative game state remains in `the-mandarin-room-staging`.

## Device matrix

Run the full core flow on both devices:

- [ ] 7th-generation school iPad on its latest supported iPadOS, Safari
- [ ] 7th-generation school iPad, Add to Home Screen / standalone mode
- [ ] 9th-generation school iPad on current managed iPadOS, Safari
- [ ] 9th-generation school iPad, Add to Home Screen / standalone mode
- [ ] Teacher Mac/Safari or Chrome as the session owner

Record iPadOS version, Safari restrictions/content filter, Wi-Fi network, orientation and whether Private Browsing is disabled.

## Teacher authentication

- [ ] Open the public staging Randomiser URL above and choose Live Teacher-led Class.
- [ ] Google sign-in shows `The Mandarin Room Staging`, not production.
- [ ] Sign in as `wei.wang.mandarin@gmail.com`; confirm the UI says the teacher is ready.
- [ ] A different Google account cannot create a session.
- [ ] After sign-in, the browser remains on `themandarinroom.github.io`; only the Google/Firebase authentication popup may use the staging Auth handler.
- [ ] Refresh the teacher page; confirm the Google session is restored and no duplicate live session is silently created.
- [ ] Confirm student iPads never see Google sign-in and do not create Firebase Auth users.

## Teacher-led class — three student iPads

- [ ] Create a Year 1 Pets No Repeat session and record the five-character join code.
- [ ] Open the public student join page above and join at least three student iPads without accounts.
- [ ] Confirm copied teacher join links also start with `https://themandarinroom.github.io/word-randomiser-staging/` and never redirect the student frontend to `firebaseapp.com` or `web.app`.
- [ ] Teacher connected count reaches the expected number within normal presence delay.
- [ ] One teacher draw produces the identical Hanzi, Pinyin, image, draw number and history on every device.
- [ ] Rapidly double-tap Draw; confirm only one authoritative draw is added.
- [ ] Draw all selected words; each appears once and `All words have been drawn` appears.
- [ ] Shuffle/reset and confirm history clears everywhere.
- [ ] Switch/reset to Allow Repeats; confirm the full pool remains eligible and repeat entries appear separately in history.

## Delegated student draw

- [ ] Authorise one named student iPad for one draw.
- [ ] Only that iPad shows an active Tap to Draw control; other students remain viewers.
- [ ] Its draw appears identically on teacher and all student screens.
- [ ] Control automatically returns to the teacher after one draw.
- [ ] Delegate again, immediately revoke, then tap the old student control; no draw is accepted.

## Group Mode

- [ ] Create Group A and Group B and join approximately 2–3 devices per group where available.
- [ ] Draw in Group A; Group B current word and history do not change.
- [ ] Draw in Group B; Group A does not change.
- [ ] Move a student between groups; its view changes to the assigned group without exposing teacher controls.
- [ ] Teacher compact overview shows each group's latest word/draw number.

## Reconnect, lock and lifecycle

- [ ] Refresh a student page; current card and history restore without a second join.
- [ ] Background Safari for over two minutes, return, and confirm heartbeat/reconnect succeeds.
- [ ] Briefly disable Wi-Fi, reconnect, and confirm disconnected devices do not block teacher draws.
- [ ] Lock joining; a new iPad is rejected immediately with a generic unavailable message.
- [ ] Unlock joining; a new iPad can join.
- [ ] End session; existing screens remain safely read-only and the old code rejects new joins.

## Voice and card layout

- [ ] 9th-generation iPad: AI Voice plays where supported.
- [ ] 9th-generation iPad: Teacher Voice plays from Pets metadata.
- [ ] 7th-generation iPad: Teacher Voice plays even if AI Voice fails.
- [ ] Auto mode falls back without freezing, hiding Draw, or showing an unhandled error.
- [ ] Portrait and landscape layouts keep the draw control and card touch-friendly.
- [ ] Two- and multi-character Hanzi stay on one line with adaptive sizing.
- [ ] Pinyin-only and English-only cards enlarge and centre correctly.
- [ ] History coins default to Hanzi with Pinyin below; tap flips to image/English and remains usable by touch.

## App Check monitoring — do not enforce

- [ ] Keep all Functions on `enforceAppCheck: false`.
- [ ] Record callable verification logs as `VALID`, `MISSING` or `INVALID` for each device/browser mode.
- [ ] Confirm legitimate 7th- and 9th-generation devices are not blocked by content filters or managed Safari settings.
- [ ] Do not enable staging enforcement until every legitimate device mode reliably produces valid tokens.
- [ ] Do not make any production App Check change without a separate review and approval.

## Result record

For each failure, capture device/iPadOS, mode, time, join code (never device token), action, expected result, actual result and a screenshot. Record Functions/Firestore usage for the test window and review billing before requesting production deployment.
