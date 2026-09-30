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

export { emptyCharacter, normalize, newSpell, newAttack, newEnergyPool, newPerk, newEquipment, newTrait, newPurchase, newRecord, api, STORAGE_KEY };