// Builds the Family Cloud Hub (design/hub/index.html): one page with the screens, design system,
// the name, the link with Journey, requirements, tech plan and design cues, generated from the repo.
// It is Journey's hub build (kadiripavan3/Journey, design/hub), with this app's shorthands added.
//
//   npm ci --prefix design/hub && npm run build --prefix design/hub
//   node design/hub/build.mjs --files   # prints the image list to publish with the page
//   node design/hub/build.mjs --icons   # copies the 3D icons the screens use from the Fluent Emoji package
//
// Sources: docs/*.md, design/tokens.json, design/hub/status.json and design/hub/src/*.
// The output is a page fragment for the Artifact tool, which adds <html>, <head> and <body>.
import { readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';

const HUB = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HUB, '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const src = (name) => readFileSync(join(HUB, 'src', name), 'utf8').trimEnd();
const tokens = JSON.parse(read('design/tokens.json'));
const status = JSON.parse(read('design/hub/status.json'));

const ASSET_DIRS = ['img', 'icons3d'];
if (process.argv.includes('--files')) {
  const files = ASSET_DIRS.flatMap((d) => readdirSync(join(HUB, d)).filter((f) => !f.startsWith('.')).sort().map((f) => ({ path: `${d}/${f}` })));
  console.log(JSON.stringify(files));
  process.exit(0);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (md) => new Marked().parseInline(String(md));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- docs: each one becomes a view; links between docs become links between views ---------- */
const DOCS = [
  { file: 'docs/03-name.md', view: 'name' },
  { file: 'docs/04-journey-link.md', view: 'together' },
  { file: 'docs/01-requirements.md', view: 'requirements' },
  { file: 'docs/02-tech-stack.md', view: 'tech' },
  { file: 'docs/05-design-brief.md', view: 'cues' },
];
const VIEW_OF = Object.fromEntries(DOCS.map((d) => [basename(d.file), d.view]));
const ARCH = src('architecture.html') + '\n';

// GitHub's heading anchors, kept to ASCII letters, digits and hyphens (the only # links a hub URL keeps).
const slugify = (text) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  .replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-');

function rewriteHref(href, view) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { href, external: true };
  if (href.startsWith('#')) return { href: `#${view}-${href.slice(1)}` };
  const [path, frag] = href.split('#');
  const target = VIEW_OF[basename(path)];
  if (target) return { href: frag ? `#${target}-${frag}` : `#${target}` };
  return null; // a repo file the hub doesn't show: keep the words, drop the link
}

function renderDoc(md, view) {
  const seen = new Map();
  const toc = [];
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading(text, level, raw) {
        let slug = slugify(raw);
        const n = seen.get(slug) || 0;
        seen.set(slug, n + 1);
        if (n) slug += `-${n}`;
        const id = `${view}-${slug}`;
        if (level === 2) toc.push(`<a href="#${id}">${esc(raw)}</a>`);
        return `<h${level} id="${id}">${text}</h${level}>\n`;
      },
      link(href, title, text) {
        const r = rewriteHref(href, view);
        if (!r) return text;
        const url = esc(encodeURI(r.href).replace(/%25/g, '%'));
        return `<a href="${url}"${title ? ` title="${title}"` : ''}${r.external ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
      },
      image(href, title, text) {
        // Doc images live in design/hub, next to the page.
        const url = esc(href.replace(/^(\.\.\/)*design\/hub\//, ''));
        return `<img src="${url}" alt="${text}" loading="lazy"${title ? ` title="${title}"` : ''}>`;
      },
      table(header, body) {
        return `<div class="table-wrap"><table>\n<thead>\n${header}</thead>\n${body ? `<tbody>${body}</tbody>` : ''}</table></div>\n`;
      },
      code(code, lang) {
        // The architecture chart is mermaid on GitHub and an HTML diagram in the hub.
        return (lang || '').trim().split(/\s/)[0] === 'mermaid' ? ARCH : false;
      },
    },
  });
  const html = marked.parse(md);
  return { html, toc: toc.length ? `<span class="label">On this page</span>${toc.join('')}` : '' };
}

function section(md, heading) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) throw new Error(`No section matching ${heading}`);
  const next = lines.findIndex((l, i) => i > start && /^#{1,2} /.test(l));
  return lines.slice(start + 1, next < 0 ? lines.length : next).join('\n');
}

const docs = Object.fromEntries(DOCS.map((d) => [d.view, renderDoc(read(d.file), d.view)]));
const decisions = renderDoc(section(read('docs/01-requirements.md'), /^## (\d+\.\s*)?Calls I made for this draft\s*$/), 'requirements').html;

/* ---------- tokens ---------- */
const ACC = tokens.accent;
const base = ACC.chosen || ACC.default;
if (!ACC.options[base]) throw new Error(`tokens.json: accent "${base}" is not one of the options`);
const BRAND = tokens.brand;
const brandBase = BRAND.chosen || BRAND.default;
if (!BRAND.options[brandBase]) throw new Error(`tokens.json: brand "${brandBase}" is not one of the options`);

function tokensCss() {
  const decls = (obj) => Object.entries(obj).map(([k, v]) => `--${k}: ${v};`).join(' ');
  const accent = (o) => `--accent: ${o.accent}; --on-accent: ${o.onAccent}; --accent-text-l: ${o.textLight}; --accent-text-d: ${o.textDark}; --accent-soft-l: ${o.softLight}; --accent-soft-d: ${o.softDark};`;
  const theme = (mode) => [
    decls(tokens.color[mode]),
    decls(tokens.shadow[mode]),
    mode === 'light' ? '--accent-text: var(--accent-text-l); --accent-soft: var(--accent-soft-l);' : '--accent-text: var(--accent-text-d); --accent-soft: var(--accent-soft-d);',
  ].join('\n  ');
  return [
    '/* Generated from design/tokens.json by design/hub/build.mjs. Change the tokens, not this block. */',
    `:root { --font: ${tokens.font.stack}; ${accent(ACC.options[base])} --on-photo: ${tokens.onPhoto.text}; --photo-glass: ${tokens.onPhoto.glass}; --photo-glass-line: ${tokens.onPhoto.glassLine}; }`,
    ...Object.entries(ACC.options).map(([k, o]) => `.app[data-accent="${k}"] { ${accent(o)} }`),
    '/* the name: every screen writes it with <span class="bn">, its web address with <span class="bd">, its mark with .bm */',
    `.bn::after { content: var(--bn, "${BRAND.options[brandBase].label}"); } .bd::after { content: var(--bd, "${BRAND.options[brandBase].domain}"); } .bm > svg { display: none; }`,
    ...Object.entries(BRAND.options).map(([k, o]) => `.app[data-name="${k}"] { --bn: "${o.label}"; --bd: "${o.domain}"; } .app[data-name="${k}"] .bm > .n-${k} { display: block; }`),
    '/* phone screens: light unless the theme switch, or the viewer\'s own setting on Auto, says dark */',
    `.ph {\n  ${theme('light')}\n}`,
    `.ph.always-dark, .app[data-screens="dark"] .ph, :root[data-theme="dark"] .app[data-screens="auto"] .ph {\n  ${theme('dark')}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) .app[data-screens="auto"] .ph {\n  ${theme('dark')}\n  }\n}`,
  ].join('\n');
}

const brandMark = (k, o) => `<span class="nm-mark"><svg class="ic"><use href="#i-${o.icon}"/></svg></span>`;
const nameButtons = Object.entries(BRAND.options).map(([k, o]) =>
  `<button type="button" id="nm-${k}" data-set-name="${k}" aria-pressed="${k === brandBase}">${brandMark(k, o)}${esc(o.label)}${k === BRAND.chosen ? ' (chosen)' : ''}</button>`).join('');
const nameCards = Object.entries(BRAND.options).map(([k, o]) =>
  `<button type="button" class="acc-card nm-card" id="namecard-${k}" data-set-name="${k}" aria-pressed="${k === brandBase}">${brandMark(k, o)}<b>${esc(o.label)}${k === BRAND.chosen ? ' · chosen' : k === BRAND.default ? ' · my pick' : ''}</b><span>${esc(o.line)}</span><code>${esc(o.domain)} · not checked for availability</code></button>`).join('\n');
const accentCards = Object.entries(ACC.options).map(([k, o]) =>
  `<div class="acc-card" aria-pressed="true"><i style="background:${o.accent}"></i><b>${esc(o.label)} · same as Journey</b><span>${esc(o.note)}</span><code>${o.accent} · ${esc(o.contrast)}</code></div>`).join('\n');
const accentIntro = 'Sun, the accent Journey uses. Buttons, the + tab, progress rings and ticks use it, so the two apps read as a pair.';

const SWATCHES = [['bg', 'Background'], ['surface', 'Surface'], ['fill', 'Fill'], ['line', 'Line'], ['muted', 'Muted text'], ['text', 'Text'],
  ['like', 'Love'], ['ok', 'Done, safe'], ['warn', 'Due soon'], ['danger', 'Overdue, delete'],
  ['tint-1', 'Tint 1'], ['tint-2', 'Tint 2'], ['tint-3', 'Tint 3'], ['tint-4', 'Tint 4'], ['tint-5', 'Tint 5']];
const swatches = (mode, label) => `<div><span class="label">${label}</span><ul aria-label="${label} theme">${SWATCHES.map(([k, name]) => {
  const v = tokens.color[mode][k];
  if (!v) throw new Error(`tokens.json: color.${mode}.${k} is missing`);
  return `<li><i style="background:${v}"></i>${name}<code>${v}</code></li>`;
}).join('')}</ul></div>`;

const typeSpecimens = tokens.type.map((t) => {
  const style = `font-size:${t.size}px; line-height:${t.line}px; font-weight:${t.weight}; letter-spacing:${t.tracking}em${t.caps ? '; text-transform:uppercase; color:var(--page-accent)' : ''}`;
  return `<div><span style="${style}">${esc(t.sample)}</span><code>${esc(t.name)} · ${t.size}/${t.line} · ${t.weight}${t.caps ? ' · caps' : ''}</code></div>`;
}).join('\n');
const radii = Object.entries(tokens.radius).map(([k, v]) =>
  `<li><i style="--r:${Math.min(v, 60)}px"></i>${cap(k)}<code>${v >= 999 ? 'full' : `${v}px`}</code></li>`).join('');
const spaces = tokens.space.map((s) => `<li><code>${s}</code><i style="--s:${s}"></i></li>`).join('');

/* ---------- screens: one file per group, in the order of src/screens/index.json ----------
   Each screen is written as <screen id title note [theme="dark"] [home="photo"] [class] [label]> ... </screen>.
   Inside it: <sb> or <sb photo> (status bar), [[icon classes]] (an icon from icons.svg),
   <kb>, <kb email> or <kb num> (keyboard), <tabbar active="home|people|activity|you" [dot]>,
   <vtabs active="today|plan|notes|library|money|vault"> (the search pill and the row of six places),
   {app} and {domain} (the name and its web address, whichever name is switched on), [[brand]] (its mark),
   <aud all|me|two> (who can see a thing), <tiles imgs="a,b,c"> (small photo tiles).
   The build adds the device frame, the camera island, the home indicator, the number and the caption. */
const ICONS = new Set([...src('icons.svg').matchAll(/<symbol id="i-([a-z0-9-]+)"/g)].map((m) => m[1]));
const icon = (name, classes = '') => {
  // The app's own mark: one drawing per candidate name, and the page shows the one that is switched on.
  if (name === 'brand') return Object.entries(BRAND.options).map(([k, o]) => icon(o.icon, `${classes} n-${k}`)).join('');
  if (!ICONS.has(name)) throw new Error(`Unknown icon "${name}" (add it to src/icons.svg)`);
  return `<svg class="ic${classes}"><use href="#i-${name}"/></svg>`;
};
const statusBar = (photo) => `<div class="sb${photo ? ' photo' : ''}"><span>9:41</span><svg width="73" height="13"><use href="#sbi"/></svg></div>`;
function keyboard(kind) {
  const key = (k, cls) => `<i${cls ? ` class="${cls}"` : ''}>${k}</i>`;
  const row = (s) => [...s].map((c) => key(c)).join('');
  if (kind === 'num') {
    const keys = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ']];
    return `<div class="kb num" aria-hidden="true"><div class="kpad">${keys.map(([d, l]) => `<i><b>${d}</b><small>${l}</small></i>`).join('')}<i class="blank"></i><i><b>0</b></i><i class="blank">${icon('backspace')}</i></div></div>`;
  }
  const bottom = kind === 'email'
    ? key('123', 'mod') + key('space', 'space') + key('@', 'mod sm') + key('.', 'mod sm') + key('go', 'mod go')
    : key('123', 'mod') + key(icon('smile'), 'mod sm') + key('space', 'space') + key('return', 'mod go');
  return `<div class="kb" aria-hidden="true"><div class="kr">${row('qwertyuiop')}</div><div class="kr k2">${row('asdfghjkl')}</div>`
    + `<div class="kr k3">${key(icon('shift'), 'mod')}${row('zxcvbnm')}${key(icon('backspace'), 'mod')}</div><div class="kr k4">${bottom}</div>`
    + `<div class="kb-foot">${icon('globe')}${icon('mic')}</div></div>`;
}
function tabbar(active, dot) {
  const tab = (id, label, name) => `<span class="tab${active === id ? ' on' : ''}">${icon(name)}${label}${id === 'activity' && dot ? '<i class="dot"></i>' : ''}</span>`;
  return `<div class="tabbar">${tab('home', 'Home', 'home')}${tab('people', 'People', 'users')}<span class="tab-plus">${icon('plus')}</span>`
    + `${tab('activity', 'Activity', 'bell')}<span class="tab${active === 'you' ? ' on' : ''}"><img src="img/av-me.jpg" alt="">You</span></div>`;
}
// The six places things live. Home's top row switches between them, the way Airbnb's does.
const PLACES = [
  ['today', 'Today', '🏡', 'Find anything', 'Notes · photos · bills · passwords'],
  ['plan', 'Plan', '📅', 'Find a date or a job', 'Events · reminders · lists · goals'],
  ['notes', 'Notes', '📓', 'Search notes', 'Pages · checklists · templates'],
  ['library', 'Library', '📷', 'Search the library', 'People · places · words in a scan'],
  ['money', 'Money', '💰', 'Search money', 'Bills · sheets · who owes who'],
  ['vault', 'Vault', '🔐', 'Search the Vault', 'Logins · cards · IDs · codes'],
];
function vtabs(active) {
  const cur = PLACES.find((p) => p[0] === active);
  if (!cur) throw new Error(`<vtabs active="${active}">: not one of ${PLACES.map((p) => p[0]).join(', ')}`);
  return `<div class="search">${icon('search')}<div class="q"><b>${cur[3]}</b><span>${cur[4]}</span></div><span class="round"><span class="em">👪</span></span></div>`
    + `<div class="cats six">${PLACES.map(([id, label, emoji]) => `<div class="cat${id === active ? ' on' : ''}"><span class="em">${emoji}</span>${label}</div>`).join('')}</div>`;
}
const AUD = {
  all: '<span class="aud"><span class="em">👪</span>The Linds</span>',
  me: () => `<span class="aud">${icon('lock')}Only you</span>`,
  two: '<span class="aud"><span class="stack sm"><img src="img/av-alex.jpg" alt=""><img src="img/av-me.jpg" alt=""></span>Alex and you</span>',
};
const aud = (kind) => {
  if (!AUD[kind]) throw new Error(`<aud ${kind}>: use all, me or two`);
  return typeof AUD[kind] === 'function' ? AUD[kind]() : AUD[kind];
};
const tiles = (list) => list.split(',').map((n) => `<i style="background-image:url(img/${n.trim()}.jpg)"></i>`).join('');
const expand = (body, where) => {
  const out = body
    .replace(/<sb( photo)?>/g, (m, p) => statusBar(!!p))
    .replace(/<kb(?: (email|num))?>/g, (m, k) => keyboard(k))
    .replace(/<tabbar active="([a-z]*)"( dot)?>/g, (m, a, d) => tabbar(a, !!d))
    .replace(/<vtabs active="([a-z]*)">/g, (m, a) => vtabs(a))
    .replace(/<aud ([a-z]+)>/g, (m, k) => aud(k))
    .replace(/<tiles imgs="([a-z0-9, -]+)">/g, (m, l) => tiles(l))
    .replace(/\{app\}/g, '<span class="bn"></span>').replace(/\{domain\}/g, '<span class="bd"></span>')
    .replace(/\[\[([a-z0-9-]+)((?: [a-z0-9-]+)*)\]\]/g, (m, n, c) => icon(n, c));
  const left = out.match(/\[\[|<sb\b|<kb\b|<tabbar\b|<vtabs\b|<aud\b|<tiles\b|\{app\}|\{domain\}/);
  if (left) throw new Error(`${where}: shorthand not understood near "${out.slice(left.index, left.index + 40)}"`);
  return out;
};
const SCREEN_RE = /<screen\s+([^>]*)>([\s\S]*?)<\/screen>/g;
const attrsOf = (s) => Object.fromEntries([...s.matchAll(/([a-z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const screenIds = new Set();
function renderScreen(a, body, num, where) {
  for (const k of ['id', 'title', 'note']) if (!a[k]) throw new Error(`${where}: a <screen> has no ${k}`);
  if (!/^[a-z0-9-]+$/.test(a.id)) throw new Error(`${where}: screen id "${a.id}" must be lowercase letters, digits and hyphens`);
  if (screenIds.has(a.id)) throw new Error(`${where}: screen id "${a.id}" is used twice`);
  screenIds.add(a.id);
  const classes = ['screen', 'ph', a.theme === 'dark' ? 'always-dark' : '', a.class || ''].filter(Boolean).join(' ');
  const named = (t) => t.replace(/\{app\}/g, '<span class="bn"></span>');
  const label = (a.label || `${a.title} screen. ${a.note}`).replace(/\{app\}/g, 'the app');
  return `<figure class="shot">
<div class="device" id="shot-${a.id}" data-comment-target role="img" aria-label="${label}">
<div class="${classes}">
<div class="island"></div>
${expand(body.trim(), `${where} #${a.id}`)}
<div class="home${a.home === 'photo' ? ' photo' : ''}"></div>
</div>
</div>
<figcaption><b><span class="n">${num}</span>${named(a.title)}</b><span>${named(a.note)}</span><button type="button" class="cbtn" data-comment-for="shot-${a.id}" hidden>${icon('msg')}Comment on this screen</button></figcaption>
</figure>`;
}
const screenGroups = JSON.parse(src('screens/index.json')).groups.map((g, gi) => {
  const where = `screens/${g.file}`;
  if (process.env.HUB_ALLOW_MISSING && !existsSync(join(HUB, 'src', where))) { console.warn(`(skipping ${where}: not written yet)`); return null; }
  const file = src(where);
  const shots = [...file.matchAll(SCREEN_RE)].map((m, si) => renderScreen(attrsOf(m[1]), m[2], `${gi + 1}.${si + 1}`, where));
  const stray = file.replace(SCREEN_RE, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  if (stray) throw new Error(`${where}: text outside <screen> blocks: "${stray.slice(0, 60)}"`);
  if (!shots.length) throw new Error(`${where}: no screens`);
  return { ...g, n: gi + 1, shots };
}).filter(Boolean);
const screenTotal = screenGroups.reduce((n, g) => n + g.shots.length, 0);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const screenSections = screenGroups.map((g) => `<section class="sg" id="screens-${g.id}" aria-labelledby="screens-${g.id}-h">
<div class="sg-head"><span class="sg-n">${g.n}</span><div><h2 id="screens-${g.id}-h">${esc(g.title)}${g.tag ? ` <span class="sg-tag">${esc(g.tag)}</span>` : ''}</h2><p>${esc(g.intro)}</p></div><span class="sg-count">${plural(g.shots.length, 'screen')}</span></div>
<div class="gallery">
${g.shots.join('\n')}
</div>
</section>`).join('\n');
const screenNav = screenGroups.map((g) => `<a href="#screens-${g.id}">${esc(g.title)}<span>${g.shots.length}</span></a>`).join('');

/* ---------- assemble ---------- */
const vars = {
  TOKENS_CSS: tokensCss(),
  STYLES: `${src('styles.css')}\n${src('phone.css')}`,
  ICONS: src('icons.svg'),
  APP_JS: src('app.js'),
  SCREEN_SECTIONS: screenSections,
  SCREEN_NAV: screenNav,
  SCREEN_SUMMARY: `${plural(screenTotal, 'screen')} in ${plural(screenGroups.length, 'group')}`,
  DEFAULT_ACCENT: base,
  DEFAULT_NAME: brandBase,
  NAME_BUTTONS: nameButtons,
  NAME_CARDS: nameCards,
  BRAND_MARK: icon('brand'),
  ACCENT_INTRO: accentIntro,
  SYS_ACCENTS: accentCards,
  SYS_LIGHT: swatches('light', 'Light'),
  SYS_DARK: swatches('dark', 'Dark'),
  SYS_TYPE: typeSpecimens,
  SYS_RADIUS: radii,
  SYS_SPACE: spaces,
  STATUS_PHASE: esc(status.phase),
  STATUS_SUMMARY: inline(status.summary),
  STATUS_NEXT: status.next.map((n) => `<li><span>${inline(n)}</span></li>`).join(''),
  STATUS_OPEN: status.open.map((o) => `<div class="q"><b>${esc(o.q)}</b><span>${inline(o.a)}</span></div>`).join(''),
  UPDATES: (status.updates || []).map((u) => `<li><time datetime="${u.date}">${fmtDate(u.date)}</time><span>${inline(u.text)}</span></li>`).join(''),
  DECISIONS: decisions,
  BUILT_AT: fmtDate(new Date().toISOString().slice(0, 10)),
  ...Object.fromEntries(DOCS.flatMap((d) => [[`DOC_${d.view.toUpperCase()}`, docs[d.view].html], [`TOC_${d.view.toUpperCase()}`, docs[d.view].toc]])),
};

const used = new Set();
let out = src('page.html').replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, key) => {
  if (!(key in vars)) throw new Error(`page.html uses ${m}, which build.mjs doesn't define`);
  used.add(key);
  return vars[key];
}) + '\n';
const unused = Object.keys(vars).filter((k) => !used.has(k));
if (unused.length) throw new Error(`build.mjs defines ${unused.join(', ')}, which page.html doesn't use`);

