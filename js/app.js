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
  newPerk,
  newEquipment,
  newTrait,
  newPurchase,
  newRecord,
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
  { id: 'traits', label: '特性' },
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

  const field = (label, input, cls = '') => {
    const cell = el('label', { class: 'concept-field' + (cls ? ' ' + cls : '') });
    cell.appendChild(el('span', { class: 'field-label', text: label }));
    cell.appendChild(input);
    return cell;
  };

  // 参考 Excel「角色主体信息」：三短字段一行，外貌与背景横跨整行
  wrap.appendChild(field('姓名', textInput({ value: c.name, placeholder: '角色名称', onChange: (v) => (c.name = v) })));
  wrap.appendChild(field('性别', textInput({ value: c.gender, placeholder: '男 / 女 / …', onChange: (v) => (c.gender = v) })));
  wrap.appendChild(field('种族', textInput({ value: c.race, placeholder: '人形种族', onChange: (v) => (c.race = v) })));
  wrap.appendChild(field('总资源量', textInput({ value: c.totalResources, placeholder: '如 D+1000 / 15 专长点', onChange: (v) => (c.totalResources = v) })));
  wrap.appendChild(field('年龄', textInput({ value: c.age, placeholder: '岁', onChange: (v) => (c.age = v) })));
  wrap.appendChild(field('身高体重', textInput({ value: c.build, placeholder: '如 178cm / 70kg', onChange: (v) => (c.build = v) })));
  wrap.appendChild(field('外貌特征', textarea({ value: c.appearance, placeholder: '外貌、气质等描述', onChange: (v) => (c.appearance = v) }), 'span-3'));
  wrap.appendChild(field('背景概述', textarea({ value: c.background, placeholder: '大致背景与人设性格简介', onChange: (v) => (c.background = v) }), 'span-3'));

  return wrap;
}

/* ------------------------- 【角色属性】面板 ------------------------- */

function renderMainSheet() {
  const wrap = el('div', { class: 'sheet-panel' });
  wrap.appendChild(section('概念段', renderConcepts()));
  wrap.appendChild(section('属性段', attrTable()));
  wrap.appendChild(section('技能段', skillTable()));
  wrap.appendChild(section('派生值', renderDerivedPanel()));
  return wrap;
}

/* ------------------------- 派生值面板 -------------------------
 * 规则来源：基础规则.docx
 *   生命值 = 5(基础) + 耐力检定值 + 传奇耐力增值 ⌊N(N+1)/2⌋
 *   意志力 = 决心检定值 + 沉着检定值 + 传奇决心×3
 *   先攻值 = 敏捷检定值 + 沉着检定值 + 传奇沉着×3
 *   移动力 = 5(基础) + 力量检定值 + 敏捷检定值 + 传奇敏捷×3
 *   豁免 DP = 对应属性检定值 + 对应技能检定值 + 传奇对应属性×3
 *      反射豁免：敏捷 + 运动；意志豁免：决心 + 感受；强韧豁免：耐力 + 求生
 */

function derivedValues() {
  const leg = (id) => attrLegendary(id);
  const tri = (id) => leg(id) * 3;
  const shape = (id) => Math.floor((leg(id) * (leg(id) + 1)) / 2); // N(N+1)/2
  return {
    health: 5 + attrValue('stamina') + shape('stamina'),
    willpower: attrValue('resolve') + attrValue('presence') + tri('resolve'),
    initiative: attrValue('dexterity') + attrValue('presence') + tri('presence'),
    movement: 5 + attrValue('strength') + attrValue('dexterity') + tri('dexterity'),
    reflex: attrValue('dexterity') + skillValue('athletics') + tri('dexterity'),
    willSave: attrValue('resolve') + skillValue('empathy') + tri('resolve'),
    fortitude: attrValue('stamina') + skillValue('survival') + tri('stamina'),
  };
}

