/**
 * app.js
 * -----------------------------------------------------------------------------
 * 渲染与交互层（entry）。
 *
 * 当前实现方式：原生 DOM 渲染 + 事件绑定。
 *
 * 未来迁移 Vue / 接后端时你只需要：
 *   1. 保留 character-config.js（字段定义）与 store.js（状态 + 持久化 / api）。
 *   2. 把本文件里「构建行 / 渲染表格 / 绑定事件」的 DOM 逻辑，
 *      改为 Vue 模板 + methods —— 其余代码基本可以原样复用。
 */

import { ATTRIBUTES, SKILLS } from './character-config.js';
import {
  emptyCharacter,
  newSpell,
  newAttack,
  newEnergyPool,
  api,
} from './store.js';

/** 单一状态对象，引用自 store，UI 与它双向同步。 */
let character = emptyCharacter();

/** 应用级导航状态：当前页面（规则书/角色卡/其他）。 */
const appState = { page: 'character' };

/** 角色卡内部「表单（sheet）切换」：当前激活的子面板。 */
const sheetState = { active: 'main' };

/* ---------- 各可切换页面（底部菜单）与角色卡子面板（sheet 标签）的定义 ---------- */

const PAGES = [
  { id: 'character', label: '角色卡' },
  { id: 'rules', label: '规则书' },
  { id: 'other', label: '其他' },
];

const SHEETS = [
  { id: 'main', label: '角色属性' },
  { id: 'spells', label: '法术列表' },
  { id: 'attacks', label: '特殊攻击' },
  { id: 'energy', label: '能量池' },
  { id: 'perks', label: '专长' },
  { id: 'gear', label: '装备' },
  { id: 'resources', label: '资源' },
];

/* ------------------------- DOM 工具函数 ------------------------- */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function numberInput({ value, min = 0, max, onChange }) {
  const input = el('input', {
    type: 'number',
    min,
    ...(max != null ? { max } : {}),
    value,
  });
  input.addEventListener('input', (e) => {
    onChange(Number(e.target.value) || 0, input);
    autoGrow(input);
  });
  return input;
}

function autoGrow(input) {
  const text = String(input.value == null ? '' : input.value);
  input.style.width = Math.max(44, Math.min(text.length + 2, 14) * 8) + 'px';
}

function textInput({ value, placeholder = '', onChange }) {
  const input = el('input', { type: 'text', value, placeholder });
  input.addEventListener('input', (e) => {
    onChange(e.target.value, input);
    autoGrow(input);
  });
  setTimeout(() => autoGrow(input), 0);
  return input;
}

function textarea({ value, placeholder = '', onChange }) {
  const area = el('textarea', { value, placeholder });
  area.addEventListener('input', (e) => onChange(e.target.value, area));
  return area;
}

