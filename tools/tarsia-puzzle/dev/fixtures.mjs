// Developer fixtures in the published Vocabulary Library shape. Not published data, not a second catalogue.
// The Countries words are transcribed from the two classroom worksheets. Pictures are local stand-ins
// (flag emoji in an SVG data URI) because the prototype must not depend on live images.
const picture = emoji => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="72" font-size="70" text-anchor="middle">${emoji}</text></svg>`)}`;
const item = (id, chinese, pinyin, english, emoji = null, extra = {}) => ({ id, chinese, pinyin, english, image: emoji ? picture(emoji) : null, ...extra });

export const FIXTURE_SETS = Object.freeze([
  {
    id: 'zz-fixture-countries', yearLevel: 5, title: 'Countries (worksheet)', chineseTitle: '国家', published: true,
    items: [
      item('australia', '澳大利亚', 'ao da li ya', 'Australia', '🇦🇺'),
      item('new-zealand', '新西兰', 'xin xi lan', 'New Zealand', '🇳🇿'),
      item('france', '法国', 'fa guo', 'France', '🇫🇷'),
      item('germany', '德国', 'de guo', 'Germany', '🇩🇪'),
      item('china', '中国', 'zhong guo', 'China', '🇨🇳'),
      item('sri-lanka', '斯里兰卡', 'si li lan ka', 'Sri Lanka', '🇱🇰'),
      item('afghanistan', '阿富汗', 'a fu han', 'Afghanistan', '🇦🇫'),
      // Same English and same picture as 澳大利亚: the ambiguity policy never puts both in one puzzle
      // for Hanzi + English or picture modes (it is fine for Hanzi + Pinyin).
      item('australia-short', '澳洲', 'ao zhou', 'Australia', '🇦🇺'),
      item('united-kingdom', '英国', 'ying guo', 'United Kingdom', '🇬🇧'),
      item('united-states', '美国', 'mei guo', 'United States', '🇺🇸'),
      item('canada', '加拿大', 'jia na da', 'Canada', '🇨🇦'),
      item('pakistan', '巴基斯坦', 'ba ji si tan', 'Pakistan', '🇵🇰'),
      item('india', '印度', 'yin du', 'India', '🇮🇳'),
      item('japan', '日本', 'ri ben', 'Japan', '🇯🇵'),
      item('greece', '希腊', 'xi la', 'Greece', '🇬🇷'),
      item('korea', '韩国', 'han guo', 'South Korea', '🇰🇷'),
      item('english', '英文', 'ying wen', 'English'),
      item('chinese', '中文', 'zhong wen', 'Chinese')
    ]
  },
  {
    id: 'zz-fixture-more-countries', yearLevel: 6, title: 'More countries and languages', chineseTitle: '更多国家', published: true,
    items: [
      item('spain', '西班牙', 'xi ban ya', 'Spain', '🇪🇸'),
      item('italy', '意大利', 'yi da li', 'Italy', '🇮🇹'),
      item('vietnam', '越南', 'yue nan', 'Vietnam', '🇻🇳'),
      item('russia', '俄罗斯', 'e luo si', 'Russia', '🇷🇺'),
      item('french', '法文', 'fa wen', 'French'),
      item('japanese', '日文', 'ri wen', 'Japanese'),
      item('china-again', '中国', 'zhong guo', 'China', '🇨🇳') // also in the first set: merged once
    ]
  },
  {
    id: 'zz-fixture-body', yearLevel: 1, title: 'Body parts (too small alone)', chineseTitle: '身体', published: true,
    items: [
      item('head', '头', 'tou', 'head'), item('shoulders', '肩膀', 'jian bang', 'shoulders'),
      item('knees', '膝盖', 'xi gai', 'knees'), item('toes', '脚趾头', 'jiao zhi tou', 'toes')
    ]
  }
]);
