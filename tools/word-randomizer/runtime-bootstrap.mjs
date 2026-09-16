const stagingHost = location.hostname === "the-mandarin-room-staging.web.app" ||
  location.hostname === "the-mandarin-room-staging.firebaseapp.com" ||
  (location.hostname === "themandarinroom.github.io" && location.pathname.startsWith("/word-randomiser-staging/"));

if (stagingHost) {
  await import("./staging-runtime-config.mjs");
}

await import(location.pathname.endsWith("/join.html") ? "./student.mjs?v=live-snapshot-1" : "./app.mjs?v=firebase-authority-1");
