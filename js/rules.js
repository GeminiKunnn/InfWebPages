/**
 * rules.js — 规则书模块
 * -----------------------------------------------------------------------------
 * 从后端/静态内容目录加载 .md 规则书，解析为 DOM 就地展示。
 * 提供：
 *   - RULES               规则书清单（id / 标题 / 文件路径）
 *   - renderRulesPage()   渲染「规则书」页（选择器 + 侧边竖目录 + 正文）
 *
 * 设计要点：
 *   - 零依赖手写 Markdown 渲染器，覆盖规则书 .md 用到的语法
 *     （标题 h1-h4 / 无序与有序列表 / 表格 / 强调 / 分隔线 / 引用 / 链接）。
 *   - 侧边目录根据 h2/h3/h4 构建，滚动时高亮当前标题。
 *   - 布局与其它页（.page / .card-section / .section-title）风格统一，响应式。
 */

/* ------------------------- 规则书清单 ------------------------- */

export const RULES = [
  { id: 'base', title: '基础规则', file: 'content/rules/基础规则.md' },
  { id: 'combat', title: '战斗规则', file: 'content/rules/战斗规则.md' },
  { id: 'adv-combat', title: '进阶战斗规则', file: 'content/rules/进阶战斗规则.md' },
  { id: 'char-create', title: '快速创建角色卡', file: 'content/rules/快速创建角色卡.md' },
  { id: 'misc', title: '其他规则', file: 'content/rules/其他规则.md' },
];

/**
 * 圣化文本（渲染 HTML 前转义，防止 .md 内容被当作 HTML）。
 */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 行内 Markdown → HTML（强调、链接、内联代码、转义）。
 * 规则书 md 只用到了 **bold** 与少量 *italic*，此处一并处理链接与行内码。
 */
