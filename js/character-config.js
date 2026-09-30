/**
 * character-config.js
 * -----------------------------------------------------------------------------
 * 角色卡「字段定义」单一数据源（single source of truth）。
 *
 * 为什么单独拆出这一个文件：
 *  - 未来迁移到 Vue 时，这套数组几乎可以原样搬进组件的 props / reactive 状态，
 *    只需把「渲染 DOM」的部分替换为模板即可，字段定义无需改动。
 *  - 未来接入后端时，键名 (id) 即作为与后端交互的字段名，可直接 POST/GET。
 *
 * 结构约定：
 *   id     : 稳定的英文标识，未来作为 API 字段名 / Vue key（不要随意改）。
 *   label  : 界面显示的中文名。
 *   group  : 所属大类（生理/心智/互动）。
 *   max    : 建卡时的硬上限（属性为 6，技能为 15），用于输入约束。
 *   default: 默认值（属性 2，技能 0）。
 */

const ATTRIBUTES = [
  // 生理系
  { id: 'strength', label: '力量', group: '生理' },
  { id: 'dexterity', label: '敏捷', group: '生理' },
  { id: 'stamina', label: '耐力', group: '生理' },
  // 心智系
  { id: 'intelligence', label: '智力', group: '心智' },
  { id: 'perception', label: '感知', group: '心智' },
  { id: 'resolve', label: '决心', group: '心智' },
  // 互动系
  { id: 'composure', label: '风度', group: '互动' },
  { id: 'manipulation', label: '操控', group: '互动' },
  { id: 'presence', label: '沉着', group: '互动' },
].map((a) => ({ max: 6, default: 2, ...a }));

const SKILLS = [
  // 生理系
  { id: 'athletics', label: '运动', group: '生理' },
  { id: 'brawl', label: '肉搏', group: '生理' },
  { id: 'firearms', label: '枪械', group: '生理' },
  { id: 'stealth', label: '躲藏', group: '生理' },
  { id: 'survival', label: '求生', group: '生理' },
  { id: 'weaponry', label: '白刃', group: '生理' },
  { id: 'larceny', label: '手上功夫', group: '生理' },
  { id: 'drive', label: '驾驶', group: '生理' },
  // 心智系
  { id: 'academics', label: '学识', group: '心智' },
  { id: 'computer', label: '电脑', group: '心智' },
  { id: 'investigation', label: '调查', group: '心智' },
  { id: 'medicine', label: '医学', group: '心智' },
  { id: 'science', label: '科学', group: '心智' },
  { id: 'occult', label: '神秘学', group: '心智' },
  { id: 'craft', label: '手艺', group: '心智' },
  // 互动系
  { id: 'empathy', label: '感受', group: '互动' },
  { id: 'animalKen', label: '动物交谈', group: '互动' },
  { id: 'expression', label: '表达', group: '互动' },
  { id: 'subterfuge', label: '掩饰', group: '互动' },
  { id: 'intimidation', label: '胁迫', group: '互动' },
  { id: 'socialize', label: '交际', group: '互动' },
].map((s) => ({ max: 15, default: 0, ...s }));

const GROUPS = ['生理', '心智', '互动'];

export { ATTRIBUTES, SKILLS, GROUPS };