// Emoji in the screens are drawn as 3D icons (design/hub/icons3d, named by the emoji's code points) where one exists.
const EMOJI_PKG = join(HUB, 'node_modules', '@lobehub', 'fluent-emoji-3d', 'assets');
const flat = new Set();
const icon3d = (emoji) => {
  const points = [...emoji.trim()].map((c) => c.codePointAt(0).toString(16).padStart(4, '0'));
  const names = [points.join('-'), points.filter((p) => p !== 'fe0f').join('-')];
  for (const name of names) if (existsSync(join(HUB, 'icons3d', `${name}.webp`))) return `icons3d/${name}.webp`;
  // --icons: fetch the ones the screens use from the Fluent Emoji package (npm ci installs it).
  if (process.argv.includes('--icons')) {
    for (const name of names) {
      if (!existsSync(join(EMOJI_PKG, `${name}.webp`))) continue;
      copyFileSync(join(EMOJI_PKG, `${name}.webp`), join(HUB, 'icons3d', `${name}.webp`));
      console.log(`added icons3d/${name}.webp ${emoji}`);
      return `icons3d/${name}.webp`;
    }
  }
  flat.add(emoji.trim());
  return null;
};
out = out
  .replace(/<span class="em">([^<]+)<\/span>/g, (all, emoji) => { const src = icon3d(emoji); return src ? `<img class="em em3d" src="${src}" alt="">` : all; })
  .replace(/<span class="blob">([^<]+)<\/span>/g, (all, emoji) => { const src = icon3d(emoji); return src ? `<span class="blob"><img class="em3d" src="${src}" alt=""></span>` : all; });

// Every image the page shows must exist; images nobody shows are reported.
const refs = new Set([...out.matchAll(/(?:src="|url\()((?:img|icons3d)\/[^")\s]+)/g)].map((m) => m[1]));
const missing = [...refs].filter((r) => !existsSync(join(HUB, r)));
if (missing.length) throw new Error(`Missing images: ${missing.join(', ')}`);
const unshown = ASSET_DIRS.flatMap((d) => readdirSync(join(HUB, d)).map((f) => `${d}/${f}`)).filter((f) => !refs.has(f));

writeFileSync(join(HUB, 'index.html'), out);
if (flat.size) console.warn(`No 3D icon for: ${[...flat].join(' ')} (run with --icons after npm ci)`);
console.log(`Built design/hub/index.html: ${(out.length / 1024).toFixed(0)} KB, ${plural(screenTotal, 'screen')} in ${screenGroups.length} groups, ${refs.size} images${unshown.length ? `; not shown anywhere: ${unshown.join(', ')}` : ''}`);
