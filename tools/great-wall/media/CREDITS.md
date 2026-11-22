# Build the Great Wall — reward video sources

Downloaded 22 Nov 2026 with the owner's approval. Each file is exactly 10.000 s (300 frames at 30 fps),
1280×720 H.264 High, no audio track, `+faststart`. The poster JPEG (frame at 3 s, 960 px) is the fallback picture.
None of the source clips had usable natural sound (the Pexels clips have no audio, or a silent track; the Commons clip has none).

| File | Scene | Source | Author | Licence | Segment used | Size |
|---|---|---|---|---|---|---|
| `sunrise.mp4` | Sunrise on the Great Wall 长城日出 | https://www.pexels.com/video/sunrise-over-the-great-wall-of-china-30806149/ (1920×1080) | Eclipse Chasers | Pexels License, https://www.pexels.com/license/ (free use; attribution not required, given anyway) | 13–23 s | 0.98 MB |
| `climb.mp4` | Up to the watchtower 登上烽火台 | https://commons.wikimedia.org/wiki/File:Flying_the_Drone_around_the_Great_Wall_of_China_near_Jinshan_Ridge.webm (1080p transcode) | Johnny Xmas | **CC BY 3.0**, https://creativecommons.org/licenses/by/3.0/ — attribution required | 0.5–10.5 s | 1.76 MB |
| `sunset.mp4` | Golden sunset 长城日落 | https://www.pexels.com/video/sunset-over-the-great-wall-of-china-36620856/ (1920×1080) | Eclipse Chasers | Pexels License | 6–16 s | 0.93 MB |
| `mountains.mp4` | Green mountain panorama 群山长城 | https://www.pexels.com/video/the-great-wall-of-china-1193306/ (1920×1080) | Tom Fisk | Pexels License | 3–13 s | 3.85 MB |
| `watchtowers.mp4` | Flying around a watchtower 环绕烽火台 | same Wikimedia Commons file as `climb.mp4` | Johnny Xmas | **CC BY 3.0** — attribution required | 42–52 s | 3.32 MB |

Total about 10.9 MB; a student downloads only the one video they choose (≤ 3.9 MB).

**Attribution** is shown under the video while it plays (`credit` in `../rewards.mjs`). CC BY 3.0 requires credit,
a licence link and a note of changes; the credit line says "trimmed to 10 s and resized".

**Content check:** every clip was reviewed frame by frame (contact sheets). They show only the Wall and landscape:
no people, text or logos, apart from a few distant visitors at a tower roof in `watchtowers.mp4`.

## Gaps against the brief

- **Snow, autumn and clouds:** no suitably licensed Great Wall footage was found. A Pexels "misty Great Wall" clip
  (32904874) was downloaded and rejected: it is crowded with hikers and its location could not be confirmed as the
  Great Wall. Replace when licensed footage is available; only `rewards.mjs` and this file change.
- **Natural sound:** none available (see above).
- **First-person viewpoint:** `climb.mp4` is the closest — a slow flight up the wall towards a watchtower.

## Encoding command

`ffmpeg -ss <start> -i <source> -t 10 -an -vf "scale=1280:720:flags=lanczos,fps=30,format=yuv420p" -c:v libx264 -profile:v high -level 4.0 -preset slow -crf 25 -maxrate 3M -bufsize 6M -movflags +faststart <id>.mp4`
