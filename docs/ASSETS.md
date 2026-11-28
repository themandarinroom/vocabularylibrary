# Image and audio asset standard

**Owner document** for vocabulary images, covers, Storage paths, AI and Teacher Voice, and the local asset archive. It is part of the Shared Development Standards v1.0 (`docs/PROJECT_STANDARDS.md`). Owner decisions 2, 4 and 5 were approved on 28 Nov 2026.

## 1. Scope

- **New work** must follow this standard.
- **Existing published images are not reprocessed, migrated or replaced** to make them uniform (§7 lists known historical differences).
- The editor's existing image workflow stays supported unchanged.

## 2. Originals

- Preserve every original asset unchanged: supplied PNGs, PDFs and the owner's artwork. Never overwrite one.
- Work on copies. An import folder keeps an untouched copy, or a hash, of each source in its `source/` folder or `source-manifest.json`.
- Do not regenerate supplied artwork. If an expected original is missing, report it. Never silently substitute another image.

## 3. Image sizes and formats (Decision 2)

| Asset | Standard |
|---|---|
| Original asset | Preserved unchanged |
| Vocabulary PNG master (scripted imports) | 1024 × 1024 transparent RGBA canvas; the subject keeps its own aspect ratio and is centred, with transparent padding |
| Delivery image (scripted imports) | 640 × 640 WebP made from the master; this is what Firestore references |
| Editor item image | Existing workflow: natural aspect ratio, longest side ≤ 800 px, WebP (target ≤ 150 KB) |
| Cover image | Natural aspect ratio, longest side ≤ 1200 px, WebP (target ≤ 300 KB) |
| PNG masters | Archived locally (§5); uploaded to Storage only for an approved functional requirement |

**Processing rules**
- **Proportions:**
  - Keep the subject's original aspect ratio. Never stretch.
  - Transparent padding is permitted.
  - Cropping must not damage or remove any part of the subject. Trimming invisible edge haze is allowed only outside the subject; for example, Fruit II trimmed alpha ≤ 32 at the canvas edges.
- **Resolution:** do not upscale low-resolution subjects by default. An upscaling exception needs owner approval and must be recorded in the task report.
- **Transparency:**
  - An embedded checkerboard is **not** transparency. Check the real alpha channel, for example alpha extrema `(0, 255)` and a meaningful transparent fraction.
  - Remove a baked checkerboard only from background regions connected to the edge.
  - Preserve legitimate white and light-coloured parts of an illustration: highlights, eyes, flags' white stripes, white objects.
- **Inspection:** check every processed image for clipping, unwanted edge pixels and transparency defects. Look at contact sheets on both a light and a dark background, and confirm no foreground alpha touches the canvas edge.
- **Content:** vocabulary pictures contain no Chinese, pinyin or English text.

## 4. Storage paths, uploads and covers (Decision 4)

- **Item images:** `vocabulary/{setId}/{itemId}/image-{revision}.webp`.
- **Covers:** the canonical path for new uploads is `vocabulary/{setId}/cover/image-{revision}.webp`. Existing `set-cover/` paths (Sports I/II, Countries II/III) remain supported as legacy paths and are not migrated.
- **`{revision}`** is a millisecond timestamp. Objects are immutable: a change uploads a new object, never overwrites one.
- **Scripted uploads:**
  - Use `ifGenerationMatch=0` (create-only), `cacheControl: public,max-age=31536000,immutable` and a `firebaseStorageDownloadTokens` token.
  - Re-download each object and compare its bytes with the local file before writing Firestore.
- **Firestore fields:** these store the download URL plus the path: `coverImage` / `coverImageStoragePath` / `coverImageGenerated`, and item `image` / `imageStoragePath`. Editor uploads also store `imageSource: "upload"`. No Base64.
- **Environment isolation:** each environment references its own bucket by default (`docs/PROJECT_STANDARDS.md` §4).
- **Cover reuse by reference is permitted and encouraged** where appropriate. Examples:
  - a set's cover is one of its own item images (Sports I uses 运动);
  - a follow-on set uses its series' cover (Fruit II uses Fruit I's exact cover URL and path).
  - No copy is uploaded.
- **Reference-safe cleanup is required.** A shared image must not be deleted while any vocabulary set still references it.
  - The editor's save (`js/vocabulary-image-save.js`) deletes a superseded managed image only when no published set references it.
  - Any future cleanup tool must apply the same check across **all** sets, including other sets' covers.

## 5. Local asset archive (Decision 5)

- **Destination:** the vocabulary set's folder inside the owner's teaching resources, `Desktop/🍊中文/Units of Work …/<unit folder>/<Set name>/`. Examples: `0007_Food/Fruit/images/Fruit II/`, `0002_Colours/Colours II/`, `0008_Countries & Nationalities/Countries III/`.
- **Names:**
  - Processed PNG masters use lowercase English-based, filesystem-safe names: the item ID's English part, such as `orange.png`, `kiwifruit.png`, `south-korea.png`.
  - Covers use `cover_<set>_<roman>.png`, for example `cover_colours_II.png` and `cover_countries_II.png`.
  - An extracted original that would clash with its processed master gets `-original` (`iran-original.png`).
- **Rules:**
  - Never overwrite an existing file. If a different file already has the name, stop and report the collision.
  - Keep the owner's originals in place.
  - Record every archived file with its SHA-256 in the import folder's `archive-manifest.json`.
- **Timing:** archive after successful Production publication.

## 6. Audio

**AI Voice**
- Browser speech synthesis, isolated in `js/audio.js` with vendored copies in the tools.
- It must name a standard Mandarin voice through `chooseMandarinVoice` (Tingting preferred), never `lang` alone.
- Silent speech shorter than 300 ms is reported as an error in the game players.
- Background and evidence: `docs/PROJECT_STANDARDS.md` §9.
- Every item has `audio: { aiEnabled: true }` unless the owner decides otherwise.

**Teacher Voice**
- One recording per item.
- Storage path: `vocabulary/{setId}/{itemId}/teacher-voice-{revision}`.
- Metadata: `vocabularyTeacherVoices/{setId}--{itemId}`.
- The key depends on stable set and item IDs, which is one reason IDs never change (`docs/VOCABULARY_SET_CREATION.md` §7).
- **Rules:**
  - Imports never write, copy or delete Teacher Voice records.
  - They snapshot `vocabularyTeacherVoices` in both projects before and after, and prove it unchanged.
  - New sets start with no recordings; the teacher records them in the editor.
  - Recordings are not synchronised between environments.

## 7. Known historical differences (no action)

These are recorded so nobody copies them as precedent:
- **Countries II flags:** the PDF bitmaps were about 160 px. They were upscaled to 720 px wide so they display the same size as Countries III. This predates the no-upscaling rule and was reported at the time.
- **Countries II/III flags** also have a 2 px light-grey hairline, so white edges stay visible. The flags keep their natural aspect ratio rather than a 1024 square master.
- **Colours I/II and Fruit II** uploaded their PNG masters to Storage as well as the WebP. New imports upload delivery WebPs only.
- **Sports and Countries** used natural-aspect WebPs (no 1024 masters) and the legacy `set-cover/` path.
- **Countries I and other earlier sets** use 1024 × 1024 RGB AI-generated images on a cream background.