function renderDerivedPanel() {
  const d = derivedValues();
  const grid = el('div', { class: 'derived-grid' });
  const cell = (label, value, hint = '') => {
    const c = el('div', { class: 'derived-cell' });
    c.appendChild(el('span', { class: 'derived-label', text: label }));
    c.appendChild(el('span', { class: 'derived-value', text: value }));
    if (hint) c.appendChild(el('span', { class: 'derived-hint', text: hint }));
    return c;
  };

  grid.appendChild(cell('生命值', d.health, '5 + 耐力 + 传奇耐力增值 ⌊N(N+1)/2⌋'));
  grid.appendChild(cell('意志力', d.willpower, '决心 + 沉着 + 传奇决心×3'));
  grid.appendChild(cell('先攻值', d.initiative, '敏捷 + 沉着 + 传奇沉着×3'));
  grid.appendChild(cell('移动力', d.movement, '5 + 力量 + 敏捷 + 传奇敏捷×3'));

  const wrap = el('div', { class: 'derived-panel' });
  wrap.appendChild(grid);
  wrap.appendChild(el('h4', { class: 'derived-subhead', text: '豁免检定 DP（传奇对应属性×3）' }));
  const saveGrid = el('div', { class: 'derived-grid' });
  saveGrid.appendChild(cell('反射豁免', d.reflex, '敏捷 + 运动'));
  saveGrid.appendChild(cell('意志豁免', d.willSave, '决心 + 感受'));
  saveGrid.appendChild(cell('强韧豁免', d.fortitude, '耐力 + 求生'));
  wrap.appendChild(saveGrid);
  return wrap;
}

/* ------------------------- 【法术列表】面板 ------------------------- */

// 施法基础检定 = 智力检定值 + 神秘学检定值 + 加成栏总和
function spellBaseDP() {
  const bonusSum = (character.spellBaseBonuses || []).reduce((s, b) => s + (Number(b) || 0), 0);
  return attrValue('intelligence') + skillValue('occult') + bonusSum;
}

function spellDamageCap(spell) {
  const specBonus = Number(spell.specialty || 0) > 0 ? 1 : 0;
  const dmgBonusSum = (spell.dmgBonuses || []).reduce((s, b) => s + (Number(b) || 0), 0);
  return (
    Number(attrsOf('intelligence').base) +
    Number(character.skills.occult.base) +
    specBonus +
    attrLegendary('intelligence') * 2 +
    dmgBonusSum
  );
}

function spellCheckDP(spell) {
  const bonusSum = (spell.bonuses || []).reduce((s, b) => s + (Number(b) || 0), 0);
  return spellBaseDP() + (Number(spell.potency) || 0) + (Number(spell.specialty) || 0) + bonusSum;
}

/** 施法基础检定栏（参照 Excel「法术列表&法术预设」A1-L4：
 *  总计 | 智力 | 神秘学 | 加成1..6，默认置顶，样式与下方法术行统一，无备注栏。） */
function renderSpellBaseBox() {
  const base = el('div', { class: 'spell-base-card' });
  base.appendChild(el('div', { class: 'spell-base-card-title', text: '施法基础检定' }));

  const table = el('table', { class: 'dyn-table spell-base-table' });
  // 表头行
  const head = el('tr');
  head.appendChild(el('th', { text: '总计' }));
  head.appendChild(el('th', { text: '智力' }));
  head.appendChild(el('th', { text: '神秘学' }));
  for (let k = 1; k <= 6; k++) head.appendChild(el('th', { text: '加成' + k }));
  table.appendChild(head);

  // 数值行
  const row = el('tr');
  row.appendChild(el('td', { class: 'calc-col total-cell' }));
  const readOnlyCell = (value) => {
    const td = el('td');
    const input = numberInput({ value, onChange: () => {} });
    input.disabled = true;
    td.appendChild(input);
    return td;
  };
  row.appendChild(readOnlyCell(attrValue('intelligence'))); // 智力检定值
  row.appendChild(readOnlyCell(skillValue('occult'))); // 神秘学检定值
  (character.spellBaseBonuses || []).forEach((b, k) => {
    const td = el('td');
    td.appendChild(numberInput({
      value: b,
      onChange: (v) => {
        character.spellBaseBonuses[k] = v;
        refreshBase();
        refreshAllSpellCells();
      },
    }));
    row.appendChild(td);
  });
  table.appendChild(row);
  base.appendChild(table);

  function refreshBase() {
    const total = row.querySelector('.total-cell');
    if (total) total.textContent = spellBaseDP();
  }
  refreshBase();
  return base;
}

