# Word Randomiser v0.2 — GitHub Pages staging

The temporary frontend is published from the public repository `themandarinroom/word-randomiser-staging` at:

- Teacher: <https://themandarinroom.github.io/word-randomiser-staging/tools/word-randomizer/?set=year1-pets&firebase=staging>
- Student: <https://themandarinroom.github.io/word-randomiser-staging/tools/word-randomizer/join.html?firebase=staging>

This site exists only to bypass the managed school-iPad/Zscaler certificate problem affecting the Firebase Hosting domains. GitHub Pages serves static files only. Live sessions, vocabulary snapshots, teacher authorisation and every authoritative draw/control write remain in `the-mandarin-room-staging`.

## Safety boundary

- `scripts/build-word-randomiser-github-pages.cjs` constructs an allowlisted static payload in `.github-pages-staging`.
- The generated `js/firebase-config.js` is pinned to `the-mandarin-room-staging`. Firebase Web SDK configuration is public by design.
- The build rejects production project configuration, service-account fields, Admin credentials and known secret names.
- Functions source, Firestore Rules, Admin SDK files and production data are never copied.
- App Check remains monitoring/non-enforcing until physical school-iPad validation is complete.
- The existing `themandarinroom/vocabularylibrary` Pages site and all production Firebase services are separate and unchanged.

## Staging configuration and verification

- Staging Firebase Auth authorises `themandarinroom.github.io` for Google teacher sign-in.
- Students remain anonymous capability-token clients and join with the existing five-character code.
- Callable preflight from `https://themandarinroom.github.io` returned HTTP 204 and allowed POST plus the Firebase callable headers.
- The Auth `createAuthUri` check accepted the GitHub Pages continuation URI for `google.com`.
- An actual anonymous invalid-code join from the published student page reached the staging callable and returned the expected generic unavailable-code response.
- Relative join-link construction keeps teacher-generated student links under the GitHub Pages repository path.

## Publishing an update

1. Run `node scripts/build-word-randomiser-github-pages.cjs` from the main workspace.
2. Run the Randomiser test suite and inspect the generated payload/security scan result.
3. Commit and push only the generated `.github-pages-staging` repository to `themandarinroom/word-randomiser-staging`.
4. Wait for the GitHub Pages build to report `built`, then verify both public URLs and the deployed staging `projectId`.

Do not change the Pages source or Firebase target without a separate staging review.
