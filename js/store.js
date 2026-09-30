/**
 * store.js
 * -----------------------------------------------------------------------------
 * 极简状态存储层（store）。
 *
 * 职责：
 *   1. 维护一个 character 状态对象（概念段 + 属性 + 技能）。
 *   2. 提供 load() / save()，当前把数据持久化到浏览器 localStorage。
 *   3. 预留 api 接口（get/save）作为「未来后端」的接入点：
 *        - 现在不接后端，save 走 localStorage；
 *        - 将来接后端时，只需把 saveToStorage 换成 fetch 调用即可，
 *          页面其它代码零改动。
 *
 * 迁移到 Vue 时：本模块的 character 状态可直接作为 Vue 的
 * reactive/ref 状态，或作为 Pinia store 的 state 复用。
 */

import { ATTRIBUTES, SKILLS } from './character-config.js';

const STORAGE_KEY = 'infrole.character.v1';

function emptyCharacter() {
  const attrs = {};
  ATTRIBUTES.forEach((a) => {
    // 每个属性：base 即建卡时填写的基础值，其余加值栏预留给后续扩展。
    attrs[a.id] = { base: a.default, inner: 0, practice: 0, gear: 0, perfect: 0, other: 0 };
  });

  const skills = {};
  SKILLS.forEach((s) => {
    skills[s.id] = { base: s.default, inner: 0, practice: 0, gear: 0, perfect: 0, morale: 0, other: 0 };
  });

  return {
    meta: {
      version: '0.1.0',
      updatedAt: null,
    },
    concepts: {
      name: '',
      gender: '',
      race: '',
      age: '',
      build: '', // 身高体重
      appearance: '',
      background: '',
      totalResources: '', // 总资源量
    },
    attributes: attrs,
    skills: skills,
    // —— 可动态增删行的列表（在角色卡内用「表单切换」切换）——
    spells: [], // 法术列表 & 法术预设
    spellBaseBonuses: [0, 0, 0, 0, 0, 0], // 施法基础检定栏的 6 个加成位
    specialAttacks: [], // 特殊攻击预设
    energyPools: [], // 能量池
    perks: [], // 专长列表
    equipment: [], // 装备位（特性已独立到 traits）
    traits: [], // 特性列表（来源 / 描述）
    resources: {
      purchases: [], // 资源消耗统计（价格 / 内容）
      leftover: { d: '', score: '', xp: '' }, // 未使用资源（支线/分数/xp）
      records: [], // 资源获取记录（数量 / 来源）
    },
    // —— 角色总览 / 角色属性页（参考 Excel「角色属性」sheet 底部）——
    geneLock: 0, // 基因锁熟练度（基础值）
    hpSlots: { intact: 0, b: 0, l: 0, a: 0, temp: 0 }, // 生命值各状态点数
    otherInfo: { range: '', sensitive: '' }, // 范围 / 敏感范围
    defense: {
      armor: { innate: 0, base: 0, armor: 0, block: 0, insight: 0, other: 0 }, // 护甲各来源
      armorBonus: [0, 0, 0, 0], // 合计护甲的额外加成
      reduction: [], // 伤害减免列表：{type, amount, source}
    },
    derivedDetail: {
      // 属性细则各派生项的加成栏（每种 5 个加成来源：加成1-5）
      movement: { feat: 0, bonus: [0, 0, 0, 0, 0] },
      initiative: { feat: 0, bonus: [0, 0, 0, 0, 0] },
      willpower: { feat: 0, bonus: [0, 0, 0, 0, 0] },
      health: { feat: 0, bonus: [0, 0, 0, 0, 0] },
      saves: { special: [0, 0, 0], feat: [0, 0, 0], bonus: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // 反射/意志/强韧：专业×3 + 专长×3 + 加成1-6 ×各自(共18位)
      sensitive: { bonus: [0, 0, 0, 0, 0] }, // 敏感范围：加成1-5
    },
    baseAttacks: [
      { id: 'whiteblade', label: '白刃攻击', attr: 'strength', skill: 'weaponry', weaponDamage: 0, specialty: 0, bonuses: [0, 0, 0, 0, 0], other: 0, effect: '', extraSuccessBonus: [0, 0, 0] },
      { id: 'brawl', label: '肉搏攻击', attr: 'strength', skill: 'brawl', weaponDamage: 0, specialty: 0, bonuses: [0, 0, 0, 0, 0], other: 0, effect: '', extraSuccessBonus: [0, 0, 0] },
      { id: 'semi', label: '半自动枪械攻击', attr: 'dexterity', skill: 'firearms', ammoDamage: 0, weaponDamage: 0, specialty: 0, bonuses: [0, 0, 0, 0, 0], other: 0, effect: '', extraSuccessBonus: [0, 0, 0] },
      { id: 'full', label: '全自动枪械攻击', attr: 'dexterity', skill: 'firearms', ammoCount: 1, weaponDamage: 0, ammoDamage: 0, specialty: 0, bonuses: [0, 0, 0, 0, 0], other: 0, effect: '', extraSuccessBonus: [0, 0, 0] },
      { id: 'bow', label: '弓箭攻击', attr: 'dexterity', skill: 'athletics', ammoDamage: 0, weaponDamage: 0, specialty: 0, bonuses: [0, 0, 0, 0, 0], other: 0, effect: '', extraSuccessBonus: [0, 0, 0] },
    ],
    // —— 预留 ——
    derived: {}, // 未来：生命值 / 意志 / 先攻 / 移动力 / 豁免等
  };
}

/** 可动态增删行的「新行」默认结构。 */
function newSpell() {
  return {
    name: '法术',
    potency: 0, // 法术威力
    cost: 0, // 耗能
    specialty: 0, // 专业
    bonuses: [0, 0, 0, 0, 0, 0], // 检定加成 1..6
    dmgBonuses: [0, 0, 0], // 伤害上限加成列表（额外）
    effect: '',
  };
}
function newAttack() {
  return {
    name: '攻击',
    note: '',
    attr: 'strength',
    skill: 'brawl',
    weaponDamage: 0,
    specialty: 0,
    bonuses: [0, 0, 0, 0],
  };
}
function newEnergyPool() {
  return { name: '能量池', attr1: 'intelligence', attr2: '', bonuses: [0, 0, 0], recovery: '' };
}
function newPerk() {
  return { tier: 1, name: '', info: '' };
}
function newEquipment() {
  return { slot: '其它', name: '', effect: '' };
}
function newTrait() {
  return { source: '', desc: '' };
}
function newPurchase() {
  return { price: '', content: '' };
}
function newRecord() {
  return { amount: '', source: '' };
}
function newReduction() {
  return { type: '物理', amount: 0, source: '' };
}

// 简单的深合并：用外来的已保存数据覆盖默认空角色。
function normalize(raw) {
  const empty = emptyCharacter();
  if (!raw || typeof raw !== 'object') return empty;

  const merged = { ...empty, ...raw };
  if (raw.concepts) merged.concepts = { ...empty.concepts, ...raw.concepts };
  if (raw.attributes) merged.attributes = { ...empty.attributes, ...raw.attributes };
  if (raw.skills) merged.skills = { ...empty.skills, ...raw.skills };
  if (!Array.isArray(merged.spells)) merged.spells = [];
  if (!Array.isArray(merged.spellBaseBonuses)) merged.spellBaseBonuses = [0, 0, 0, 0, 0, 0];
  if (!Array.isArray(merged.specialAttacks)) merged.specialAttacks = [];
  if (!Array.isArray(merged.energyPools)) merged.energyPools = [];
  if (!Array.isArray(merged.perks)) merged.perks = [];
  if (!Array.isArray(merged.equipment)) merged.equipment = [];
  if (!Array.isArray(merged.traits)) merged.traits = [];
  if (!merged.resources || typeof merged.resources !== 'object') merged.resources = empty.resources;
  if (!Array.isArray(merged.resources.purchases)) merged.resources.purchases = [];
  if (!Array.isArray(merged.resources.records)) merged.resources.records = [];
  if (!merged.resources.leftover) merged.resources.leftover = empty.resources.leftover;
  if (!merged.hpSlots || typeof merged.hpSlots !== 'object') merged.hpSlots = empty.hpSlots;
  if (merged.geneLock == null) merged.geneLock = empty.geneLock;
  if (!merged.otherInfo || typeof merged.otherInfo !== 'object') merged.otherInfo = empty.otherInfo;
  if (!merged.defense || typeof merged.defense !== 'object') merged.defense = empty.defense;
  if (!merged.defense.armor) merged.defense.armor = empty.defense.armor;
  if (!Array.isArray(merged.defense.armorBonus)) merged.defense.armorBonus = [0, 0, 0, 0];
  if (!Array.isArray(merged.defense.reduction) || merged.defense.reduction.length < 2) {
    merged.defense.reduction = [
      { type: '物理', amount: 0, source: '' },
      { type: '能量', amount: 0, source: '' },
    ];
  } else {
    merged.defense.reduction = merged.defense.reduction.map((r) =>
      r && typeof r === 'object' ? { type: r.type || '物理', amount: Number(r.amount) || 0, source: r.source || '' } : newReduction()
    );
  }
  if (!merged.derivedDetail || typeof merged.derivedDetail !== 'object') merged.derivedDetail = empty.derivedDetail;
  if (!Array.isArray(merged.baseAttacks)) merged.baseAttacks = empty.baseAttacks;
  // 派生细则每种加成栏补齐到 5 个「加成1-5」
  ['movement', 'initiative', 'willpower', 'health'].forEach((k) => {
    if (!merged.derivedDetail[k] || typeof merged.derivedDetail[k] !== 'object') merged.derivedDetail[k] = empty.derivedDetail[k];
    while ((merged.derivedDetail[k].bonus || []).length < 5) merged.derivedDetail[k].bonus.push(0);
  });
  if (!merged.derivedDetail.saves || typeof merged.derivedDetail.saves !== 'object') merged.derivedDetail.saves = empty.derivedDetail.saves;
  if (!Array.isArray(merged.derivedDetail.saves.special)) merged.derivedDetail.saves.special = [0, 0, 0];
  if (!Array.isArray(merged.derivedDetail.saves.feat)) merged.derivedDetail.saves.feat = [0, 0, 0];
  // 豁免加成：每个豁免 6 个加成位 → 共 18 位（save i 用 bonus[i*6 .. i*6+5]）；保留原值并补齐
  if (!Array.isArray(merged.derivedDetail.saves.bonus)) merged.derivedDetail.saves.bonus = [];
  while (merged.derivedDetail.saves.bonus.length < 18) merged.derivedDetail.saves.bonus.push(0);
  merged.derivedDetail.saves.bonus = merged.derivedDetail.saves.bonus.slice(0, 18).map((b) => Number(b) || 0);
  // 敏感范围加成：补到 5 个
  if (!merged.derivedDetail.sensitive || typeof merged.derivedDetail.sensitive !== 'object') merged.derivedDetail.sensitive = empty.derivedDetail.sensitive;
  if (!Array.isArray(merged.derivedDetail.sensitive.bonus)) merged.derivedDetail.sensitive.bonus = [];
  while (merged.derivedDetail.sensitive.bonus.length < 5) merged.derivedDetail.sensitive.bonus.push(0);
  merged.derivedDetail.sensitive.bonus = merged.derivedDetail.sensitive.bonus.slice(0, 5).map((b) => Number(b) || 0);
  // 基础攻击加成补到 5 + 其他 + 附加成功加成(3)
  merged.baseAttacks = merged.baseAttacks.map((a) => {
    const clean = a && typeof a === 'object' ? { ...a } : { id: 'x', label: '攻击', attr: 'strength', skill: 'brawl', specialty: 0, bonuses: [0, 0, 0, 0, 0], other: 0, effect: '' };
    while ((clean.bonuses || []).length < 5) clean.bonuses.push(0);
    if (clean.other == null) clean.other = 0;
    if (!Array.isArray(clean.extraSuccessBonus)) clean.extraSuccessBonus = [];
    while (clean.extraSuccessBonus.length < 3) clean.extraSuccessBonus.push(0);
    clean.extraSuccessBonus = clean.extraSuccessBonus.slice(0, 3).map((b) => Number(b) || 0);
    return clean;
  });
  return merged;
}

/** 后端预留接口：将来把这里的实现切换为 fetch 即可。 */
const api = {
  async save(character) {
    // 示例（后端就绪后启用）：
    // const res = await fetch('/api/character', {
    //   method: 'PUT',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(character),
    // });
    // return res.ok;
    return saveToStorage(character);
  },
  async load() {
    // 示例：await fetch('/api/character').then((r) => r.json())
    return loadFromStorage();
  },
};

function saveToStorage(character) {
  try {
    const snapshot = {
      ...character,
      meta: { ...character.meta, updatedAt: new Date().toISOString() },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (error) {
    console.warn('保存到 localStorage 失败：', error);
    return false;
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch (error) {
    console.warn('读取 localStorage 失败：', error);
    return null;
  }
}

export { emptyCharacter, normalize, newSpell, newAttack, newEnergyPool, newPerk, newEquipment, newTrait, newPurchase, newRecord, newReduction, api, STORAGE_KEY };