/** 刷新所有法术行的「基础值」与计算列（基础检定变时调用）。 */
function refreshAllSpellCells() {
  document.querySelectorAll('.dyn-table tbody tr').forEach((tr) => {
    const baseCell = tr.querySelector('.base-value-cell');
    if (baseCell) baseCell.textContent = spellBaseDP();
    const dp = tr.querySelector('.spell-dp');
    if (dp) dp.textContent = spellCheckDPFromIndex(tr.dataset.index);
  });
}

// 由行索引读取（用于基础检定变化后整体刷新）
function spellByIndex(index) {
  return character.spells[Number(index)];
}
function spellCheckDPFromIndex(index) {
  const spell = spellByIndex(index);
  if (!spell) return '';
  return spellCheckDP(spell);
}

function renderSpellTable(container) {
  container.innerHTML = '';
  container.appendChild(renderSpellBaseBox());

  const addBtnBar = el('div', { class: 'add-bar' });
  addBtnBar.appendChild(el('span', { class: 'add-hint', text: '检定 DP = 基础值 + 法术威力 + 专业 + 加成 ｜ 伤害上限 = 智力 + 神秘学 + 专业 + 传奇智力×2 + 伤害加成' }));
  addBtnBar.appendChild(actionButton('＋ 添加一行', { action: 'add-spell' }));
  container.appendChild(addBtnBar);

  const table = el('table', { class: 'dyn-table dyn-table-wide' });
  table.appendChild(
    renderTitleRow(
      ['名称', '检定DP', '基础值', '法术威力', '耗能', '专业',
        '加成1', '加成2', '加成3', '加成4', '加成5', '加成6',
        '伤害上限', '伤害加成1', '伤害加成2', '伤害加成3',
        '附加效果', '']
    )
  );
  table.appendChild(el('tbody', { id: 'spell-body' }));
  container.appendChild(table);

  character.spells.forEach((spell, i) => {
    table.querySelector('tbody').appendChild(renderSpellRow(spell, i));
  });

  if (!character.spells.length) {
    container.appendChild(el('p', { class: 'empty-hint', text: '当前还没有法术，点击「＋ 添加一行」开始。' }));
  }
}

