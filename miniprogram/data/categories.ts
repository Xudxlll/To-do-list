export interface Option {
  id: string;
  name: string;
  emoji: string;
  isCustom: boolean;
  description?: string;
}

export interface Category {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  optionGroups: OptionGroup[];
  options: Option[];
}

export interface OptionGroup {
  id: string;
  title: string;
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
  mode?: 'selection' | 'freeText';
  freeText?: string;
}

interface CategoryConfig {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  groups: Array<{
    id: string;
    title: string;
    names: OptionInput[];
  }>;
}

type OptionInput = string | {
  name: string;
  description?: string;
};

function opts(categoryId: string, groupId: string, names: OptionInput[]): Option[] {
  return names.map((item, i) => {
    const name = typeof item === 'string' ? item : item.name;
    const description = typeof item === 'string' ? undefined : item.description;
    return { id: `${categoryId}_${groupId}_${i}`, name, emoji: '', isCustom: false, description };
  });
}

function category(config: CategoryConfig): Category {
  const optionGroups = config.groups.map(group => ({
    id: group.id,
    title: group.title,
    options: opts(config.id, group.id, group.names),
  }));
  return {
    id: config.id,
    name: config.name,
    shortName: config.shortName,
    icon: config.icon,
    optionGroups,
    options: optionGroups.flatMap(group => group.options),
  };
}

