export interface Option {
  id: string;
  name: string;
  emoji: string;
  isCustom: boolean;
}

export interface Category {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  options: Option[];
}

export interface Selection {
  categoryId: string;
  categoryName: string;
  options: Option[];
}

export interface ShareData {
  fromUser: string;
  selections: Selection[];
  timestamp: number;
}

function opts(names: string[]): Option[] {
  return names.map((name, i) => ({ id: `opt_${i}`, name, emoji: '', isCustom: false }));
}

export const CATEGORIES: Category[] = [
  {
    id: 'eat', name: '今天吃什么', shortName: '吃', icon: '🍜',
    options: opts(['火锅','烤肉','日料','粤菜','川菜','湘菜','椰子鸡','牛肉火锅','潮汕牛肉锅','小龙虾','砂锅粥','茶餐厅','早茶','甜品','小蛋糕','冰淇淋','自己做饭','螺蛳粉','麻辣烫','烤鱼','炸鸡','肠粉','牛杂','烧腊'])
  },
  {
    id: 'drink', name: '今天喝什么', shortName: '喝', icon: '🧋',
    options: opts(['喜茶','奈雪的茶','霸王茶姬','茶颜悦色','蜜雪冰城','古茗','茶百道','沪上阿姨','书亦烧仙草','瑞幸咖啡','库迪咖啡','星巴克','Manner','M Stand','混果汁','阿嬷手作','茉莉奶白','一点点','LINLEE','茶话弄','茉酸奶','一只酸奶牛','李若桃','爷爷不泡茶','洪都大拇指','凤仪手作'])
  },
  {
    id: 'play', name: '今天玩什么', shortName: '玩', icon: '🎮',
    options: opts(['KTV','逛商场','爬山','电玩城','狗咖','猫咖','密室逃脱','剧本杀','桌游','抓娃娃','溜冰','DIY手作','卡丁车','射箭','保龄球','台球','LiveHouse','音乐节'])
  },
  {
    id: 'goout', name: '今天去哪逛', shortName: '逛', icon: '📍',
    options: opts(['深圳湾公园','海上世界','华侨城创意园','南头古城','欢乐海岸','万象天地','COCO Park','壹方城','人才公园','欢乐港湾','梧桐山','仙湖植物园','大鹏海边','较场尾','杨梅坑','甘坑古镇','深业上城'])
  },
  {
    id: 'watch', name: '今天看什么', shortName: '看', icon: '🎬',
    options: opts(['电影院','在家看电影','追剧','综艺','纪录片','动漫','脱口秀','话剧','相声'])
  },
  {
    id: 'sport', name: '运动一下', shortName: '运动', icon: '🏃',
    options: opts(['跑步','骑行','羽毛球','游泳','瑜伽','攀岩','飞盘','网球','篮球','徒步','滑板','健身房'])
  },
  {
    id: 'home', name: '宅家模式', shortName: '宅', icon: '🏠',
    options: opts(['一起做饭','打游戏','拼乐高','拼图','叫外卖','一起午睡','看剧刷番','大扫除','给猫/狗洗澡','种花种草'])
  }
];

export function getCategoryById(id: string): Category | undefined {
  return CATEGORIES.find(c => c.id === id);
}

export function encodeShareData(data: ShareData): string {
  return encodeURIComponent(JSON.stringify(data));
}

export function decodeShareData(encoded: string): ShareData | null {
  try {
    return JSON.parse(decodeURIComponent(encoded)) as ShareData;
  } catch {
    return null;
  }
}
