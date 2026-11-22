// Build the Great Wall: the five mystery-box reward videos (pure data + helpers).
// Each video is exactly VIDEO_SECONDS long (1280×720 H.264, no audio track), stored in ./media/
// with a poster JPEG that is also the fallback picture if the video cannot play.
// An entry with available: false would be shown as a clearly labelled placeholder, never as other footage.
// Sources, licences and attribution: ./media/CREDITS.md.
import { shuffle } from '../listening-core/rounds.mjs';

export const VIDEO_SECONDS = 15;
export const BOX_COUNT = 5;

const pexels = (author, url) => `Video: ${author} on Pexels (${url}) · Pexels License · trimmed to 15 s`;
const COMMONS = 'Video: Johnny Xmas, “Flying the Drone around the Great Wall of China near Jinshan Ridge”, CC BY 3.0 (creativecommons.org/licenses/by/3.0), via Wikimedia Commons (commons.wikimedia.org) · trimmed to 15 s and resized';

export const REWARDS = Object.freeze([
  Object.freeze({ id: 'sunrise', title: 'Sunrise on the Great Wall', chinese: '长城日出', available: true,
    src: './media/sunrise.mp4', poster: './media/sunrise.jpg', credit: pexels('Eclipse Chasers', 'pexels.com/video/30806149') }),
  Object.freeze({ id: 'climb', title: 'Up to the watchtower', chinese: '登上烽火台', available: true,
    src: './media/climb.mp4', poster: './media/climb.jpg', credit: COMMONS }),
  Object.freeze({ id: 'sunset', title: 'Golden sunset', chinese: '长城日落', available: true,
    src: './media/sunset.mp4', poster: './media/sunset.jpg', credit: pexels('Eclipse Chasers', 'pexels.com/video/36620856') }),
  Object.freeze({ id: 'mountains', title: 'Green mountain panorama', chinese: '群山长城', available: true,
    src: './media/mountains.mp4', poster: './media/mountains.jpg', credit: pexels('Tom Fisk', 'pexels.com/video/1193306') }),
  Object.freeze({ id: 'watchtowers', title: 'Flying around a watchtower', chinese: '环绕烽火台', available: true,
    src: './media/watchtowers.mp4', poster: './media/watchtowers.jpg', credit: COMMONS })
]);

// A fresh, random box → video mapping for every new game: five boxes, five different videos.
export function assignBoxes(random = Math.random, rewards = REWARDS) {
  return Object.freeze(shuffle(rewards.map(reward => reward.id), random).slice(0, BOX_COUNT));
}
export const rewardById = (id, rewards = REWARDS) => rewards.find(reward => reward.id === id) || null;