function select({ value, options, onChange }) {
  const sel = el('select');
  options.forEach((o) => {
    const opt = el('option', { value: o.value, text: o.label });
    if (o.value === value) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => onChange(sel.value, sel));
  return sel;
}

/** 一个小节（<section> + <h2> 标题 + 内容容器）。 */
function section(title, contentNode) {
  const container = el('div', { class: 'card-section' });
  container.appendChild(el('h2', { class: 'section-title', text: title }));
  container.appendChild(contentNode);
  return container;
}

/** 一个操作按钮（用于「添加一行」「保存」等）。 */
function actionButton(text, dataset, extraClass = '') {
  return el('button', {
    class: 'btn ' + extraClass,
    text,
    dataset,
  });
}

/* ------------------------- 派生计算（属性部分） -------------------------
 * 规则来源：基础规则.docx
 *   属性值 = 基础 + 内在 + 修行 + 器械 + 完美(修炼) + 其它
 *   传奇属性 = (属性值 - 1) 整除 5
 */
function attrsOf(attrId) {
  return character.attributes[attrId];
}

function attrValue(attrId) {
  const a = attrsOf(attrId);
  return (a.base || 0) + a.inner + a.practice + a.gear + a.perfect + a.other;
}

function attrLegendary(attrId) {
  return Math.floor((attrValue(attrId) - 1) / 5);
}

/* ------------------------- 属性表格渲染 ------------------------- */

const ATTR_BONUSES = [
  { key: 'inner', label: '内在' },
  { key: 'practice', label: '修行' },
  { key: 'gear', label: '器械' },
  { key: 'perfect', label: '完美' },
  { key: 'other', label: '其它' },
];

function renderAttrRow(attr) {
  const tr = el('tr');
  tr.dataset.attrId = attr.id;
  const a = attrsOf(attr.id);
  const value = attrValue(attr.id);

  tr.appendChild(el('td', { class: 'row-label', text: attr.label }));
  tr.appendChild(el('td', { class: 'value-status', text: value }));
  tr.appendChild(el('td', { class: 'legendary-cell', text: attrLegendary(attr.id) }));

  const baseTd = el('td', { class: 'base-col' });
  baseTd.appendChild(
    numberInput({
      value: a.base,
      min: 0,
      max: attr.max,
      onChange: (v) => {
        a.base = v;
        refreshAttrRow(tr);
        character.meta.dirty = true;
      },
    })
  );
  tr.appendChild(baseTd);

  ATTR_BONUSES.forEach((b) => {
    const td = el('td', { class: 'bonus-col' });
    td.appendChild(
      numberInput({
        value: a[b.key],
        onChange: (v) => {
          a[b.key] = v;
          refreshAttrRow(tr);
        },
      })
    );
    tr.appendChild(td);
  });

  tr.appendChild(el('td', { class: 'calc-col', text: value }));
  return tr;
}

function refreshAttrRow(tr) {
  const id = tr.dataset.attrId;
  tr.children[1].textContent = attrValue(id);
  tr.children[2].textContent = attrLegendary(id);
  tr.children[tr.children.length - 1].textContent = attrValue(id);
}

/* ------------------------- 技能表格渲染 ------------------------- */

function skillValue(skillId) {
  const s = character.skills[skillId];
  return (s.base || 0) + s.inner + s.practice + s.gear + s.perfect + s.morale + s.other;
}

/*
 * 附加成功规则（基础规则.docx）：
 *   技能等级达到 5、7、9、11、13、15 时各 +1，最多 6。
 */
function skillExtraSuccess(skillId) {
  const tiers = [5, 7, 9, 11, 13, 15];
  const v = skillValue(skillId);
  return tiers.filter((t) => v >= t).length;
}

const SKILL_BONUSES = [
  { key: 'inner', label: '内在' },
  { key: 'practice', label: '修行' },
  { key: 'gear', label: '器械' },
  { key: 'perfect', label: '完美' },
];

function renderSkillRow(skill) {
  const tr = el('tr');
  tr.dataset.skillId = skill.id;
  const s = character.skills[skill.id];

  tr.appendChild(el('td', { class: 'row-label', text: skill.label }));
  tr.appendChild(el('td', { class: 'value-status', text: skillValue(skill.id) }));
  tr.appendChild(el('td', { class: 'legendary-cell', text: skillExtraSuccess(skill.id) }));

  const baseTd = el('td', { class: 'base-col' });
  baseTd.appendChild(
    numberInput({
      value: s.base,
      min: 0,
      max: skill.max,
      onChange: (v) => {
        s.base = v;
        refreshSkillRow(tr);
      },
    })
  );
  tr.appendChild(baseTd);

  SKILL_BONUSES.forEach((b) => {
    const td = el('td', { class: 'bonus-col' });
    td.appendChild(
      numberInput({
        value: s[b.key],
        onChange: (v) => {
          s[b.key] = v;
          refreshSkillRow(tr);
        },
      })
    );
    tr.appendChild(td);
  });

  [['morale', '士气'], ['other', '其它']].forEach(([key]) => {
    const td = el('td', { class: 'bonus-col' });
    td.appendChild(
      numberInput({
        value: s[key],
        onChange: (v) => {
          s[key] = v;
          refreshSkillRow(tr);
        },
      })
    );
    tr.appendChild(td);
  });

  return tr;
}

function refreshSkillRow(tr) {
  const id = tr.dataset.skillId;
  tr.children[1].textContent = skillValue(id);
  tr.children[2].textContent = skillExtraSuccess(id);
}

function renderTitleRow(titles) {
  const head = el('tr');
  titles.forEach((t, idx) => {
    head.appendChild(el('th', { text: t, class: idx === 0 ? '' : 'num-head' }));
  });
  return head;
}

function attrTable() {
  const table = el('table', { class: 'stats-table' });
  table.appendChild(
    renderTitleRow([
      '属性', '属性值', '传奇', '基础', '内在', '修行', '器械', '完美', '其它', '检定值',
    ])
  );
  ATTRIBUTES.forEach((a) => table.appendChild(renderAttrRow(a)));
  return table;
}

function skillTable() {
  const table = el('table', { class: 'stats-table' });
  table.appendChild(
    renderTitleRow([
      '技能', '检定值', '附加成功', '建卡', '内在', '修行', '器械', '完美', '士气', '其它',
    ])
  );
  SKILLS.forEach((s) => table.appendChild(renderSkillRow(s)));
  return table;
}

/* ------------------------- 概念段表单 ------------------------- */

function renderConcepts() {
  const c = character.concepts;
  const wrap = el('div', { class: 'concept-grid' });

  const field = (label, input, span = false) => {
    const cell = el('label', { class: 'concept-field' + (span ? ' span-2' : '') });
    cell.appendChild(el('span', { class: 'field-label', text: label }));
    cell.appendChild(input);
    return cell;
  };

  wrap.appendChild(field('姓名', textInput({ value: c.name, placeholder: '角色名称', onChange: (v) => (c.name = v) })));
  wrap.appendChild(field('性别', textInput({ value: c.gender, placeholder: '男 / 女 / …', onChange: (v) => (c.gender = v) })));
  wrap.appendChild(field('种族', textInput({ value: c.race, placeholder: '人形种族', onChange: (v) => (c.race = v) })));
  wrap.appendChild(field('年龄', textInput({ value: c.age, placeholder: '岁', onChange: (v) => (c.age = v) })));
  wrap.appendChild(field('身高体重', textInput({ value: c.build, placeholder: '如 178cm / 70kg', onChange: (v) => (c.build = v) })));
  wrap.appendChild(field('母语', textInput({ value: c.motherTongue, placeholder: '如 中文', onChange: (v) => (c.motherTongue = v) })));
  wrap.appendChild(field('总资源量', textInput({ value: c.totalResources, placeholder: '如 D+1000 / 15 专长点', onChange: (v) => (c.totalResources = v) })));
  wrap.appendChild(field('外貌特征', textarea({ value: c.appearance, placeholder: '外貌、气质等描述', onChange: (v) => (c.appearance = v) }), true));
  wrap.appendChild(field('背景概述', textarea({ value: c.background, placeholder: '大致背景与人设性格简介', onChange: (v) => (c.background = v) }), true));

  return wrap;
}

/* ------------------------- 【角色属性】面板 ------------------------- */

function renderMainSheet() {
  const wrap = el('div', { class: 'sheet-panel' });
  wrap.appendChild(section('概念段', renderConcepts()));
  wrap.appendChild(section('属性段', attrTable()));
  wrap.appendChild(section('技能段', skillTable()));
  wrap.appendChild(renderPlaceholderSection(
    '派生值（预留）',
    '生命值 / 意志力 / 先攻 / 移动力 / 豁免 / 防御',
    '本版本聚焦概念段 + 属性 + 技能。派生内容将在后续迭代加入（字段已在 store 中预留）。'
  ));
  return wrap;
}

/* ------------------------- 【法术列表】面板 ------------------------- */

// 施法基础检定 = 智力检定值 + 神秘学检定值
function spellBaseDP() {
  return attrValue('intelligence') + skillValue('occult');
}

function spellDamageCap(spell) {
  const specBonus = Number(spell.specialty || 0) > 0 ? 1 : 0;
  const bonusSum = (spell.bonuses || []).reduce((s, b) => s + (Number(b) || 0), 0);
  return (
    Number(attrsOf('intelligence').base) +
    Number(character.skills.occult.base) +
    specBonus +
    attrLegendary('intelligence') * 2 +
    bonusSum
  );
}

function spellCheckDP(spell) {
  const bonusSum = (spell.bonuses || []).reduce((s, b) => s + (Number(b) || 0), 0);
  return spellBaseDP() + (Number(spell.potency) || 0) + (Number(spell.specialty) || 0) + bonusSum;
}

function renderSpellTable(container) {
  container.innerHTML = '';
  const addBtnBar = el('div', { class: 'add-bar' });
  addBtnBar.appendChild(el('span', { class: 'add-hint', text: '施法基础检定 = 智力 + 神秘学' }));
  addBtnBar.appendChild(actionButton('＋ 添加一行', { action: 'add-spell' }));
  container.appendChild(addBtnBar);

  const table = el('table', { class: 'dyn-table' });
  table.appendChild(
    renderTitleRow(['名称', '检定DP', '法术威力', '耗能', '专业', '加成1', '加成2', '加成3', '加成4', '加成5', '加成6', '伤害上限', '附加效果', ''])
  );
  table.appendChild(el('tbody', { id: 'spell-body' }));
  container.appendChild(table);

  character.spells.forEach((spell, i) => {
    table.querySelector('tbody').appendChild(renderSpellRow(spell, i));
  });

  // 只有无任何行时给出提示
  if (!character.spells.length) {
    const msg = el('p', { class: 'empty-hint', text: '当前还没有法术，点击「＋ 添加一行」开始。' });
    container.appendChild(msg);
  }
}

function renderSpellRow(spell, index) {
  const tr = el('tr');
  tr.setAttribute('data-index', index);

  // 列顺序须与 renderSpellTable 的表头一致：名称|检定DP|法术威力|耗能|专业|加成1..6|伤害上限|附加效果|删除
  const nameTd = el('td', { class: 'name-col' });
  nameTd.appendChild(textInput({ value: spell.name, onChange: (v) => (spell.name = v) }));
  tr.appendChild(nameTd);

  tr.appendChild(el('td', { class: 'calc-col spell-dp' }));

  const potencyTd = el('td');
  potencyTd.appendChild(numberInput({
    value: spell.potency,
    onChange: (v) => { spell.potency = v; refreshCalc(); },
  }));
  tr.appendChild(potencyTd);

  const costTd = el('td');
  costTd.appendChild(numberInput({ value: spell.cost, onChange: (v) => (spell.cost = v) }));
  tr.appendChild(costTd);

  const specTd = el('td');
  specTd.appendChild(numberInput({
    value: spell.specialty,
    onChange: (v) => { spell.specialty = v; refreshCalc(); },
  }));
  tr.appendChild(specTd);

  for (let k = 0; k < 6; k++) {
    const td = el('td');
    td.appendChild(
      numberInput({
        value: spell.bonuses[k],
        onChange: (v) => { spell.bonuses[k] = v; refreshCalc(); },
      })
    );
    tr.appendChild(td);
  }

  tr.appendChild(el('td', { class: 'calc-col damage-cap' }));

  const effectTd = el('td', { class: 'effect-col' });
  effectTd.appendChild(textarea({ value: spell.effect, placeholder: '附加效果', onChange: (v) => (spell.effect = v) }));
  tr.appendChild(effectTd);

  const delTd = el('td', { class: 'del-col' });
  delTd.appendChild(el('button', { class: 'del-btn', text: '✕', dataset: { action: 'del-row', kind: 'spell', index } }));
  tr.appendChild(delTd);

  function refreshCalc() {
    tr.querySelector('.spell-dp').textContent = spellCheckDP(spell);
    tr.querySelector('.damage-cap').textContent = spellDamageCap(spell);
  }
  refreshCalc();
  return tr;
}

/* ------------------------- 【特殊攻击预设】面板 ------------------------- */

const ATTR_OPTIONS = ATTRIBUTES.map((a) => ({ value: a.id, label: a.label }));
const SKILL_OPTIONS = SKILLS.map((s) => ({ value: s.id, label: s.label }));

function attackCheckDP(attack) {
  const bonusSum = (attack.bonuses || []).reduce((s, b) => s + (Number(b) || 0), 0);
  return (
    attrValue(attack.attr) +
    skillValue(attack.skill) +
    (Number(attack.weaponDamage) || 0) +
    (Number(attack.specialty) || 0) +
    bonusSum +
    skillExtraSuccess(attack.skill)
  );
}

function renderAttackPanel(container) {
  container.innerHTML = '';
  const addBar = el('div', { class: 'add-bar' });
  addBar.appendChild(el('span', { class: 'add-hint', text: '检定DP = 属性值 + 技能值 + 武器伤害 + 专业 + 加成 + 附加成功' }));
  addBar.appendChild(actionButton('＋ 添加一行', { action: 'add-attack' }));
  container.appendChild(addBar);

  const table = el('table', { class: 'dyn-table' });
  table.appendChild(
    renderTitleRow(['名称', '检定DP', '属性', '技能', '武器伤害', '专业', '加成1', '加成2', '加成3', '加成4', '备注', ''])
  );
  const body = el('tbody', { id: 'attack-body' });
  table.appendChild(body);
  container.appendChild(table);

  character.specialAttacks.forEach((atk, i) => body.appendChild(renderAttackRow(atk, i)));
  if (!character.specialAttacks.length) {
    container.appendChild(el('p', { class: 'empty-hint', text: '当前没有特殊攻击预设，点击「＋ 添加一行」开始。' }));
  }
}

function renderAttackRow(atk, index) {
  const tr = el('tr');
  tr.setAttribute('data-index', index);

  const nameTd = el('td', { class: 'name-col' });
  nameTd.appendChild(textInput({ value: atk.name, placeholder: '攻击名', onChange: (v) => (atk.name = v) }));
  tr.appendChild(nameTd);
  tr.appendChild(el('td', { class: 'calc-col atk-dp' }));

  const attrTd = el('td');
  const attrSel = select({
    value: atk.attr,
    options: ATTR_OPTIONS,
    onChange: (v) => { atk.attr = v; refresh(); },
  });
  attrTd.appendChild(attrSel);
  tr.appendChild(attrTd);

  const skillTd = el('td');
  skillTd.appendChild(select({
    value: atk.skill, options: SKILL_OPTIONS,
    onChange: (v) => { atk.skill = v; refresh(); },
  }));
  tr.appendChild(skillTd);

  const dmgTd = el('td');
  dmgTd.appendChild(numberInput({ value: atk.weaponDamage, onChange: (v) => { atk.weaponDamage = v; refresh(); } }));
  tr.appendChild(dmgTd);

  const specTd = el('td');
  specTd.appendChild(numberInput({ value: atk.specialty, onChange: (v) => { atk.specialty = v; refresh(); } }));
  tr.appendChild(specTd);

  for (let k = 0; k < 4; k++) {
    const td = el('td');
    td.appendChild(numberInput({ value: atk.bonuses[k], onChange: (v) => { atk.bonuses[k] = v; refresh(); } }));
    tr.appendChild(td);
  }

  const noteTd = el('td', { class: 'effect-col' });
  noteTd.appendChild(textInput({ value: atk.note, placeholder: '备注', onChange: (v) => (atk.note = v) }));
  tr.appendChild(noteTd);

  const delTd = el('td', { class: 'del-col' });
  delTd.appendChild(el('button', { class: 'del-btn', text: '✕', dataset: { action: 'del-row', kind: 'attack', index } }));
  tr.appendChild(delTd);

  function refresh() { tr.querySelector('.atk-dp').textContent = attackCheckDP(atk); }
  refresh();
  return tr;
}

/* ------------------------- 【能量池】面板 ------------------------- */

function energyTotal(pool) {
  let total = attrValue(pool.attr1) + (Number(pool.bonus) || 0);
  if (pool.attr2) total += attrValue(pool.attr2);
  return total;
}

function renderEnergyPanel(container) {
  container.innerHTML = '';
  const addBar = el('div', { class: 'add-bar' });
  addBar.appendChild(el('span', { class: 'add-hint', text: '总值 = 关键属性1 + 关键属性2(可选) + 加成' }));
  addBar.appendChild(actionButton('＋ 添加一行', { action: 'add-energy' }));
  container.appendChild(addBar);

  const table = el('table', { class: 'dyn-table' });
  table.appendChild(renderTitleRow(['名称', '总值', '关键属性1', '关键属性2', '加成1', '回复方式', '']));
  const body = el('tbody', { id: 'energy-body' });
  table.appendChild(body);
  container.appendChild(table);

  const emptyOpts = [{ value: '', label: '（无）' }, ...ATTR_OPTIONS];
  character.energyPools.forEach((pool, i) => body.appendChild(renderEnergyRow(pool, i, emptyOpts)));
  if (!character.energyPools.length) {
    container.appendChild(el('p', { class: 'empty-hint', text: '当前没有能量池，点击「＋ 添加一行」开始。' }));
  }
}

function renderEnergyRow(pool, index, emptyOpts) {
  const tr = el('tr');
  tr.setAttribute('data-index', index);

  const nameTd = el('td', { class: 'name-col' });
  nameTd.appendChild(textInput({ value: pool.name, onChange: (v) => (pool.name = v) }));
  tr.appendChild(nameTd);
  tr.appendChild(el('td', { class: 'calc-col energy-total' }));

  const attr1Td = el('td');
  attr1Td.appendChild(select({ value: pool.attr1, options: ATTR_OPTIONS, onChange: (v) => { pool.attr1 = v; refresh(); } }));
  tr.appendChild(attr1Td);

  const attr2Td = el('td');
  attr2Td.appendChild(select({ value: pool.attr2 || '', options: emptyOpts, onChange: (v) => { pool.attr2 = v; refresh(); } }));
  tr.appendChild(attr2Td);

  const bonusTd = el('td');
  bonusTd.appendChild(numberInput({ value: pool.bonus, onChange: (v) => { pool.bonus = v; refresh(); } }));
  tr.appendChild(bonusTd);

  const recTd = el('td', { class: 'effect-col' });
  recTd.appendChild(textInput({ value: pool.recovery, placeholder: '如 每小时回复 X', onChange: (v) => (pool.recovery = v) }));
  tr.appendChild(recTd);

  const delTd = el('td', { class: 'del-col' });
  delTd.appendChild(el('button', { class: 'del-btn', text: '✕', dataset: { action: 'del-row', kind: 'energy', index } }));
  tr.appendChild(delTd);

  function refresh() { tr.querySelector('.energy-total').textContent = energyTotal(pool); }
  refresh();
  return tr;
}

/* ------------------------- 预留面板 ------------------------- */

function renderPlaceholderSection(title, heading, note) {
  return section(title, renderPlaceholder(heading, note));
}
function renderPlaceholder(title, note) {
  const box = el('div', { class: 'placeholder-block' });
  box.appendChild(el('h3', { class: 'placeholder-title', text: title }));
  box.appendChild(el('p', { class: 'placeholder-note', text: note }));
  return box;
}

function renderPerkPanel(container) {
  container.innerHTML = '';
  container.appendChild(renderPlaceholder('专长', '建卡专长（15 点专长点）等模块预留，后续按 Rules 补齐。'));
}
function renderGearPanel(container) {
  container.innerHTML = '';
  container.appendChild(renderPlaceholder('装备位 & 特性', '装备位与特性列表预留，后续补齐。'));
}
function renderResourcePanel(container) {
  container.innerHTML = '';
  container.appendChild(renderPlaceholder('资源统计', '资源消耗统计与未使用资源预留，后续补齐。'));
}

/* ------------------------- 角色卡内部 sheet 切换 ------------------------- */

function renderSheetTabs() {
  const tabbar = el('nav', { class: 'sheet-tabs' });
  SHEETS.forEach((s) => {
    const tab = el('button', {
      type: 'button',
      class: 'sheet-tab' + (s.id === sheetState.active ? ' active' : ''),
      text: s.label,
      dataset: { action: 'set-sheet', sheet: s.id },
    });
    tabbar.appendChild(tab);
  });
  return tabbar;
}

function renderSheetBody(host) {
  host.innerHTML = '';
  const active = sheetState.active;

  if (active === 'main') host.appendChild(renderMainSheet());
  else if (active === 'spells') renderSpellTable(host);
  else if (active === 'attacks') renderAttackPanel(host);
  else if (active === 'energy') renderEnergyPanel(host);
  else if (active === 'perks') renderPerkPanel(host);
  else if (active === 'gear') renderGearPanel(host);
  else if (active === 'resources') renderResourcePanel(host);
}

/** 渲染「角色卡」页面（sheet 标签 + 内容区）。 */
function renderCharacterPage() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  app.appendChild(
    el('header', { class: 'masthead' }, [
      el('h1', { text: '无限流角色卡' }),
      el('p', {
        class: 'subtitle',
        text: '参考《Rules/快速创建角色卡.docx》与《无限半自动卡》整理 · 顶部标签切换不同表单',
      }),
    ])
  );

  app.appendChild(renderSheetTabs());
  const host = el('div', { class: 'sheet-body' });
  app.appendChild(host);

  renderSheetBody(host);

  // 操作条（保存 / 重置）
  const actions = el('div', { class: 'action-bar' });
  actions.appendChild(actionButton('保存到本地', { action: 'save' }));
  actions.appendChild(actionButton('重置角色卡', { action: 'reset' }, 'btn-ghost'));
  app.appendChild(actions);
}

