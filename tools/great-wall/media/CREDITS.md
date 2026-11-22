# Build the Great Wall — reward video sources

Downloaded 22 Nov 2026 with the owner's approval. v0.2 (22 Nov 2026): each file was re-cut from the same source as one
continuous 15.000 s segment (450 frames at 30 fps), with no frozen frames, loops or cuts. Each is 1280×720 H.264 High, no audio track, `+faststart`. The poster JPEG (frame at 3 s, 960 px) is the fallback picture.
None of the source clips had usable natural sound (the Pexels clips have no audio, or a silent track; the Commons clip has none).

| File | Scene | Source | Author | Licence | Segment used | Size |
|---|---|---|---|---|---|---|
| `sunrise.mp4` | Sunrise on the Great Wall 长城日出 | https://www.pexels.com/video/sunrise-over-the-great-wall-of-china-30806149/ (1920×1080) | Eclipse Chasers | Pexels License, https://www.pexels.com/license/ (free use; attribution not required, given anyway) | 13–28 s | 1.30 MB |
| `climb.mp4` | Up to the watchtower 登上烽火台 | https://commons.wikimedia.org/wiki/File:Flying_the_Drone_around_the_Great_Wall_of_China_near_Jinshan_Ridge.webm (1080p transcode) | Johnny Xmas | **CC BY 3.0**, https://creativecommons.org/licenses/by/3.0/ — attribution required | 0.5–15.5 s | 1.98 MB |
| `sunset.mp4` | Golden sunset 长城日落 | https://www.pexels.com/video/sunset-over-the-great-wall-of-china-36620856/ (1920×1080) | Eclipse Chasers | Pexels License | 6–21 s | 1.20 MB |
| `mountains.mp4` | Green mountain panorama 群山长城 | https://www.pexels.com/video/the-great-wall-of-china-1193306/ (1920×1080) | Tom Fisk | Pexels License | 3–18 s | 3.93 MB |
| `watchtowers.mp4` | Flying around a watchtower 环绕烽火台 | same Wikimedia Commons file as `climb.mp4` | Johnny Xmas | **CC BY 3.0** — attribution required | 42–57 s | 3.96 MB |

Total about 12.4 MB; a student downloads only the one video they choose (≤ 4.0 MB).

**Attribution** is shown under the video while it plays (`credit` in `../rewards.mjs`). CC BY 3.0 requires credit,
a licence link and a note of changes; the credit line says "trimmed to 15 s and resized".

**Content check:** every clip was reviewed frame by frame (contact sheets). They show only the Wall and landscape:
no people, text or logos, apart from a few small, distant visitors on the wall and tower roof in `watchtowers.mp4`
(last 5 s included).

## Flag artwork

`dragon-flag.webp`: yellow dragon banner supplied by The Mandarin Room (the owner) on 22 Nov 2026 for use in this game.
It was cropped to the cloth (the pole is drawn in the scene), resized to 420×305 and saved as WebP with transparency (28 KB).

## Gaps against the brief

- **Snow, autumn and clouds:** no suitably licensed Great Wall footage was found. A Pexels "misty Great Wall" clip
  (32904874) was downloaded and rejected: it is crowded with hikers and its location could not be confirmed as the
  Great Wall. Replace when licensed footage is available; only `rewards.mjs` and this file change.
- **Natural sound:** none available (see above).
- **First-person viewpoint:** `climb.mp4` is the closest — a slow flight up the wall towards a watchtower.

## Encoding command

`ffmpeg -ss <start> -i <source> -t 15 -an -vf "scale=1280:720:flags=lanczos,fps=30,format=yuv420p" -c:v libx264 -profile:v high -level 4.0 -preset slow -crf <25–27> -maxrate 2.2M -bufsize 4.4M -movflags +faststart <id>.mp4`
(CRF 25 for sunrise and sunset, 26 for climb and watchtowers, 27 for mountains, keeping every file under 4.5 MB).
