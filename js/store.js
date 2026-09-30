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
      motherTongue: '',
      appearance: '',
      background: '',
      totalResources: '', // 总资源量
    },
    attributes: attrs,
    skills: skills,
    // —— 可动态增删行的列表（在角色卡内用「表单切换」切换）——
    spells: [], // 法术列表 & 法术预设
    specialAttacks: [], // 特殊攻击预设
    energyPools: [], // 能量池
    // —— 以下为「预留扩展」占位，未来按需填充 ——
    derived: {}, // 未来：生命值 / 意志 / 先攻 / 移动力 / 豁免等
    perks: [], // 未来：专长
    equipment: [], // 未来：装备位 & 特性
    resources: {}, // 未来：资源统计
  };
}

/** 可动态增删行的「新行」默认结构。 */
function newSpell() {
  return { name: '法术', potency: 0, cost: 0, specialty: 0, bonuses: [0, 0, 0, 0, 0, 0], effect: '' };
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
  return { name: '能量池', attr1: 'intelligence', attr2: '', bonus: 0, recovery: '' };
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
  if (!Array.isArray(merged.specialAttacks)) merged.specialAttacks = [];
  if (!Array.isArray(merged.energyPools)) merged.energyPools = [];
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

export { emptyCharacter, normalize, newSpell, newAttack, newEnergyPool, api, STORAGE_KEY };