/* ------------------------- 其它页面（规则书 / 其他） ------------------------- */

function renderEmptyPage(title, note) {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.appendChild(
    el('div', { class: 'blank-page' }, [
      el('h2', { text: title }),
      el('p', { class: 'muted', text: note }),
    ])
  );
}

function renderRulesPage() {
  renderEmptyPage('规则书', '该页面暂时留空。后续可在此展示基础规则 / 战斗规则 / 其它规则等内容。');
}

function renderOtherPage() {
  renderEmptyPage('其他', '预留扩展空间。后续可按需加入自定义模块。');
}

/* ------------------------- 应用级页面路由 ------------------------- */

function renderPage() {
  // 高亮左侧菜单
  document.querySelectorAll('.menu-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === appState.page);
  });

  if (appState.page === 'character') renderCharacterPage();
  else if (appState.page === 'rules') renderRulesPage();
  else if (appState.page === 'other') renderOtherPage();
}

/* ------------------------- 侧边栏折叠 / 交互 ------------------------- */

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

/* ------------------------- 动态行：通用增删 ------------------------- */

function addSpellRow() {
  character.spells.push(newSpell());
  renderPage();
}
function addAttackRow() {
  character.specialAttacks.push(newAttack());
  renderPage();
}
function addEnergyRow() {
  character.energyPools.push(newEnergyPool());
  renderPage();
}

