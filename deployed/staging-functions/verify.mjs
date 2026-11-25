#!/usr/bin/env node
// Read-only check that this record still matches what is deployed on Staging.
//   node deployed/staging-functions/verify.mjs
// Downloads each Staging Function's deployed source archive and compares its SHA-256 (and every file) with
// manifest.json. Uses the signed-in Firebase CLI account. Never deploys or writes anything.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(here, "manifest.json"), "utf8"));
const require = createRequire("/opt/homebrew/lib/node_modules/firebase-tools/lib/");
const { requireAuth } = require("./requireAuth.js");
const { getAccessToken } = require("./apiv2.js");
const { configstore } = require("./configstore.js");
await requireAuth({ user: configstore.get("user"), tokens: configstore.get("tokens") });
const H = { Authorization: `Bearer ${await getAccessToken()}` };
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// Minimal ZIP reader (stored/deflated entries) so the check needs no dependencies.
function unzip(buf) {
  const files = new Map(); let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end -= 1;
  let at = buf.readUInt32LE(end + 16);
  for (let i = 0; i < buf.readUInt16LE(end + 10); i += 1) {
    const method = buf.readUInt16LE(at + 10), size = buf.readUInt32LE(at + 20), nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30), commentLen = buf.readUInt16LE(at + 32), local = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataAt, dataAt + size);
    if (!name.endsWith("/")) files.set(name, method === 8 ? zlib.inflateRawSync(raw) : raw);
    at += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const list = await (await fetch(`https://cloudfunctions.googleapis.com/v2/projects/${manifest.project}/locations/-/functions`, { headers: H })).json();
const deployed = new Map(list.functions.map((f) => [f.name.split("/").pop(), f]));
let problems = 0;
const recorded = new Set(manifest.bundles.flatMap((b) => b.functions.map((f) => f.function)));
for (const name of deployed.keys()) if (!recorded.has(name)) { console.log(`NEW (not recorded): ${name}`); problems += 1; }
for (const bundle of manifest.bundles) for (const { function: name } of bundle.functions) {
  const fn = deployed.get(name);
  if (!fn) { console.log(`GONE: ${name}`); problems += 1; continue; }
  const s = fn.buildConfig.source.storageSource;
  const buf = Buffer.from(await (await fetch(`https://storage.googleapis.com/storage/v1/b/${s.bucket}/o/${encodeURIComponent(s.object)}?alt=media&generation=${s.generation}`, { headers: H })).arrayBuffer());
  if (sha(buf) !== bundle.zipSha256) { console.log(`CHANGED: ${name} (deployed archive differs from ${bundle.folder})`); problems += 1; continue; }
  const files = unzip(buf);
  for (const f of bundle.files) if (!files.has(f.path) || sha(files.get(f.path)) !== f.sha256 || sha(fs.readFileSync(path.join(here, bundle.folder, f.path))) !== f.sha256) { console.log(`FILE MISMATCH: ${name} ${f.path}`); problems += 1; }
}
console.log(problems ? `${problems} difference(s) found.` : `All ${recorded.size} Staging Functions match this record.`);
process.exit(problems ? 1 : 0);
