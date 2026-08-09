const makeItem = (id, chinese, pinyin, english, notes = "") => ({
  id, chinese, pinyin, english, image: null, notes,
  type: /[。！？?!.]/.test(chinese) ? "sentence" : chinese.length > 3 ? "phrase" : "word",
  audio: { aiEnabled: true, teacherAudioUrl: null },
  handwriting: { enabled: false, characters: Array.from(chinese.replace(/[\s？。！?!.]/g, "")) }
});

export const vocabularySets = [
  {
    id: "year1-body-parts", yearLevel: 1, title: "Body Parts", chineseTitle: "身体部位",
    description: "Key body parts for songs, movement and classroom activities.",
    items: [
      makeItem("head", "头", "tou", "head"),
      makeItem("shoulders", "肩膀", "jian bang", "shoulders"),
      makeItem("knees", "膝盖", "xi gai", "knees"),
      makeItem("toes", "脚趾头", "jiao zhi tou", "toes")
    ]
  },
  {
    id: "year2-how-are-you", yearLevel: 2, title: "How are you?", chineseTitle: "你好吗？",
    description: "Short exchanges for asking and answering how someone feels.",
    items: [
      makeItem("how-are-you", "你好吗？", "ni hao ma", "How are you?"),
      makeItem("very-well", "我很好。", "wo hen hao", "I am very well."),
      makeItem("not-well", "我不好。", "wo bu hao", "I am not well."),
      makeItem("so-so", "我马马虎虎。", "wo ma ma hu hu", "I am so-so."),
      makeItem("great", "很棒！", "hen bang", "Great!")
    ]
  },
  {
    id: "year3-age", yearLevel: 3, title: "Age", chineseTitle: "年龄",
    description: "Ask and answer questions about age.",
    items: [
      makeItem("how-old", "你几岁？", "ni ji sui", "How old are you?"),
      makeItem("eight", "我八岁。", "wo ba sui", "I am eight years old."),
      makeItem("nine", "我九岁。", "wo jiu sui", "I am nine years old."),
      makeItem("ten", "我十岁。", "wo shi sui", "I am ten years old.")
    ]
  },
  {
    id: "year4-australian-states", yearLevel: 4, title: "Australian States", chineseTitle: "澳大利亚各州",
    description: "The six Australian states in Mandarin.",
    items: [
      makeItem("victoria", "维多利亚州", "wei duo li ya zhou", "Victoria"),
      makeItem("new-south-wales", "新南威尔士州", "xin nan wei er shi zhou", "New South Wales"),
      makeItem("queensland", "昆士兰州", "kun shi lan zhou", "Queensland"),
      makeItem("south-australia", "南澳大利亚州", "nan ao da li ya zhou", "South Australia"),
      makeItem("western-australia", "西澳大利亚州", "xi ao da li ya zhou", "Western Australia"),
      makeItem("tasmania", "塔斯马尼亚州", "ta si ma ni ya zhou", "Tasmania")
    ]
  },
  {
    id: "year5-countries", yearLevel: 5, title: "Countries", chineseTitle: "国家",
    description: "Names of countries commonly used in introductory conversations.",
    items: [
      makeItem("china", "中国", "zhong guo", "China"),
      makeItem("australia", "澳大利亚", "ao da li ya", "Australia"),
      makeItem("united-states", "美国", "mei guo", "United States"),
      makeItem("united-kingdom", "英国", "ying guo", "United Kingdom"),
      makeItem("japan", "日本", "ri ben", "Japan"),
      makeItem("canada", "加拿大", "jia na da", "Canada")
    ]
  }
];

export function getVocabularySet(id) {
  return vocabularySets.find((set) => set.id === id) || null;
}