function inlineHtml(text) {
  let s = esc(text);
  // 先保护行内代码
  s = s.replace(/`([^`]+)`/g, (_, c) => '\u0001' + c + '\u0001');
  // **bold**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // *italic*
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  // [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // 还原行内码
  s = s.replace(/\u0001([^\u0001]*)\u0001/g, '<code>$1</code>');
  return s;
}

/** 累计索引：够成一个 heading 的 DOM 元素，用于侧边目录。 */
let tocHeadings = [];

/**
 * 将 Markdown 文本解析为结构化块列表（纯逻辑，无 DOM，可单测）。
 * 块类型：heading / para / list / table / quote / hr。
 * 文本字段均为已转义+行内 HTML 的结果。
 */
export function parseMarkdownBlocks(mdText) {
  const blocks = [];
  const lines = String(mdText || '').split(/\r?\n/);
  let i = 0;
  let inList = null; // { ordered, items[] }
  let tableRows = null;

  const flushList = () => {
    if (inList && inList.items.length) {
      blocks.push({ type: 'list', ordered: inList.ordered, items: inList.items.slice() });
    }
    inList = null;
  };
  const flushTable = () => {
    if (tableRows) {
      blocks.push({ type: 'table', rows: tableRows.slice() });
    }
    tableRows = null;
  };

  for (; i < lines.length; i++) {
    const raw = lines[i];
    let line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      flushTable();
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      flushTable();
      blocks.push({ type: 'hr' });
      continue;
    }

    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushList();
      flushTable();
      blocks.push({ type: 'heading', level: h[1].length, text: stripInline(h[2]), html: inlineHtml(h[2]) });
      continue;
    }

    if (trimmed.startsWith('|')) {
      flushList();
      const cells = trimmed.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) {
        continue; // 表头分隔行
      }
      if (!tableRows) tableRows = [];
      tableRows.push(cells);
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushList();
      flushTable();
      blocks.push({ type: 'quote', html: inlineHtml(trimmed.replace(/^>\s?/, '')) });
      continue;
    }

    const ul = trimmed.match(/^\s*[-*+]\s+(.*)$/);
    if (ul && !/^\s*[-*+]\s+$/.test(trimmed)) {
      if (!inList || inList.ordered) {
        flushList();
        inList = { ordered: false, items: [] };
      }
      inList.items.push(ul[1].trim());
      continue;
    }

    const ol = trimmed.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (ol) {
      if (!inList || !inList.ordered) {
        flushList();
        inList = { ordered: true, items: [] };
      }
      inList.items.push(ol[2].trim());
      continue;
    }

    flushList();
    flushTable();
    blocks.push({ type: 'para', html: inlineHtml(trimmed) });
  }
  flushList();
  flushTable();
  return blocks;
}

/** 去除强调标记的选择纯文本（用于标题的锚点 id 与目录文本）。 */
function stripInline(text) {
  return String(text).replace(/\*\*/g, '').replace(/\*/g, '');
}

/** 依据块列表构建正文 DOM。 */
function buildMdDom(mdText) {
  tocHeadings = [];
  const frag = document.createDocumentFragment();
  const blocks = parseMarkdownBlocks(mdText);

  for (const b of blocks) {
    switch (b.type) {
      case 'hr':
        frag.appendChild(document.createElement('hr'));
        break;
      case 'heading': {
        const level = b.level;
        const el = document.createElement(level <= 4 ? 'h' + level : 'h6');
        el.innerHTML = b.html;
        const safeId = ('h-' + level + '-' + b.text.replace(/\s+/g, '-').slice(0, 40)).replace(/[^\w\u4e00-\u9fa5-]/g, '');
        el.id = safeId;
        el.dataset.level = level;
        frag.appendChild(el);
        tocHeadings.push({ level, text: b.text, el });
        break;
      }
      case 'list': {
        const wrap = document.createElement(b.ordered ? 'ol' : 'ul');
        b.items.forEach((it) => {
          const li = document.createElement('li');
          li.innerHTML = inlineHtml(it);
          wrap.appendChild(li);
        });
        frag.appendChild(wrap);
        break;
      }
      case 'quote': {
        const quote = document.createElement('blockquote');
        quote.innerHTML = b.html;
        frag.appendChild(quote);
        break;
      }
      case 'table': {
        const table = document.createElement('table');
        b.rows.forEach((cells, ri) => {
          const tr = document.createElement('tr');
          cells.forEach((c) => {
            const cell = document.createElement(ri === 0 ? 'th' : 'td');
            cell.innerHTML = inlineHtml(c);
            tr.appendChild(cell);
          });
          table.appendChild(tr);
        });
        frag.appendChild(table);
        break;
      }
      default: {
        const p = document.createElement('p');
        p.innerHTML = b.html;
        frag.appendChild(p);
      }
    }
  }
  return { frag, headings: tocHeadings };
}

/** 收集标题层级，构建侧边目录 DOM。 */
function buildToc(headings) {
  const nav = document.createElement('nav');
  nav.className = 'rules-toc';
  headings.forEach((entry) => {
    const a = document.createElement('a');
    a.href = '#' + entry.el.id;
    a.textContent = entry.text;
    a.dataset.level = entry.level;
    a.dataset.target = entry.el.id;
    a.className = 'toc-item';
    nav.appendChild(a);
  });
  return nav;
}

/** 滚动监听：高亮当前可视标题，并同步侧边目录。 */
function attachScrollSpy(tocEls, container) {
  const targets = tocEls.map((a) => ({
    id: a.dataset.target,
    link: a,
    node: document.getElementById(a.dataset.target),
  }));
  const visible = [];
  const onScroll = () => {
    const containerRect = container.getBoundingClientRect();
    const buffer = 90;
    let currentId = null;
    for (const t of targets) {
      if (!t.node) continue;
      const r = t.node.getBoundingClientRect();
      if (r.top <= containerRect.top + buffer) currentId = t.id;
    }
    tocEls.forEach((a) => a.classList.toggle('active', a.dataset.target === currentId));
    // 高亮正文当前标题
    targets.forEach((t) => {
      if (t.node) t.node.classList.toggle('toc-anchor-active', t.id === currentId);
    });
    void visible;
  };
  container.addEventListener('scroll', onScroll);
  // 首次进入立即计算一次
  requestAnimationFrame(onScroll);
  // 暴露清理函数（页内切换时移除，避免重复绑定）
  container._scrollSpyCleanup = onScroll;
}

async function loadMd(file) {
  const res = await fetch(file, { cache: 'no-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.text();
}

/**
 * 渲染规则书页：写入 #app。
 * 若带 host 参数（测试/迁移用）则追加到 host。
 */
export async function renderRulesPage({ host = null } = {}) {
  const app = host || document.getElementById('app');
  app.innerHTML = '';

  // —— 顶层布局 ——
  const page = document.createElement('div');
  page.className = 'page';

  // 标题栏
  const masthead = document.createElement('header');
  masthead.className = 'masthead';
  const h1 = document.createElement('h1');
  h1.textContent = '规则书';
  const sub = document.createElement('p');
  sub.className = 'subtitle';
  //sub.textContent = '从规则书文档转写而来，可选择章节查看。内容仅供参考，以规则书原文为准。';
  masthead.appendChild(h1);
  masthead.appendChild(sub);
  page.appendChild(masthead);

  // 书选择器（横向胶囊按钮）
  const picker = document.createElement('div');
  picker.className = 'rules-picker';
  RULES.forEach((r) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rules-pick';
    b.textContent = r.title;
    b.dataset.rule = r.id;
    b.addEventListener('click', () => selectRule(r));
    picker.appendChild(b);
  });
  page.appendChild(picker);

  // 主区：侧边目录 + 正文
  const body = document.createElement('div');
  body.className = 'rules-body';

  const tocWrap = document.createElement('aside');
  tocWrap.className = 'rules-toc-wrap';

  const content = document.createElement('div');
  content.className = 'rules-md card-section';

  body.appendChild(tocWrap);
  body.appendChild(content);
  page.appendChild(body);
  app.appendChild(page);

  const pickBtns = () => page.querySelectorAll('.rules-pick');

  /** 加载并渲染指定规则书。 */
  async function selectRule(r) {
    pickBtns().forEach((b) => b.classList.toggle('active', b.dataset.rule === r.id));
    content.textContent = '';
    content.innerHTML = '<div class="rules-loading">加载中…</div>';
    tocWrap.innerHTML = '';
    try {
      const md = await loadMd(r.file);
      const { frag, headings } = buildMdDom(md);
      content.innerHTML = '';
      const article = document.createElement('article');
      article.className = 'rules-article';
      article.appendChild(frag);
      content.appendChild(article);

      if (headings.length) {
        const toc = buildToc(headings);
        tocWrap.appendChild(toc);
      }
      // 滚动监听（先试绑定到 content，拦截旧监听）
      if (content._scrollSpyCleanup) content.scrollTop = 0;
      attachScrollSpy(Array.from(tocWrap.querySelectorAll('.toc-item')), content);
    } catch (e) {
      content.innerHTML = '';
      content.appendChild(
        (function () {
          const d = document.createElement('div');
          d.className = 'rules-error';
          d.textContent = '规则书加载失败：' + (e && e.message ? e.message : e);
          return d;
        })()
      );
    }
  }

  // 默认选中第一本，并自动展示
  selectRule(RULES[0]);
}

export default renderRulesPage;