function deleteRow(kind, index) {
  if (kind === 'spell') character.spells.splice(index, 1);
  else if (kind === 'attack') character.specialAttacks.splice(index, 1);
  else if (kind === 'energy') character.energyPools.splice(index, 1);
  renderPage();
}

/* ------------------------- 全局事件绑定（事件委托） ------------------------- */

function setupGlobalEvent() {
  document.addEventListener('click', (e) => {
    const sidebar = document.querySelector('[data-action="toggle-sidebar"]');
    if (e.target.closest('[data-action="toggle-sidebar"]')) {
      toggleSidebar();
      return;
    }

    const menuBtn = e.target.closest('.menu-item[data-page]');
    if (menuBtn) {
      appState.page = menuBtn.dataset.page;
      renderPage();
      return;
    }

    const tab = e.target.closest('[data-action="set-sheet"]');
    if (tab) {
      sheetState.active = tab.dataset.sheet;
      renderPage();
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const act = btn.dataset.action;
    if (act === 'save') {
      const ok = api.save(character);
      flash(ok ? '✔ 已保存到本地' : '✘ 保存失败');
    } else if (act === 'reset') {
      if (!window.confirm('确定重置整张角色卡？此操作不可撤销。')) return;
      character = emptyCharacter();
      renderPage();
      flash('已重置');
    } else if (act === 'add-spell') addSpellRow();
    else if (act === 'add-attack') addAttackRow();
    else if (act === 'add-energy') addEnergyRow();
    else if (act === 'del-row') deleteRow(btn.dataset.kind, Number(btn.dataset.index));
  });
}

let flashTimer = null;
function flash(msg) {
  let tip = document.getElementById('flash');
  if (!tip) {
    tip = el('div', { id: 'flash', class: 'flash' });
    document.body.appendChild(tip);
  }
  tip.textContent = msg;
  tip.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => tip.classList.remove('show'), 1600);
}

/* ------------------------- 启动 ------------------------- */

async function boot() {
  const saved = await api.load();
  if (saved) character = saved;

  renderPage();
  setupGlobalEvent();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}