function renderSpellRow(spell, index) {
  const tr = el('tr');
  tr.setAttribute('data-index', index);

  // 列顺序与表头一致：
  // 名称|检定DP|基础值|法术威力|耗能|专业|加成1..6|伤害上限|伤害加成1..3|附加效果|删除
  function numCell(value, onChange) {
    const td = el('td');
    td.appendChild(numberInput({ value, onChange }));
    return td;
  }

  const nameTd = el('td', { class: 'name-col' });
  nameTd.appendChild(textInput({ value: spell.name, onChange: (v) => (spell.name = v) }));
  tr.appendChild(nameTd);

  tr.appendChild(el('td', { class: 'calc-col spell-dp' }));
  // 基础值（只读，自动取施法基础检定）
  tr.appendChild(el('td', { class: 'base-value-cell', text: spellBaseDP() }));

  tr.appendChild(numCell(spell.potency, (v) => { spell.potency = v; refreshCalc(); }));
  tr.appendChild(numCell(spell.cost, (v) => (spell.cost = v)));
  tr.appendChild(numCell(spell.specialty, (v) => { spell.specialty = v; refreshCalc(); }));

  for (let k = 0; k < 6; k++) {
    tr.appendChild(numCell(spell.bonuses[k], (v) => { spell.bonuses[k] = v; refreshCalc(); }));
  }

  tr.appendChild(el('td', { class: 'calc-col damage-cap' }));
  for (let k = 0; k < 3; k++) {
    tr.appendChild(numCell(spell.dmgBonuses[k], (v) => { spell.dmgBonuses[k] = v; refreshCalc(); }));
  }

  const effectTd = el('td', { class: 'effect-col' });
  effectTd.appendChild(textarea({ value: spell.effect, placeholder: '附加效果', onChange: (v) => (spell.effect = v) }));
  tr.appendChild(effectTd);

  const delTd = el('td', { class: 'del-col' });
  delTd.appendChild(el('button', { class: 'del-btn', text: '✕', dataset: { action: 'del-row', kind: 'spell', index } }));
  tr.appendChild(delTd);

  function refreshCalc() {
    tr.querySelector('.spell-dp').textContent = spellCheckDP(spell);
    tr.querySelector('.damage-cap').textContent = spellDamageCap(spell);
    const baseCell = tr.querySelector('.base-value-cell');
    if (baseCell) baseCell.textContent = spellBaseDP();
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

  const table = el('table', { class: 'dyn-table tbl-atk' });
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
  noteTd.appendChild(textarea({ value: atk.note, placeholder: '备注（比如此技能替代了某属性/技能）', onChange: (v) => (atk.note = v) }));
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
  const bonusSum = (pool.bonuses || []).reduce((s, b) => s + (Number(b) || 0), 0);
  let total = attrValue(pool.attr1) + bonusSum;
  if (pool.attr2) total += attrValue(pool.attr2);
  return total;
}

function renderEnergyPanel(container) {
  container.innerHTML = '';
  const addBar = el('div', { class: 'add-bar' });
  addBar.appendChild(el('span', { class: 'add-hint', text: '总值 = 关键属性1 + 关键属性2(可选) + 加成1 + 加成2 + 加成3' }));
  addBar.appendChild(actionButton('＋ 添加一行', { action: 'add-energy' }));
  container.appendChild(addBar);

  const table = el('table', { class: 'dyn-table tbl-ene' });
  table.appendChild(renderTitleRow(['名称', '总值', '关键属性1', '关键属性2', '加成1', '加成2', '加成3', '回复方式', '']));
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

  for (let k = 0; k < 3; k++) {
    const td = el('td');
    td.appendChild(numberInput({ value: pool.bonuses[k], onChange: (v) => { pool.bonuses[k] = v; refresh(); } }));
    tr.appendChild(td);
  }

  const recTd = el('td', { class: 'effect-col' });
  recTd.appendChild(textarea({ value: pool.recovery, placeholder: '回复方式与规则，如：每短休回复 2 点等', onChange: (v) => (pool.recovery = v) }));
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

/* ===== 专长列表（参考 Excel「专长列表」sheet）===== */

function perkAllocation() {
  let used = 0;
  character.perks.forEach((p) => {
    const t = Number(p.tier) || 0;
    for (let i = 1; i <= t; i++) used += i; // 各等级从 1 累加到 tier
  });
  return used;
}

function renderPerkPanel(container) {
  container.innerHTML = '';

  // 建卡专长点核算（可折叠/展开）
  const sumBox = el('div', { class: 'spell-base-box' });
  const sumHead = el('div', { class: 'collapse-head' });
  sumHead.appendChild(el('h3', { class: 'spell-base-title', text: '建卡专长核算' }));
  sumHead.appendChild(el('button', {
    type: 'button',
    class: 'collapse-btn',
    text: '▲',
    title: '折叠 / 展开',
    dataset: { action: 'toggle-perk-box' },
  }));
  sumBox.appendChild(sumHead);

  const sumBody = el('div', { class: 'collapse-body' });
  const row = el('div', { class: 'spell-base-row' });
  row.appendChild(el('span', { class: 'spell-base-item', text: '已用专长点' }));
  row.appendChild(el('span', { class: 'spell-base-op', text: '=' }));
  row.appendChild(el('span', { class: 'spell-base-total perk-used', text: perkAllocation() }));
  row.appendChild(el('span', { class: 'spell-base-item', text: '/ 15' }));
  sumBody.appendChild(row);
  sumBody.appendChild(el('p', { class: 'spell-base-note', text: '分档专长按等级从 1 累加到目标等级计点（如到 3 级 = 1+2+3=6 点）。' }));
  sumBox.appendChild(sumBody);
  container.appendChild(sumBox);

  const addBar = el('div', { class: 'add-bar' });
  addBar.appendChild(el('span', { class: 'add-hint', text: '请将同一专长的不同等级分开填写' }));
  addBar.appendChild(actionButton('＋ 添加一行', { action: 'add-perk' }));
  container.appendChild(addBar);

  const table = el('table', { class: 'dyn-table tbl-perk' });
  table.appendChild(renderTitleRow(['专长等级', '专长名称', '专长信息', '']));
  const body = el('tbody', { id: 'perk-body' });
  table.appendChild(body);
  container.appendChild(table);

  character.perks.forEach((p, i) => body.appendChild(renderPerkRow(p, i)));
  if (!character.perks.length) {
    container.appendChild(el('p', { class: 'empty-hint', text: '当前没有专长，点击「＋ 添加一行」开始。' }));
  }
}

function renderPerkRow(perk, index) {
  const tr = el('tr');
  const tierTd = el('td', { class: 'tier-col' });
  tierTd.appendChild(numberInput({ value: perk.tier, min: 1, onChange: (v) => { perk.tier = v; refreshPool(); } }));
  tr.appendChild(tierTd);

  const nameTd = el('td', { class: 'name-col' });
  nameTd.appendChild(textInput({ value: perk.name, placeholder: '专长名', onChange: (v) => (perk.name = v) }));
  tr.appendChild(nameTd);

  const infoTd = el('td', { class: 'effect-col' });
  infoTd.appendChild(textarea({ value: perk.info, placeholder: '专长信息（效果 / 前置等）', onChange: (v) => (perk.info = v) }));
  tr.appendChild(infoTd);

  const delTd = el('td', { class: 'del-col' });
  delTd.appendChild(el('button', { class: 'del-btn', text: '✕', dataset: { action: 'del-row', kind: 'perk', index } }));
  tr.appendChild(delTd);

  function refreshPool() {
    const eln = document.querySelector('.perk-used');
    if (eln) eln.textContent = perkAllocation();
  }
  return tr;
}

/** 折叠 / 展开建卡专长核算框。 */
function togglePerkBox(btn) {
  const box = btn.closest('.spell-base-box');
  const body = box ? box.querySelector('.collapse-body') : null;
  if (!body) return;
  const hidden = body.classList.toggle('hidden');
  btn.textContent = hidden ? '▼' : '▲';
  btn.title = hidden ? '展开' : '折叠';
}

/* ===== 装备位 & 特性列表（参考 Excel「装备位&特性列表」sheet）===== */

const EQUIP_SLOTS = ['头部', '躯干', '左臂', '右臂', '左手', '右手', '下身', '足部', '背包', '其它'];

function renderGearPanel(container) {
  container.innerHTML = '';
  const addBar = el('div', { class: 'add-bar' });
  addBar.appendChild(el('span', { class: 'add-hint', text: '装备位与装备名称/效果；特性请到「特性」标签页填写（来源 / 描述）' }));
  addBar.appendChild(actionButton('＋ 添加装备', { action: 'add-equip' }));
  container.appendChild(addBar);

  const table = el('table', { class: 'dyn-table tbl-gear' });
  table.appendChild(renderTitleRow(['装备位', '装备名称', '装备效果', '']));
  const body = el('tbody', { id: 'equip-body' });
  table.appendChild(body);
  container.appendChild(table);

  character.equipment.forEach((eq, i) => body.appendChild(renderEquipmentRow(eq, i)));
  if (!character.equipment.length) {
    container.appendChild(el('p', { class: 'empty-hint', text: '当前没有装备，点击「＋ 添加装备」开始。' }));
  }
}

function renderEquipmentRow(eq, index) {
  const tr = el('tr');
  const slotTd = el('td', { class: 'slot-col' });
  slotTd.appendChild(select({ value: eq.slot, options: EQUIP_SLOTS.map((s) => ({ value: s, label: s })), onChange: (v) => (eq.slot = v) }));
  tr.appendChild(slotTd);

  const enameTd = el('td', { class: 'name-col' });
  enameTd.appendChild(textInput({ value: eq.name, placeholder: '装备名', onChange: (v) => (eq.name = v) }));
  tr.appendChild(enameTd);

  const eeffTd = el('td', { class: 'effect-col' });
  eeffTd.appendChild(textarea({ value: eq.effect, placeholder: '装备效果', onChange: (v) => (eq.effect = v) }));
  tr.appendChild(eeffTd);

  const delTd = el('td', { class: 'del-col' });
  delTd.appendChild(el('button', { class: 'del-btn', text: '✕', dataset: { action: 'del-row', kind: 'equip', index } }));
  tr.appendChild(delTd);
  return tr;
}

/* ===== 特性列表（来源 / 描述，点击添加新行）===== */

function renderTraitPanel(container) {
  container.innerHTML = '';
  const addBar = el('div', { class: 'add-bar' });
  addBar.appendChild(el('span', { class: 'add-hint', text: '特性可来自血统、改造、修炼体系、称号等一系列资源' }));
  addBar.appendChild(actionButton('＋ 添加特性', { action: 'add-trait' }));
  container.appendChild(addBar);

  const table = el('table', { class: 'dyn-table tbl-trait' });
  table.appendChild(renderTitleRow(['特性名称', '特性描述', '']));
  const body = el('tbody', { id: 'trait-body' });
  table.appendChild(body);
  container.appendChild(table);

  character.traits.forEach((t, i) => body.appendChild(renderTraitRow(t, i)));
  if (!character.traits.length) {
    container.appendChild(el('p', { class: 'empty-hint', text: '当前没有特性，点击「＋ 添加特性」开始。' }));
  }
}

function renderTraitRow(trait, index) {
  const tr = el('tr');
  const srcTd = el('td', { class: 'name-col' });
  srcTd.appendChild(textInput({ value: trait.source, placeholder: '名称+来源', onChange: (v) => (trait.source = v) }));
  tr.appendChild(srcTd);

  const descTd = el('td', { class: 'effect-col' });
  descTd.appendChild(textarea({ value: trait.desc, placeholder: '特性描述', onChange: (v) => (trait.desc = v) }));
  tr.appendChild(descTd);

  const delTd = el('td', { class: 'del-col' });
  delTd.appendChild(el('button', { class: 'del-btn', text: '✕', dataset: { action: 'del-row', kind: 'trait', index } }));
  tr.appendChild(delTd);
  return tr;
}

/* ===== 资源统计（参考 Excel「资源统计」sheet）===== */

function renderResourcePanel(container) {
  container.innerHTML = '';

  // 未使用资源
  const leftover = character.resources.leftover || { d: '', score: '', xp: '' };
  const sumBox = el('div', { class: 'spell-base-box' });
  sumBox.appendChild(el('h3', { class: 'spell-base-title', text: '未使用资源' }));
  const row = el('div', { class: 'resource-leftover' });
  const lf = (label, key) => {
    const cell = el('label', { class: 'leftover-field' });
    cell.appendChild(el('span', { class: 'field-label', text: label }));
    cell.appendChild(numberInputTxt('', (v) => (leftover[key] = v)));
    return cell;
  };
  // 用文本输入便于填 D+1000 等
  row.appendChild(lf('支线', 'd'));
  row.appendChild(lf('分数', 'score'));
  row.appendChild(lf('xp', 'xp'));
  sumBox.appendChild(row);
  container.appendChild(sumBox);

  // 资源消耗统计
  container.appendChild(el('h3', { class: 'sub-title', text: '资源消耗统计' }));
  const addBar1 = el('div', { class: 'add-bar add-bar-right' });
  addBar1.appendChild(actionButton('＋ 添加一行', { action: 'add-purchase' }));
  container.appendChild(addBar1);
  const t1 = el('table', { class: 'dyn-table tbl-buy' });
  t1.appendChild(renderTitleRow(['价格', '购买内容', '']));
  const b1 = el('tbody', { id: 'purchase-body' });
  t1.appendChild(b1);
  container.appendChild(t1);
  character.resources.purchases.forEach((p, i) => b1.appendChild(renderPurchaseRow(p, i)));
  if (!character.resources.purchases.length) {
    container.appendChild(el('p', { class: 'empty-hint', text: '暂无购买记录。' }));
  }

  // 资源获取记录
  container.appendChild(el('h3', { class: 'sub-title', text: '资源获取记录' }));
  const addBar2 = el('div', { class: 'add-bar add-bar-right' });
  addBar2.appendChild(actionButton('＋ 添加一行', { action: 'add-record' }));
  container.appendChild(addBar2);
  const t2 = el('table', { class: 'dyn-table tbl-rec' });
  t2.appendChild(renderTitleRow(['数量', '来源', '']));
  const b2 = el('tbody', { id: 'record-body' });
  t2.appendChild(b2);
  container.appendChild(t2);
  character.resources.records.forEach((r, i) => b2.appendChild(renderRecordRow(r, i)));
  if (!character.resources.records.length) {
    container.appendChild(el('p', { class: 'empty-hint', text: '暂无获取记录。' }));
  }
}

function numberInputTxt(value, onChange) {
  const input = el('input', { type: 'text', value });
  input.addEventListener('input', (e) => onChange(e.target.value, input));
  return input;
}

function renderPurchaseRow(p, index) {
  const tr = el('tr');
  const pTd = el('td', { class: 'name-col' });
  pTd.appendChild(textInput({ value: p.price, placeholder: '支线+分数', onChange: (v) => (p.price = v) }));
  tr.appendChild(pTd);
  const cTd = el('td', { class: 'effect-col' });
  cTd.appendChild(textarea({ value: p.content, placeholder: '购买内容', onChange: (v) => (p.content = v) }));
  tr.appendChild(cTd);
  const delTd = el('td', { class: 'del-col' });
  delTd.appendChild(el('button', { class: 'del-btn', text: '✕', dataset: { action: 'del-row', kind: 'purchase', index } }));
  tr.appendChild(delTd);
  return tr;
}

function renderRecordRow(r, index) {
  const tr = el('tr');
  const aTd = el('td', { class: 'name-col' });
  aTd.appendChild(textInput({ value: r.amount, placeholder: '支线+分数', onChange: (v) => (r.amount = v) }));
  tr.appendChild(aTd);
  const sTd = el('td', { class: 'effect-col' });
  sTd.appendChild(textarea({ value: r.source, placeholder: '来源（如 主线奖励）', onChange: (v) => (r.source = v) }));
  tr.appendChild(sTd);
  const delTd = el('td', { class: 'del-col' });
  delTd.appendChild(el('button', { class: 'del-btn', text: '✕', dataset: { action: 'del-row', kind: 'record', index } }));
  tr.appendChild(delTd);
  return tr;
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
  else if (active === 'traits') renderTraitPanel(host);
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
function addPerkRow() {
  character.perks.push(newPerk());
  renderPage();
}
function addEquipmentRow() {
  character.equipment.push(newEquipment());
  renderPage();
}
function addTraitRow() {
  character.traits.push(newTrait());
  renderPage();
}
function addPurchaseRow() {
  character.resources.purchases.push(newPurchase());
  renderPage();
}
function addRecordRow() {
  character.resources.records.push(newRecord());
  renderPage();
}

function deleteRow(kind, index) {
  if (kind === 'spell') character.spells.splice(index, 1);
  else if (kind === 'attack') character.specialAttacks.splice(index, 1);
  else if (kind === 'energy') character.energyPools.splice(index, 1);
  else if (kind === 'perk') character.perks.splice(index, 1);
  else if (kind === 'equip') character.equipment.splice(index, 1);
  else if (kind === 'trait') character.traits.splice(index, 1);
  else if (kind === 'purchase') character.resources.purchases.splice(index, 1);
  else if (kind === 'record') character.resources.records.splice(index, 1);
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
    else if (act === 'add-perk') addPerkRow();
    else if (act === 'add-equip') addEquipmentRow();
    else if (act === 'add-trait') addTraitRow();
    else if (act === 'add-purchase') addPurchaseRow();
    else if (act === 'add-record') addRecordRow();
    else if (act === 'toggle-perk-box') togglePerkBox(btn);
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