export const CATEGORIES: Category[] = [
  category({
    id: 'eat', name: '今天吃什么', shortName: '吃', icon: '🍜',
    groups: [
      { id: 'cuisine', title: '菜系', names: ['湘菜','川菜','赣菜','粤菜','潮汕菜','客家菜','云南菜','新疆菜','东北菜','江浙菜','西北菜','日料','韩餐','泰餐','西餐'] },
      { id: 'hotpot', title: '火锅锅物', names: ['火锅','潮汕牛肉锅','椰子鸡','牛肉火锅','猪肚鸡','羊蝎子','寿喜锅','麻辣烫','冒菜','砂锅粥'] },
      { id: 'grill', title: '烤肉烧烤', names: ['烤肉','烧烤','烤鱼','铁板烧','小龙虾','炸鸡','韩式炸鸡'] },
      { id: 'snack', title: '小吃快餐', names: ['螺蛳粉','肠粉','牛杂','烧腊','茶餐厅','早茶','汉堡','披萨','米粉面馆','盖饭'] },
      { id: 'dessert', title: '甜品轻食', names: ['甜品','小蛋糕','冰淇淋','糖水','面包店','轻食沙拉','水果捞'] },
      { id: 'homecook', title: '在家吃', names: ['自己做饭','一起煮面','煎牛排','空气炸锅','叫外卖','清冰箱料理'] },
    ],
  }),
  category({
    id: 'drink', name: '今天喝什么', shortName: '喝', icon: '🧋',
    groups: [
      { id: 'milk_tea', title: '奶茶果茶', names: ['喜茶','奈雪的茶','霸王茶姬','茶颜悦色','蜜雪冰城','古茗','茶百道','沪上阿姨','书亦烧仙草','一点点','LINLEE','茶话弄'] },
      { id: 'special_tea', title: '特色茶饮', names: ['阿嬷手作','茉莉奶白','李若桃','爷爷不泡茶','洪都大拇指','凤仪手作','茉酸奶','一只酸奶牛'] },
      { id: 'coffee', title: '咖啡', names: ['瑞幸咖啡','库迪咖啡','星巴克','Manner','M Stand','Seesaw','Peet’s Coffee','Tims'] },
      { id: 'fresh', title: '鲜榨轻饮', names: ['混果汁','鲜榨果汁','椰子水','柠檬茶','气泡水','酸奶杯','冰美式'] },
      { id: 'night', title: '微醺夜饮', names: ['精酿啤酒','鸡尾酒','清吧','小酒馆','热红酒','无酒精特调'] },
    ],
  }),
  category({
    id: 'play', name: '今天玩什么', shortName: '玩', icon: '🎮',
    groups: [
      { id: 'indoor', title: '室内娱乐', names: ['KTV','电玩城','抓娃娃','桌游','VR体验馆','桌面游戏','Switch派对'] },
      { id: 'story', title: '沉浸体验', names: ['密室逃脱','剧本杀','沉浸式展览','鬼屋','解谜体验馆','互动戏剧'] },
      { id: 'creative', title: '手作体验', names: ['DIY手作','陶艺','油画','香薰蜡烛','银饰手作','烘焙课','Tufting'] },
      { id: 'pets', title: '治愈陪伴', names: ['猫咖','狗咖','宠物乐园','水族馆','动物园','花鸟市场'] },
      { id: 'casual_play', title: '轻松玩乐', names: ['拍大头贴','桌面冰壶','盲盒店','电玩城挑战','主题乐园','轰趴馆'] },
      { id: 'shopping', title: '逛逛买买', names: ['逛商场','买衣服','逛书店','逛超市','逛市集','探店拍照'] },
    ],
  }),
  category({
    id: 'goout', name: '今天去哪逛', shortName: '逛', icon: '📍',
    groups: [
      {
        id: 'mall',
        title: '商圈商场',
        names: [
          { name: '壹方天地', description: '龙华区·龙华商业中心｜2025-2026人气榜头部商场，体量大，吃喝玩买能逛很久。' },
          { name: '红山6979', description: '龙华区·红山站｜开放式街区商业，餐饮、小店和艺术空间集中，离深圳北站近。' },
          { name: '龙华8号仓', description: '龙华区·民治/光雅园片区｜经典Outlet，运动服饰折扣多，适合边逛边淘货。' },
          { name: '观澜湖新城MH MALL', description: '龙华区·观澜湖站｜度假区旁大型Mall，亲子、运动、餐饮和娱乐项目比较全。' },
          { name: '卓悦中心', description: '福田区·岗厦北/福田CBD｜市中心人气商圈，适合逛街吃饭后看城市夜景。' },
          { name: '卓悦汇', description: '福田区·上梅林片区｜社区型人气商场，餐饮选择多，适合轻松吃饭逛店。' },
          { name: '福田COCO Park', description: '福田区·购物公园站｜老牌热门商场，餐饮、酒吧街和夜生活选择丰富。' },
          { name: '深业上城', description: '福田区·莲花街道皇岗路｜红色连廊和高低区街区适合拍照、逛店、喝咖啡。' },
          { name: 'KK ONE', description: '福田区·下沙/车公庙片区｜中型商场人气强，餐饮活动密集，适合饭点约会。' },
          { name: '万象天地', description: '南山区·高新园/大冲｜街区+Mall组合，潮流品牌、餐饮和打卡装置集中。' },
          { name: '深圳湾万象城', description: '南山区·后海/深圳湾｜高端商业和海边片区相连，适合精致逛街和约饭。' },
          { name: '前海壹方城', description: '宝安区·宝安中心新湖路｜超大体量商场，吃喝玩买一站式，亲子和潮流店都多。' },
          { name: '欢乐港湾', description: '宝安区·宝兴路/滨海文化公园｜湾区之光摩天轮、海边步道和夜景很出片。' },
          { name: '海雅缤纷城', description: '宝安区·新安街道｜宝安老牌高人气综合体，IP展、市集和餐饮更新频繁。' },
          { name: '宝安大仟里', description: '宝安区·坪洲站｜地铁直达，生活餐饮和年轻化活动多，适合西部轻松逛。' },
          { name: '罗湖KK Time', description: '罗湖区·水贝/翠竹片区｜罗湖新晋热门商场，品牌和亲子餐饮组合丰富。' },
        ],
      },
      {
        id: 'park',
        title: '公园绿地',
        names: [
          { name: '深圳人才公园', description: '南山区·后海片区｜临深圳湾的城市公园，春笋夜景、环湖步道和花海都适合散步。' },
          { name: '深圳湾公园', description: '南山区/福田区·深圳湾沿线｜海边长廊、日落和骑行散步路线，人气稳定很高。' },
          { name: '莲花山公园', description: '福田区·市民中心北侧｜登顶可看福田CBD，轻松路线，适合傍晚看城市景观。' },
          { name: '香蜜公园', description: '福田区·香蜜湖片区｜绿化舒服、动线轻松，适合低强度散步和拍照。' },
          { name: '大沙河生态长廊', description: '南山区·西丽到深圳湾｜沿河绿道很长，适合慢走、骑行和周末放空。' },
          { name: '仙湖植物园', description: '罗湖区·莲塘仙湖路｜植物景观和湖区丰富，适合半日游，也可顺路去弘法寺。' },
        ],
      },
      {
        id: 'sea',
        title: '海边看海',
        names: [
          { name: '大梅沙海滨公园', description: '盐田区·大梅沙｜深圳经典海滩，交通成熟，适合想轻松看海玩沙。' },
          { name: '盐田海滨栈道', description: '盐田区·沙头角到大梅沙沿线｜沿海步道视野开阔，适合边走边看海。' },
          { name: '较场尾', description: '大鹏新区·大鹏半岛｜民宿和海边小街集中，适合周末短途看海。' },
          { name: '杨梅坑', description: '大鹏新区·南澳街道｜海岸线和山海景观漂亮，适合拍照和骑行观景。' },
          { name: '桔钓沙', description: '大鹏新区·南澳片区｜沙滩水色清透，适合想要更度假感的海边行程。' },
          { name: '官湖村', description: '大鹏新区·葵涌片区｜海边村落和小众咖啡店多，适合慢节奏拍照。' },
        ],
      },
      {
        id: 'culture',
        title: '文化街区',
        names: [
          { name: '南头古城', description: '南山区·南头古城站/中山公园站｜古城更新后的文创街区，历史建筑、咖啡和小店密集。' },
          { name: '华侨城创意园', description: '南山区·侨城东/华侨城片区｜老牌创意园，咖啡、展览、买手店和街区漫步都好逛。' },
          { name: '大芬油画村', description: '龙岗区·布吉大芬｜画廊和油画工作室集中，适合看画、买装饰画和拍街景。' },
          { name: '观澜版画村', description: '龙华区·观澜街道｜版画基地和客家古村结合，节奏慢，适合文艺半日游。' },
          { name: '大鹏所城', description: '大鹏新区·大鹏街道｜明清海防古城，古街、城门和小店适合和海边行程组合。' },
          { name: '海上世界文化艺术中心', description: '南山区·蛇口望海路｜看展、看海、逛设计商店都方便，适合傍晚接海上世界。' },
        ],
      },
      {
        id: 'mountain',
        title: '自然徒步',
        names: [
          { name: '梧桐山', description: '罗湖区/盐田区·梧桐山风景区｜深圳经典登山目的地，强度较高，山海城市视野开阔。' },
          { name: '塘朗山', description: '南山区·桃源村/龙珠门｜市区内热门轻徒步，难度适中，山顶可看南山福田景观。' },
          { name: '梅林山', description: '福田区·梅林片区｜郊野公园路线自然感强，可连接塘朗山，适合想多走一点的人。' },
          { name: '凤凰山森林公园', description: '宝安区·福永凤凰山｜低难度登山和祈福路线，人气高，适合轻松半日。' },
          { name: '阳台山', description: '龙华区/宝安区交界｜深圳西部热门登山路线，视野开阔，适合周末运动。' },
          { name: '马峦山', description: '坪山区·马峦街道｜山谷、溪流和郊野路线丰富，适合更自然的徒步体验。' },
        ],
      },
      {
        id: 'citywalk',
        title: '城市散步',
        names: [
          { name: '后海深圳湾Citywalk', description: '南山区·人才公园到深圳湾｜城市天际线、海风和夜景结合，适合傍晚走。' },
          { name: '蛇口海上世界Citywalk', description: '南山区·蛇口片区｜海上世界、女娲公园和艺术中心串联，吃喝看海都方便。' },
          { name: '福田CBD夜景Citywalk', description: '福田区·市民中心/岗厦北｜高楼夜景密集，适合饭后散步和拍城市感照片。' },
          { name: '东门老街Citywalk', description: '罗湖区·东门步行街｜深圳老牌商业街，小吃和烟火气足，适合随便逛。' },
          { name: '华强北Citywalk', description: '福田区·华强北片区｜电子街区和商场密集，适合猎奇、买小玩意和吃小吃。' },
          { name: '前海欢乐港湾Citywalk', description: '宝安区·宝中/前海湾｜商场、海边、公园和摩天轮连在一起，路线轻松好拍。' },
        ],
      },
    ],
  }),
  category({
    id: 'watch', name: '今天看什么', shortName: '看', icon: '🎬',
    groups: [
      { id: 'cinema', title: '电影', names: ['电影院','IMAX','杜比影院','在家看电影','老电影补课','恐怖片','爱情片','喜剧片'] },
      { id: 'series', title: '剧集综艺', names: ['追剧','综艺','真人秀','恋综','悬疑剧','韩剧','国产剧','英美剧'] },
      { id: 'anime', title: '动画动漫', names: ['动漫','动画电影','新番','国漫','宫崎骏','皮克斯','短片合集'] },
      { id: 'knowledge', title: '纪录内容', names: ['纪录片','美食纪录片','旅行纪录片','自然纪录片','人物访谈','公开课'] },
      { id: 'live_show', title: '现场演出', names: ['脱口秀','话剧','相声','音乐剧','演唱会','LiveHouse','音乐节'] },
    ],
  }),
  category({
    id: 'sport', name: '运动一下', shortName: '运动', icon: '🏃',
    groups: [
      { id: 'daily', title: '日常轻运动', names: ['散步','跑步','骑行','跳绳','健身房','椭圆机','普拉提','瑜伽'] },
      { id: 'ball', title: '球类', names: ['羽毛球','网球','篮球','乒乓球','足球','壁球','台球','保龄球'] },
      { id: 'water', title: '水上运动', names: ['游泳','冲浪体验','桨板','皮划艇','潜水体验','水上乐园'] },
      { id: 'outdoor', title: '户外挑战', names: ['徒步','爬山','露营','飞盘','攀岩','滑板','轮滑','卡丁车'] },
      { id: 'recovery', title: '恢复放松', names: ['拉伸','泡脚','按摩','汗蒸','温泉','冥想','筋膜枪放松'] },
    ],
  }),
  category({
    id: 'home', name: '宅家模式', shortName: '宅', icon: '🏠',
    groups: [
      { id: 'cook', title: '吃点东西', names: ['一起做饭','叫外卖','烤点东西','煮火锅','做甜品','做早餐','调饮料'] },
      { id: 'game', title: '娱乐放松', names: ['打游戏','双人成行','Switch','手机游戏','看剧刷番','看电影','听歌发呆'] },
      { id: 'handmade', title: '动手消磨', names: ['拼乐高','拼图','收纳整理','种花种草','手账','做模型','修照片'] },
      { id: 'chores', title: '生活任务', names: ['大扫除','洗衣服','整理衣柜','采购清单','给猫/狗洗澡','换床单','整理冰箱'] },
      { id: 'rest', title: '休息充电', names: ['一起午睡','泡澡','敷面膜','按摩放松','早睡','阳台吹风','什么都不做'] },
    ],
  }),
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
