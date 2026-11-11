# The hub

One page with everything about the app: the screens, the name, the link with Journey, what it does, tech and costs, the design system and the cues. It is published at **https://claude.ai/artifact/Nj763e9HKBijnmANPhLLTA** and built from the files in this repo. The repo is the record; the page is a view of it.

The build is Journey's hub build (`design/hub` in the Journey repo) with this app's shorthands added.

## What each page is built from

| Hub page | Source |
|---|---|
| Overview | [`status.json`](status.json) and the "Calls I made for this draft" section of [`docs/01-requirements.md`](../../docs/01-requirements.md) |
| Screens | [`src/screens/`](src/screens/): one file per group, in the order of [`src/screens/index.json`](src/screens/index.json); styles in [`src/phone.css`](src/phone.css); photos in [`img/`](img/); 3D icons in [`icons3d/`](icons3d/) |
| The name | [`docs/03-name.md`](../../docs/03-name.md), and `brand` in [`design/tokens.json`](../tokens.json) |
| With Journey | [`docs/04-journey-link.md`](../../docs/04-journey-link.md) |
| What it does | [`docs/01-requirements.md`](../../docs/01-requirements.md) |
| Tech and costs | [`docs/02-tech-stack.md`](../../docs/02-tech-stack.md); [`src/architecture.html`](src/architecture.html) replaces its mermaid chart |
| Design system | [`design/tokens.json`](../tokens.json) |
| Cues | [`docs/05-design-brief.md`](../../docs/05-design-brief.md) |

The page shell is [`src/page.html`](src/page.html), with the hub's styles in [`src/styles.css`](src/styles.css), the phone screens' styles in [`src/phone.css`](src/phone.css), behaviour in [`src/app.js`](src/app.js) and icons in [`src/icons.svg`](src/icons.svg). [`build.mjs`](build.mjs) fills the shell's `{{PLACEHOLDERS}}`.

## Writing a screen

Each group file holds `<screen>` blocks. The build adds the phone frame, the camera island, the home indicator, the number and the caption with its Comment button.

```html
<screen id="bill" title="A bill" note="The caption under the phone." [theme="dark"] [home="photo"] [class="s-bill"] [label="Screen-reader description"]>
  <sb>                           status bar (<sb photo> for white text on a photo)
  [[key]] [[star f]]             an icon from src/icons.svg, with extra classes after the name
  [[brand]]                      the app's own mark, whichever name is switched on
  {app} {domain}                 the app's name and its web address, whichever name is switched on
  <vtabs active="money">         the search pill and the row of six places: today, plan, notes, library, money, vault
  <tabbar active="home" dot>     the tab bar: home, people, activity or you; dot marks Activity
  <aud all> <aud two> <aud me>   the audience chip: the circle, Alex and you, only you
  <tiles imgs="canoe,pug">       small photo tiles, by file name in img/
  <kb> <kb email> <kb num>       the phone's keyboard
  ...the screen's own HTML, using the shared components in src/phone.css...
</screen>
```

Rules the build checks: ids are unique and use lowercase letters, digits and hyphens; every icon exists; nothing sits outside a `<screen>` block; every image exists.

Class names in `phone.css` and `styles.css` share one page. `phone.css` begins with Journey's file, unchanged, and this app's parts follow under "Family Cloud". New classes take a short prefix for their group (`nt-` notes, `lb-` library, `pl-` plan, `mn-` and `sh-` money and sheets, `vt-` vault, `jl-` the link with Journey, `jt-` jot, `ks-` keepsakes, `pk-` fair and fun), and must not reuse a name either file already has (`.dots` did, once).

## The name switch

The app has no final name. `brand.options` in `design/tokens.json` lists the candidates; the Screens page has a switch, and `{app}`, `{domain}` and `[[brand]]` follow it. When the owner chooses, set `brand.chosen` and rebuild.

## Build

```sh
npm ci --prefix design/hub
npm run build --prefix design/hub      # writes design/hub/index.html (not committed)
npm run icons --prefix design/hub      # the same, and copies any 3D icon a screen newly uses
node design/hub/build.mjs --files      # lists the images to publish with the page
```

## Publish

Claude publishes `design/hub/index.html` with the Artifact tool to the same URL, with `root` set to `design/hub`, `files` set to the `--files` list, and `capabilities` set to `{"comments": {"composer_only": true}}`. That capability makes the Comment buttons open claude.ai's own comment box.

## Rules

- Change the sources, never the built page.
- Colours, type and shapes live only in `design/tokens.json`, and match Journey's.
- Links between views are plain `#names`. claude.ai reserves `settings`, `sidebar`, `customize`, `upgrade`, `downloads` and `comment-*`.
- 3D icons are Microsoft's Fluent Emoji (MIT licence), from the `@lobehub/fluent-emoji-3d` package, one WebP per emoji, named by its code points. The build draws them wherever a screen has `<span class="em">` or `<span class="blob">` with that emoji.
- Photos are from Unsplash via Lorem Picsum and are credited in the footer of `src/page.html`. People, names, bills and passwords in the screens are made up.
