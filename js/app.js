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

import { ATTRIBUTES, SKILLS, GROUPS } from './character-config.js';
import { renderRulesPage as renderRulesPageFromModule } from './rules.js';

/** 三系分组标题（生理/心智/互动），跨整行。 */
function renderGroupRow(label, colspan) {
  const tr = el('tr', { class: 'group-row' });
  const td = el('td', { text: label, class: 'group-label', colspan });
  tr.appendChild(td);
  return tr;
}
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
  newReduction,
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
  { id: 'main', label: '角色总览' },
  { id: 'attrs', label: '角色属性' },
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

// 数字/文本输入框宽度锁定：不再随输入内容伸缩，统一由 CSS 宽度固定（无论是否输入都不变长宽）。
function autoGrow() {
  /* 锁死宽度：不做任何宽度调整，保持 CSS 设定的固定宽 */
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

function textarea({ value, placeholder = '', onChange, className }) {
  const area = el('textarea', { value, placeholder });
  if (className) area.className = className;
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

/*
 * 属性两档（对照 Excel 角色属性信息表，列：属性/属性值/传奇/基础/内在/修行/内在/器械/完美/其它/其它/检定值）：
 *   属性值 attrPool  = 基础 + 内在 + 修行
 *   检定值 attrValue = 属性值 + 内在(第二) + 器械 + 完美 + 其它 + 其它
 *   传奇   = ⌊(属性值 - 1) / 5⌋
 */
function attrPool(attrId) {
  const a = attrsOf(attrId);
  return (a.base || 0) + (a.inner || 0) + (a.practice || 0);
}

function attrValue(attrId) {
  const a = attrsOf(attrId);
  return attrPool(attrId) + (a.inner2 || 0) + (a.gear || 0) + (a.perfect || 0) + (a.other || 0) + (a.other2 || 0);
}

function attrLegendary(attrId) {
  return Math.floor((attrPool(attrId) - 1) / 5);
}

/* ------------------------- 属性表格渲染 ------------------------- */

const ATTR_BONUSES = [
  { key: 'inner', label: '内在' },
  { key: 'practice', label: '修行' },
  { key: 'inner2', label: '内在' },
  { key: 'gear', label: '器械' },
  { key: 'perfect', label: '完美' },
  { key: 'other', label: '其它' },
  { key: 'other2', label: '其它' },
];

function renderAttrRow(attr) {
  const tr = el('tr');
  tr.dataset.attrId = attr.id;
  const a = attrsOf(attr.id);
  const value = attrValue(attr.id);

  tr.appendChild(el('td', { class: 'row-label', text: attr.label }));
  tr.appendChild(el('td', { class: 'value-status', text: attrPool(attr.id) }));
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
        refreshAttrDetail();
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
          refreshAttrDetail();
          character.meta.dirty = true;
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
  tr.children[1].textContent = attrPool(id);   // 属性值 = 基础+内在+修行
  tr.children[2].textContent = attrLegendary(id);
  tr.children[tr.children.length - 1].textContent = attrValue(id); // 检定值 = 属性值+器械+完美+其它
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
        refreshAttrDetail();
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
          refreshAttrDetail();
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
          refreshAttrDetail();
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

/* ------------------------- 【角色总览】面板 ------------------------- */

// 总览通用：一个信息卡片（label + 主值 + 附注）
function infoCell(label, value, hint = '') {
  const c = el('div', { class: 'derived-cell' });
  c.appendChild(el('span', { class: 'derived-label', text: label }));
  c.appendChild(el('span', { class: 'derived-value', text: value }));
  if (hint) c.appendChild(el('span', { class: 'derived-hint', text: hint }));
  return c;
}

// n+m 显示：m(=附加成功) 为 0 时隐藏 +m，仅显示 n
function nm(n, m) {
  return Number(m) > 0 ? `${n}+${m}` : `${n}`;
}

// 属性段（总览）：一行三个，三行九项；值显示 n+m（属性检定值 + 附加成功，m=0 隐藏），无 tips
function renderAttrOverview() {
  const wrap = el('div', { class: 'info-grid' });
  ATTRIBUTES.forEach((a) => {
    wrap.appendChild(infoCell(a.label, nm(attrValue(a.id), attrLegendary(a.id))));
  });
  return wrap;
}

// 技能段（总览）：按 生理/心智/互动 分区，每区一行三个；值显示 n+m（检定值 + 附加成功），无 tips
function renderSkillOverview() {
  const wrap = el('div', { class: 'skill-categories' });
  const groups = [
    ['生理系', '生理'],
    ['心智系', '心智'],
    ['互动系', '互动'],
  ];
  groups.forEach(([title, key]) => {
    const block = el('div', { class: 'skill-category' });
    const skills = SKILLS.filter((s) => s.group === key);
    if (!skills.length) return;
    block.appendChild(el('h3', { class: 'skill-group-title', text: title }));
    const grid = el('div', { class: 'info-grid skill-grid' });
    skills.forEach((s) => {
      const cell = el('div', { class: 'derived-cell skill-cell' });
      cell.appendChild(el('span', { class: 'derived-label', text: s.label }));
      cell.appendChild(el('span', { class: 'derived-value skill-value', text: nm(skillValue(s.id), skillExtraSuccess(s.id)) }));
      grid.appendChild(cell);
    });
    block.appendChild(grid);
    wrap.appendChild(block);
  });
  return wrap;
}

// 五种基础攻击：名称 / 检定DP / 伤害上限 / 附加成功
function baseAttackData(atk) {
  const attrV = attrValue(atk.attr);
  const skillV = skillValue(atk.skill);
  const legAttr = attrLegendary(atk.attr);
  const wdmg = atk.weaponDamage != null ? Number(atk.weaponDamage) : 0;
  const ammo = atk.ammoDamage != null ? Number(atk.ammoDamage) : 0;
  const addDmg = wdmg + (atk.id === 'semi' || atk.id === 'full' || atk.id === 'bow' ? ammo : 0);
  const bonusSum = (atk.bonuses || []).reduce((s, b) => s + (Number(b) || 0), 0) + (Number(atk.other) || 0);
  const checkDP = attrV + skillV + addDmg + (Number(atk.specialty) || 0) + bonusSum;
  const damageCap =
    addDmg +
    Number(attrsOf(atk.attr).base) +
    Number(character.skills[atk.skill].base) +
    ((Number(atk.specialty) || 0) > 0 ? 1 : 0) +
    legAttr * 2 +
    (Number(character.geneLock) || 0);
  const extraSuccess = skillExtraSuccess(atk.skill) + legAttr + bonusSum + (atk.extraSuccessBonus || []).reduce((s, b) => s + (Number(b) || 0), 0);
  return { label: atk.label, checkDP, damageCap, extraSuccess };
}

// 基础攻击方式（总览）：一行三个，值显示 n+m（检定DP + 附加成功，m=0 隐藏），tips 仅保留伤害上限
function renderAttackOverview() {
  const wrap = el('div', { class: 'info-grid' });
  character.baseAttacks.forEach((atk) => {
    const d = baseAttackData(atk);
    wrap.appendChild(infoCell(d.label, nm(d.checkDP, d.extraSuccess), `伤害上限 ${d.damageCap}`));
  });
  return wrap;
}

// 派生值（总览）：意志力 / 先攻值 / 移动力 + 三豁免（移入派生值）
function renderOverviewDerived() {
  const d = derivedValues();
  const wrap = el('div', { class: 'derived-wrap' });
  const grid = el('div', { class: 'info-grid' });
  grid.appendChild(infoCell('意志力', d.willpower, '决心 + 沉着 + 传奇决心×3'));
  grid.appendChild(infoCell('先攻值', d.initiative, '敏捷 + 沉着 + 传奇沉着×3'));
  grid.appendChild(infoCell('移动力', d.movement, '5 + 力量 + 敏捷 + 传奇敏捷×3'));
  wrap.appendChild(grid);

  wrap.appendChild(el('h3', { class: 'skill-group-title save-head', text: '豁免检定' }));
  const row = el('div', { class: 'info-grid save-row' });
  // 总览豁免：值显示 n+m（基础豁免 + 附加成功，m=0 隐藏）
  row.appendChild(infoCell('反射豁免', nm(d.reflex, saveOverviewExtra(0)), '敏捷 + 运动'));
  row.appendChild(infoCell('意志豁免', nm(d.willSave, saveOverviewExtra(1)), '决心 + 感受'));
  row.appendChild(infoCell('强韧豁免', nm(d.fortitude, saveOverviewExtra(2)), '耐力 + 求生'));
  wrap.appendChild(row);
  return wrap;
}

// 豁免「附加成功」展示值（不含属性页的附加成功加值）：技能附加成功 + 主属性传奇
function saveOverviewExtra(i) {
  return skillExtraSuccess(SAVE_DEFS[i].skill) + attrLegendary(SAVE_DEFS[i].attr);
}

// 护甲合计（总护甲 + 附加成功）
function overviewArmorTotal() {
  return (
    (character.defense.armor.innate || 0) + (character.defense.armor.base || 0) +
    (character.defense.armor.armor || 0) + (character.defense.armor.block || 0) +
    (character.defense.armor.insight || 0) + (character.defense.armor.other || 0) +
    (character.defense.armorBonus || []).reduce((s, b) => s + (Number(b) || 0), 0)
  );
}
function armorExtraSuccess() {
  return attrLegendary('stamina'); // 防御附加成功：传奇耐力
}

// 伤害减免：汇总「X物理减免，Y能量减免」
function reductionSummary() {
  const reds = (character.defense.reduction || []).filter((r) => Number(r.amount) > 0);
  if (!reds.length) return '无伤害减免';
  return reds.map((r) => `${Number(r.amount)}${r.type}减免`).join('，');
}

// 生命值：单独一部分，展示属性页计算完成的详细状态；总量显示 n+m（n 总量，m 临时生命，m=0 时隐藏 +m）
function renderHealthPanel() {
  const hp = character.hpSlots;
  const d = derivedValues();
  const parts = [];
  if (Number(hp.intact) > 0) parts.push(`${hp.intact}`);
  if (Number(hp.b) > 0) parts.push(`${hp.b}B`);
  if (Number(hp.l) > 0) parts.push(`${hp.l}L`);
  if (Number(hp.a) > 0) parts.push(`${hp.a}A`);
  if (Number(hp.temp) > 0) parts.push(`${hp.temp}临时`);
  const statusText = parts.length ? parts.join(' + ') : '0';
  const temp = Number(hp.temp) || 0;
  const totalText = temp > 0 ? `${d.health}+${temp}` : `${d.health}`;

  const cell = infoCell('生命值总量', totalText, `状态 ${statusText}`);
  // 控制区：右侧两个按钮 + 两个输入框（按钮左、输入框右，各占半行，暂不实现功能）
  const ctrl = el('div', { class: 'health-ctrl' });
  const mkAction = (label, key) => {
    const row = el('div', { class: 'health-action' });
    row.appendChild(actionButton(label, { action: 'health-action' }));
    row.appendChild(numberInput({ value: 0, min: 0, onChange: () => {} }));
    return row;
  };
  ctrl.appendChild(mkAction('回复生命', 'heal'));
  ctrl.appendChild(mkAction('受到伤害', 'damage'));
  cell.appendChild(ctrl);

  const wrap = el('div', { class: 'health-panel' });
  wrap.appendChild(cell);
  return wrap;
}

// 防御信息：护甲（总+附加成功） + 伤害减免
function renderDefenseInfo() {
  const wrap = el('div', { class: 'defense-info' });
  const grid = el('div', { class: 'info-grid' });
  grid.appendChild(infoCell('护甲', nm(overviewArmorTotal(), armorExtraSuccess()), '总护甲+附加成功（传奇耐力）'));
  wrap.appendChild(grid);

  const bar = el('div', { class: 'reduction-bar' });
  bar.appendChild(el('span', { class: 'reduction-label', text: '伤害减免' }));
  bar.appendChild(el('span', { class: 'reduction-value', text: reductionSummary() }));
  wrap.appendChild(bar);
  return wrap;
}

// 敏感范围（总览/属性页共用）：感知属性×10 + 传奇感知×20 + 加成
function sensitiveRangeTotal() {
  const dd = character.derivedDetail.sensitive;
  return (
    attrPool('perception') * 10 + attrLegendary('perception') * 20 +
    (dd.bonus || []).reduce((s, b) => s + (Number(b) || 0), 0)
  );
}

// 其他信息：基因锁熟练度 / 敏感范围
function renderOtherInfo() {
  const wrap = el('div', { class: 'overview-info' });
  const row = el('div', { class: 'info-grid' });
  row.appendChild(infoCell('基因锁熟练度', character.geneLock ?? 0, ''));
  row.appendChild(infoCell('敏感范围', `${sensitiveRangeTotal()} m`, ''));
  wrap.appendChild(row);
  return wrap;
}

function renderMainSheet() {
  const wrap = el('div', { class: 'sheet-panel' });
  wrap.appendChild(section('概念段', renderConcepts()));
  wrap.appendChild(section('属性段', renderAttrOverview()));
  wrap.appendChild(section('技能段', renderSkillOverview()));
  wrap.appendChild(section('生命信息', renderHealthPanel()));
  wrap.appendChild(section('防御信息', renderDefenseInfo())); // 防御信息移至生命信息下方
  wrap.appendChild(section('派生值', renderOverviewDerived()));
  wrap.appendChild(section('基础攻击方式', renderAttackOverview()));
  wrap.appendChild(section('其他信息', renderOtherInfo()));
  return wrap;
}

/* ------------------------- 【角色属性】面板（详细） ------------------------- */

// 属性完整列（含加值栏）：属性 / 属性值 / 传奇 / 基础 / 内在 / 修行 / 内在 / 器械 / 完美 / 其它 / 其它 / 检定值
// 按 生理/心智/互动 三系分组展示（参考角色卡 Excel 与基础规则.docx）
function renderFullAttrTable() {
  const table = el('table', { class: 'stats-table attr-table' });
  table.appendChild(renderTitleRow(['属性', '属性值', '传奇', '基础', '内在', '修行', '内在', '器械', '完美', '其它', '其它', '检定值']));
  GROUPS.forEach((g) => {
    const items = ATTRIBUTES.filter((a) => a.group === g);
    if (!items.length) return;
    table.appendChild(renderGroupRow(`${g}系`, 12));
    items.forEach((a) => table.appendChild(renderAttrRow(a)));
  });
  return table;
}

// 技能完整列（含加值栏）：技能 / 检定值 / 附加成功 / 建卡 / 内在 / 修行 / 器械 / 完美 / 士气 / 其它
// 同样按 生理/心智/互动 三系分组展示
function renderFullSkillTable() {
  const table = el('table', { class: 'stats-table' });
  table.appendChild(renderTitleRow(['技能', '检定值', '附加成功', '建卡', '内在', '修行', '器械', '完美', '士气', '其它']));
  GROUPS.forEach((g) => {
    const items = SKILLS.filter((s) => s.group === g);
    if (!items.length) return;
    table.appendChild(renderGroupRow(`${g}系`, 10));
    items.forEach((s) => table.appendChild(renderSkillRow(s)));
  });
  return table;
}

// 属性细则：派生值计算 + 加成栏位（参考 Excel「属性细则」）
// detailNumber: 绑定写回 + 就近刷新本框合计（避免整页重渲染导致失焦）。
function detailNumber(value, write, recompute) {
  const input = numberInput({
    value,
    onChange: (v) => {
      write(v);
      const box = input.closest('.detail-box');
      const total = box ? box.querySelector('.detail-box-total') : null;
      if (total) total.textContent = recompute();
    },
  });
  return input;
}

function attrDetailBox(title, total, inputs, tip = '') {
  // 派生值框：最左侧加蓝色竖条（参照基础攻击方式 .attack-detail）
  const box = el('div', { class: 'detail-box detail-box-accent' });
  const head = el('div', { class: 'detail-box-head' });
  head.appendChild(el('span', { class: 'detail-box-title', text: title })); // 小标题在左上
  box.appendChild(head);
  // 总值从左下挪到最左侧：参照总览卡片，靠左放入「总值」栏（label + 大号数值）
  const row = el('div', { class: 'detail-box-inputs' });
  const tBlock = el('div', { class: 'detail-total-block' });
  tBlock.appendChild(el('span', { class: 'detail-total-label', text: '总值' }));
  tBlock.appendChild(el('span', { class: 'detail-box-total', text: total }));
  row.appendChild(tBlock);
  inputs.forEach((it) => {
    const c = el('label', { class: 'detail-input' });
    c.appendChild(el('span', { class: 'detail-input-label', text: it.label }));
    c.appendChild(it.node);
    row.appendChild(c);
  });
  box.appendChild(row);
  if (tip) box.appendChild(el('div', { class: 'detail-tip', text: tip })); // 左下角提示
  return box;
}

function renderAttrDetailPanel() {
  const wrap = el('div', { class: 'attr-detail-panel' });
  const dd = character.derivedDetail;
  const base = derivedValues();
  const bon = (arr) => (arr || []).reduce((s, b) => s + (Number(b) || 0), 0);
  const bonusInputs = (arr, writeArr, recompute, featVal, featWrite) => {
    const list = [];
    if (featWrite) {
      list.push({ label: '专长', node: detailNumber(Number(featVal) || 0, featWrite, recompute) });
    }
    for (let i = 0; i < 5; i++) {
      const j = i;
      list.push({ label: `加成${j + 1}`, node: detailNumber(arr[j], (v) => (writeArr[j] = v), recompute) });
    }
    return list;
  };

  const mv = () => base.movement + (Number(dd.movement.feat) || 0) + bon(dd.movement.bonus);
  const it = () => base.initiative + (Number(dd.initiative.feat) || 0) + bon(dd.initiative.bonus);
  const wp = () => base.willpower + (Number(dd.willpower.feat) || 0) + bon(dd.willpower.bonus);
  const hp = () => base.health + (Number(dd.health.feat) || 0) + bon(dd.health.bonus);

  wrap.appendChild(attrDetailBox('移动力', mv(), bonusInputs(dd.movement.bonus, dd.movement.bonus, mv, dd.movement.feat, (v) => (dd.movement.feat = v)), '5 + 力量检定 + 敏捷检定 + 传奇敏捷×3'));
  wrap.appendChild(attrDetailBox('先攻值', it(), bonusInputs(dd.initiative.bonus, dd.initiative.bonus, it, dd.initiative.feat, (v) => (dd.initiative.feat = v)), '敏捷检定 + 沉着检定 + 传奇沉着×3'));
  wrap.appendChild(attrDetailBox('意志力', wp(), [
    { label: '传奇决心', node: el('span', { class: 'detail-static', text: attrLegendary('resolve') * 3 }) },
    { label: '传奇沉着', node: el('span', { class: 'detail-static', text: attrLegendary('presence') }) },
    { label: '专长', node: detailNumber(dd.willpower.feat, (v) => (dd.willpower.feat = v), wp) },
    ...bonusInputs(dd.willpower.bonus, dd.willpower.bonus, wp),
  ], '决心检定 + 沉着检定 + 传奇决心×3 + 传奇沉着'));
  wrap.appendChild(attrDetailBox('生命值', hp(), bonusInputs(dd.health.bonus, dd.health.bonus, hp, dd.health.feat, (v) => (dd.health.feat = v)), '5 + 耐力检定 + 传奇耐力增值 ⌊N(N+1)/2⌋'));

  return wrap;
}

// 通用「圆角外框 + 直角内表 + 左下提示」结构
function tableBox(title, tableNode, tip = '', boxClass = '') {
  const box = el('div', { class: 'detail-box' + (boxClass ? ' ' + boxClass : '') });
  const head = el('div', { class: 'detail-box-head' });
  head.appendChild(el('span', { class: 'detail-box-title', text: title }));
  box.appendChild(head);
  const scroll = el('div', { class: 'table-scroll' });
  scroll.appendChild(tableNode);
  box.appendChild(scroll);
  if (tip) box.appendChild(el('div', { class: 'detail-tip', text: tip }));
  return box;
}

// 豁免检定（参考 Excel「角色属性」A96-M105 与基础规则.docx）：每个豁免 = 表头行 + 值行，共 6 行
const SAVE_DEFS = [
  { name: '反射豁免', attr: 'dexterity', skill: 'athletics', attrName: '敏捷', skillName: '运动', legName: '传奇敏捷' },
  { name: '意志豁免', attr: 'resolve', skill: 'empathy', attrName: '决心', skillName: '感受', legName: '传奇决心' },
  { name: '强韧豁免', attr: 'stamina', skill: 'survival', attrName: '耐力', skillName: '求生', legName: '传奇耐力' },
];

// 单个豁免的「附加成功 m」= 技能附加成功 + 主属性传奇附加成功 + 附加成功加值(bonus+3..+5)
function saveExtraSuccess(i) {
  const dd = character.derivedDetail.saves;
  return (
    skillExtraSuccess(SAVE_DEFS[i].skill) + attrLegendary(SAVE_DEFS[i].attr) +
    (Number(dd.bonus[i * 6 + 3]) || 0) + (Number(dd.bonus[i * 6 + 4]) || 0) +
    (Number(dd.bonus[i * 6 + 5]) || 0)
  );
}

// 单个豁免的「总计 n」（不含附加成功）：
// 属性检定 + 技能检定 + 传奇属性×3 + 专业 + 专长 + 加成1..3
function saveTotalOf(i) {
  const s = SAVE_DEFS[i];
  const dd = character.derivedDetail.saves;
  return (
    attrValue(s.attr) + skillValue(s.skill) + attrLegendary(s.attr) * 3 +
    (Number(dd.special[i]) || 0) + (Number(dd.feat[i]) || 0) +
    (Number(dd.bonus[i * 6]) || 0) + (Number(dd.bonus[i * 6 + 1]) || 0) +
    (Number(dd.bonus[i * 6 + 2]) || 0)
  );
}

// 豁免总值显示为「n+m」：n = 总计，m = 附加成功；m=0 时隐藏 +m
function saveDisplayOf(i) {
  return nm(saveTotalOf(i), saveExtraSuccess(i));
}

function renderSavesPanel() {
  const dd = character.derivedDetail.saves;
  const wrap = el('div', { class: 'attr-detail-panel save-detail-panel' });

  SAVE_DEFS.forEach((s, i) => {
    const recompute = () => saveDisplayOf(i);
    const box = el('div', { class: 'detail-box save-detail-box detail-box-accent' });
    const head = el('div', { class: 'detail-box-head' });
    head.appendChild(el('span', { class: 'detail-box-title', text: s.name }));
    box.appendChild(head);

    const row = el('div', { class: 'detail-box-inputs' });
    // 总值栏在左，值显示为「总计 + 附加成功」（n+m）
    const tBlock = el('div', { class: 'detail-total-block' });
    tBlock.appendChild(el('span', { class: 'detail-total-label', text: '总值' }));
    tBlock.appendChild(el('span', { class: 'detail-box-total', text: recompute() }));
    row.appendChild(tBlock);

    // 专业 / 专长
    row.appendChild(
      el('label', { class: 'detail-input' }, [
        el('span', { class: 'detail-input-label', text: '专业' }),
        detailNumber(dd.special[i], (v) => (dd.special[i] = v), recompute),
      ])
    );
    row.appendChild(
      el('label', { class: 'detail-input' }, [
        el('span', { class: 'detail-input-label', text: '专长' }),
        detailNumber(dd.feat[i], (v) => (dd.feat[i] = v), recompute),
      ])
    );
    // 加成1..3（并入总计 n）
    for (let k = 0; k < 3; k++) {
      const idx = i * 6 + k;
      row.appendChild(
        el('label', { class: 'detail-input' }, [
          el('span', { class: 'detail-input-label', text: `加成${k + 1}` }),
          detailNumber(dd.bonus[idx], (v) => (dd.bonus[idx] = v), recompute),
        ])
      );
    }
    // 竖线分隔 + 右侧附加成功加值（加值1/2/3，计入 m；横向排布与主体 input 对齐）
    const esc = el('div', { class: 'detail-extra-succ' });
    for (let k = 3; k < 6; k++) {
      const idx = i * 6 + k;
      esc.appendChild(
        el('label', { class: 'detail-input' }, [
          el('span', { class: 'detail-input-label', text: `加值${k - 2}` }),
          detailNumber(dd.bonus[idx], (v) => (dd.bonus[idx] = v), recompute),
        ])
      );
    }
    row.appendChild(esc);
    box.appendChild(row);
    // 灰色 tip：隐含 属性 + 技能 + 传奇属性×3（不单独展示列）
    box.appendChild(el('div', { class: 'detail-tip', text: `${s.attrName}检定 + ${s.skillName}检定 + ${s.legName}×3` }));
    wrap.appendChild(box);
  });

  return wrap;
}

// 防御（护甲来源 + 伤害减免）
function renderDefensePanel() {
  const wrap = el('div', { class: 'attr-detail-panel' });
  const df = character.defense;

  const armorBox = el('div', { class: 'detail-box detail-box-accent' }); // 护甲合计左侧小蓝条
  const aHead = el('div', { class: 'detail-box-head' });
  aHead.appendChild(el('span', { class: 'detail-box-title', text: '护甲合计' }));
  armorBox.appendChild(aHead);
  const aRow = el('div', { class: 'detail-box-inputs' });
  // 总值栏移到最左侧（与其余派生值框一致）
  const aTotal = el('div', { class: 'detail-total-block' });
  aTotal.appendChild(el('span', { class: 'detail-total-label', text: '总值' }));
  aTotal.appendChild(el('span', { class: 'detail-box-total', text: overviewArmorTotal() }));
  aRow.appendChild(aTotal);
  const armorKeys = [
    ['innate', '天生'], ['base', '基础'], ['armor', '盔甲'],
    ['block', '格挡'], ['insight', '洞察'], ['other', '其它'],
  ];
  armorKeys.forEach(([k, lab]) => {
    const c = el('label', { class: 'detail-input' });
    c.appendChild(el('span', { class: 'detail-input-label', text: lab }));
    c.appendChild(numberInput({ value: df.armor[k], onChange: (v) => { df.armor[k] = v; refreshAttrDetail(); } }));
    aRow.appendChild(c);
  });
  (df.armorBonus || []).forEach((b, i) => {
    const c = el('label', { class: 'detail-input' });
    c.appendChild(el('span', { class: 'detail-input-label', text: '加成' + (i + 1) }));
    c.appendChild(numberInput({ value: b, onChange: (v) => { df.armorBonus[i] = v; refreshAttrDetail(); } }));
    aRow.appendChild(c);
  });
  armorBox.appendChild(aRow);
  wrap.appendChild(armorBox);

  // 伤害减免：每行 = 类型 / 减免值 / 来源 的小输入框（各带名称）+ 最右侧删除
  const redBox = el('div', { class: 'detail-box' });
  const redHead = el('div', { class: 'detail-box-head' });
  redHead.appendChild(el('span', { class: 'detail-box-title', text: '伤害减免' }));
  redBox.appendChild(redHead);
  const redList = el('div', { class: 'red-list' });
  (df.reduction || []).forEach((r, i) => {
    const row = el('div', { class: 'red-row' });
    const typeC = el('label', { class: 'detail-input' });
    typeC.appendChild(el('span', { class: 'detail-input-label', text: '类型' }));
    const typeInp = textInput({ value: r.type, placeholder: '如 物理 / 能量', onChange: (v) => (r.type = v) });
    typeInp.style.width = '150px';
    typeC.appendChild(typeInp);
    const amtC = el('label', { class: 'detail-input' });
    amtC.appendChild(el('span', { class: 'detail-input-label', text: '减免值' }));
    amtC.appendChild(numberInput({ value: r.amount, min: 0, onChange: (v) => (r.amount = v) }));
    const srcC = el('label', { class: 'detail-input red-input-wide' });
    srcC.appendChild(el('span', { class: 'detail-input-label', text: '来源' }));
    const srcInp = textInput({ value: r.source, placeholder: '如 血统xx / 装备', onChange: (v) => (r.source = v) });
    srcInp.style.width = '280px'; // 来源栏适当加大，便于填写来源说明
    srcC.appendChild(srcInp);
    row.appendChild(typeC);
    row.appendChild(amtC);
    row.appendChild(srcC);
    row.appendChild(actionButton('删除', { action: 'remove-reduction', index: i }, 'btn-ghost red-op-btn'));
    redList.appendChild(row);
  });
  redBox.appendChild(redList);
  const redAdd = el('div', { class: 'add-bar add-bar-right' });
  redAdd.appendChild(actionButton('添加减免', { action: 'add-reduction' }));
  redBox.appendChild(redAdd);
  wrap.appendChild(redBox);
  return wrap;
}

// 基础攻击详细（参考豁免样式）：n+m 总值，属性/技能隐含于 tip，传奇可见，右侧附加成功加值(3)
function renderBaseAttackDetail() {
  const wrap = el('div', { class: 'attr-detail-panel' });
  const attrName = (id) => (id === 'strength' ? '力量' : '敏捷');
  const skillName = (id) => ({ weaponry: '白刃', brawl: '肉搏', firearms: '枪械', athletics: '运动' }[id] || id);

  character.baseAttacks.forEach((atk) => {
    const aN = attrName(atk.attr);
    const sN = skillName(atk.skill);
    const legN = `传奇${aN}`;

    const recompute = () => {
      const d = baseAttackData(atk);
      return nm(d.checkDP, d.extraSuccess);
    };
    const box = el('div', { class: 'detail-box attack-detail' }); // 蓝绿左边框沿用 attack-detail
    const head = el('div', { class: 'detail-box-head' });
    head.appendChild(el('span', { class: 'detail-box-title', text: atk.label }));
    box.appendChild(head);

    const row = el('div', { class: 'detail-box-inputs' });
    const tBlock = el('div', { class: 'detail-total-block' });
    tBlock.appendChild(el('span', { class: 'detail-total-label', text: '总值' }));
    tBlock.appendChild(el('span', { class: 'detail-box-total', text: recompute() }));
    row.appendChild(tBlock);

    // 传奇不隐含：单独展示（静态，自动计算）
    row.appendChild(
      el('label', { class: 'detail-input' }, [
        el('span', { class: 'detail-input-label', text: legN }),
        el('span', { class: 'detail-static', text: attrLegendary(atk.attr) }),
      ])
    );
    // 武器伤害 / 专业 / 加成1..5 / 其他
    const inp = (label, value, write) => {
      row.appendChild(
        el('label', { class: 'detail-input' }, [
          el('span', { class: 'detail-input-label', text: label }),
          detailNumber(value, write, recompute),
        ])
      );
    };
    if (atk.ammoCount != null) inp('弹药数', atk.ammoCount, (v) => (atk.ammoCount = v));
    if (atk.ammoDamage != null) inp(atk.id === 'bow' ? '箭矢伤害' : '弹药伤害', atk.ammoDamage, (v) => (atk.ammoDamage = v));
    inp('武器伤害', atk.weaponDamage, (v) => (atk.weaponDamage = v));
    inp('专业', atk.specialty, (v) => (atk.specialty = v));
    for (let i = 0; i < 5; i++) {
      const j = i;
      inp(`加成${i + 1}`, atk.bonuses[i], (v) => (atk.bonuses[j] = v));
    }
    inp('其他', atk.other, (v) => (atk.other = v));

    // 竖线分隔 + 右侧附加成功加值（加值1/2/3，计入 m；横向排布与主体 input 对齐）
    const esc = el('div', { class: 'detail-extra-succ' });
    for (let k = 0; k < 3; k++) {
      const j = k;
      esc.appendChild(
        el('label', { class: 'detail-input' }, [
          el('span', { class: 'detail-input-label', text: `加值${k + 1}` }),
          detailNumber(atk.extraSuccessBonus[k], (v) => (atk.extraSuccessBonus[j] = v), recompute),
        ])
      );
    }
    row.appendChild(esc);
    box.appendChild(row);

    const d = baseAttackData(atk);
    // 属性/技能隐含于 tip，传奇可见
    box.appendChild(el('div', { class: 'detail-tip', text: `${aN}检定 + ${sN}检定 · 伤害上限 ${d.damageCap}` }));
    wrap.appendChild(box);
  });
  return wrap;
}

// 敏感范围：仿派生值框（总计+加成小输入框 + 灰色 tip 隐藏属性引用）
function renderSensitiveRangeDetail() {
  const wrap = el('div', { class: 'attr-detail-panel' });
  const dd = character.derivedDetail.sensitive;

  const recompute = () => sensitiveRangeTotal();

  const box = el('div', { class: 'detail-box detail-box-accent' });
  const head = el('div', { class: 'detail-box-head' });
  head.appendChild(el('span', { class: 'detail-box-title', text: '敏感范围' }));
  box.appendChild(head);

  const row = el('div', { class: 'detail-box-inputs' });
  const tBlock = el('div', { class: 'detail-total-block' });
  tBlock.appendChild(el('span', { class: 'detail-total-label', text: '总值' }));
  tBlock.appendChild(el('span', { class: 'detail-box-total', text: recompute() }));
  row.appendChild(tBlock);
  // 加成1..5
  for (let k = 0; k < 5; k++) {
    const j = k;
    row.appendChild(
      el('label', { class: 'detail-input' }, [
        el('span', { class: 'detail-input-label', text: `加成${k + 1}` }),
        detailNumber(dd.bonus[k], (v) => (dd.bonus[j] = v), recompute),
      ])
    );
  }
  box.appendChild(row);
  // 灰色 tip：隐含 感知检定 / 传奇感知（不单独展示列）
  box.appendChild(el('div', { class: 'detail-tip', text: '= 感知检定×10 + 传奇感知×20' }));
  wrap.appendChild(box);
  return wrap;
}

// 基因锁熟练度：独立加值表（总计 = min(基础 + 传奇风度, 10)）
function renderGeneLockDetail() {
  const wrap = el('div', { class: 'attr-detail-panel' });
  const gene = () => Math.min((Number(character.geneLock) || 0) + attrLegendary('composure'), 10);
  const table = el('table', { class: 'stats-table calc-table' });
  const h = el('tr', { class: 'subhead-row' });
  ['名称', '熟练度', '基础', '传奇风度'].forEach((t, idx) => h.appendChild(el('th', { text: t, class: idx === 0 ? '' : 'num-head' })));
  table.appendChild(h);
  const tr = el('tr');
  tr.appendChild(el('td', { class: 'row-label', text: '基因锁熟练度' }));
  tr.appendChild(el('td', { class: 'value-status', text: gene() }));
  const baseTd = el('td', { class: 'base-col' });
  baseTd.appendChild(numberInput({
    value: character.geneLock,
    max: 10,
    onChange: (v, inp) => { character.geneLock = v; const row = inp.closest('tr'); if (row) row.querySelector('.value-status').textContent = Math.min(v + attrLegendary('composure'), 10); refreshAttrDetail(); },
  }));
  tr.appendChild(baseTd);
  tr.appendChild(el('td', { class: 'calc-col', text: attrLegendary('composure') }));
  table.appendChild(tr);
  wrap.appendChild(tableBox('基因锁熟练度', table, '= min(基础 + 传奇风度, 10)'));
  return wrap;
}

// 生命值（属性页）：状态点数 + 明细
function renderHealthDetail() {
  const hp = character.hpSlots;
  const base = derivedValues();
  const hpBox = el('div', { class: 'detail-box detail-box-accent' }); // 左侧小蓝条
  const hHead = el('div', { class: 'detail-box-head' });
  hHead.appendChild(el('span', { class: 'detail-box-title', text: '生命值点数' }));
  hpBox.appendChild(hHead);
  const r2 = el('div', { class: 'detail-box-inputs' });
  // 总值栏移到最左侧（与其余派生值框一致）
  const hpTotal = el('div', { class: 'detail-total-block' });
  hpTotal.appendChild(el('span', { class: 'detail-total-label', text: '总值' }));
  hpTotal.appendChild(el('span', { class: 'detail-box-total', text: base.health }));
  r2.appendChild(hpTotal);
  const hpField = (label, key) => {
    const c = el('label', { class: 'detail-input' });
    c.appendChild(el('span', { class: 'detail-input-label', text: label }));
    // 完好默认值 = 总值（总值修改后同步变动）；其余状态点数照常
    const init = key === 'intact' && (hp.intact || 0) === 0 ? base.health : hp[key];
    const inp = numberInput({ value: init, onChange: (v) => (hp[key] = v) });
    if (key === 'intact') inp._intactInput = true;
    c.appendChild(inp);
    return c;
  };
  r2.appendChild(hpField('完好', 'intact'));
  r2.appendChild(hpField('冲击 B', 'b'));
  r2.appendChild(hpField('严重 L', 'l'));
  r2.appendChild(hpField('恶性 A', 'a'));
  r2.appendChild(hpField('临时', 'temp'));
  hpBox.appendChild(r2);
  const wrap = el('div', { class: 'attr-detail-panel' });
  wrap.appendChild(hpBox);
  return wrap;
}

// 就地刷新激活 sheet 上的所有派生值合计（不重渲染，避免输入失焦）。
function refreshAttrDetail() {
  const host = document.querySelector('.sheet-body');
  if (!host) return;
  const bon = (arr) => (arr || []).reduce((s, b) => s + (Number(b) || 0), 0);
  const dd = character.derivedDetail;
  const base = derivedValues();

  // 计算每个「圆角外框」合计值（按框标题）
  const totalsByTitle = {
    移动力: () => base.movement + (Number(dd.movement.feat) || 0) + bon(dd.movement.bonus),
    先攻值: () => base.initiative + (Number(dd.initiative.feat) || 0) + bon(dd.initiative.bonus),
    意志力: () => base.willpower + (Number(dd.willpower.feat) || 0) + bon(dd.willpower.bonus),
    生命值: () => base.health + (Number(dd.health.feat) || 0) + bon(dd.health.bonus),
    护甲合计: () => overviewArmorTotal(),
    生命值点数: () => base.health,
  };

  host.querySelectorAll('.detail-box').forEach((box) => {
    const titleEl = box.querySelector('.detail-box-title');
    if (!titleEl) return;
    const title = titleEl.textContent;

    // 1) 有「总值栏」的外框（移动/先攻/意志/生命/护甲、生命值点数）
    const totalEl = box.querySelector('.detail-box-total');
    const fn = totalsByTitle[title];
    if (totalEl && fn) totalEl.textContent = fn();

    // 2) 豁免框（仿派生值样式）：更新总值栏「n+m」（n=总计，m=附加成功）
    const saveIdx = SAVE_DEFS.findIndex((s) => s.name === title);
    if (saveIdx >= 0) {
      const svTotal = box.querySelector('.detail-box-total');
      if (svTotal) svTotal.textContent = saveDisplayOf(saveIdx);
    }

    // 3) 敏感范围框（仿派生值样式）：总值 = 感知×10 + 传奇感知×20 + 加成；并同步「完好」输入跟随总值
    if (title === '敏感范围') {
      const d2 = box.querySelector('.detail-box-total');
      if (d2) d2.textContent = sensitiveRangeTotal();
    }
    if (title === '生命值点数') {
      // 完好默认跟随总值（修改后变动）
      const intactLab = [...box.querySelectorAll('.detail-input')].find((l) => l.querySelector('.detail-input-label') && l.querySelector('.detail-input-label')._text === '完好');
      const intactInp = intactLab && intactLab.querySelector('input');
      if (intactInp) intactInp.value = base.health;
    }
    if (title === '基因锁熟练度') {
      const totalCell = box.querySelector('.value-status');
      if (totalCell) totalCell.textContent = Math.min((Number(character.geneLock) || 0) + attrLegendary('composure'), 10);
    }
  });

  // 4) 攻击框：更新 总值栏(n+m) + 底部提示（属性/技能隐含，伤害上限）
  host.querySelectorAll('.detail-box.attack-detail').forEach((box) => {
    const titleEl = box.querySelector('.detail-box-title');
    const atk = character.baseAttacks.find((a) => a.label === titleEl.textContent);
    const tipEl = box.querySelector('.detail-tip');
    const totalEl = box.querySelector('.detail-box-total');
    if (atk) {
      const d = baseAttackData(atk);
      const aN = (id) => (id === 'strength' ? '力量' : '敏捷');
      const sN = (id) => ({ weaponry: '白刃', brawl: '肉搏', firearms: '枪械', athletics: '运动' }[id] || id);
      if (tipEl) tipEl.textContent = `${aN(atk.attr)}检定 + ${sN(atk.skill)}检定 · 伤害上限 ${d.damageCap}`;
      if (totalEl) totalEl.textContent = nm(d.checkDP, d.extraSuccess);
    }
  });
}

function renderAttrDetailSheet() {
  const wrap = el('div', { class: 'sheet-panel' });
  wrap.appendChild(section('属性加值', renderFullAttrTable()));
  wrap.appendChild(section('技能加值', renderFullSkillTable()));
  wrap.appendChild(section('生命值', renderHealthDetail()));
  wrap.appendChild(section('属性细则（派生值）', renderAttrDetailPanel()));
  wrap.appendChild(section('豁免检定', renderSavesPanel()));
  wrap.appendChild(section('防御（护甲 / 伤害减免）', renderDefensePanel()));
  wrap.appendChild(section('基础攻击方式', renderBaseAttackDetail()));
  wrap.appendChild(section('敏感范围', renderSensitiveRangeDetail()));
  wrap.appendChild(section('基因锁熟练度', renderGeneLockDetail()));
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
    // 移动力/先攻值/意志力/生命值：按 Excel 用「属性值」(基础+内在+修行)
    health: 5 + attrPool('stamina') + shape('stamina'),
    willpower: attrPool('resolve') + attrPool('presence') + tri('resolve') + leg('presence'),
    initiative: attrPool('dexterity') + attrPool('presence') + tri('presence'),
    movement: 5 + attrPool('strength') + attrPool('dexterity') + tri('dexterity'),
    // 豁免：按 Excel 用「检定值」(属性值+器械+完美+其它)
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
  else if (active === 'attrs') host.appendChild(renderAttrDetailSheet());
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

async function renderRulesPage() {
  await renderRulesPageFromModule();
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
function addReductionRow() {
  character.defense.reduction.push(newReduction());
  renderPage();
}
function removeReductionRow(index) {
  character.defense.reduction.splice(index, 1);
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
    else if (act === 'add-reduction') addReductionRow();
    else if (act === 'remove-reduction') removeReductionRow(Number(btn.dataset.index));
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