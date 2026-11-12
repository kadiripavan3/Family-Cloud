// How the app's code is prepared for bundling: Expo's own set-up, plus one thing.
//
// Icons. `import { Check, X } from 'lucide-react-native'` reads as "two icons", but it pulls in the library's
// whole list of some two thousand, because the bundler can't tell which ones are used. The small plugin
// below rewrites each such import, as the code is built, to the icon's own file, which the library offers
// for exactly this (`lucide-react-native/icons/check`). The app's source stays as it is; only the icons that
// are used end up in the app.
const fs = require('fs');
const path = require('path');

/** Every icon's name, and the file it lives in, read from the library's own list. */
function iconFiles() {
  // (The library's main file sits in dist/cjs; its list of icons, one line each, is next door in dist/esm.)
  const list = fs.readFileSync(path.join(path.dirname(require.resolve('lucide-react-native')), '../esm/lucide-react-native.mjs'), 'utf8');
  const files = new Map();
  for (const [, names, file] of list.matchAll(/export \{([^}]+)\} from '\.\/icons\/([^']+)\.mjs'/g)) {
    for (const name of names.split(',')) files.set(name.trim().replace(/^default as /, ''), file);
  }
  return files;
}

function oneIconAtATime({ types: t }) {
  const files = iconFiles();
  return {
    name: 'one-icon-at-a-time',
    visitor: {
      ImportDeclaration(declaration) {
        const { node } = declaration;
        if (node.source.value !== 'lucide-react-native' || node.importKind === 'type') return;
        // Only a plain list of icons is rewritten. Anything else (a type, the whole library under one name)
        // is left exactly as it was written.
        const icons = node.specifiers.every((one) => t.isImportSpecifier(one) && one.importKind !== 'type' && t.isIdentifier(one.imported) && files.has(one.imported.name));
        if (!icons || node.specifiers.length === 0) return;
        declaration.replaceWithMultiple(
          node.specifiers.map((one) => t.importDeclaration([t.importDefaultSpecifier(t.identifier(one.local.name))], t.stringLiteral(`lucide-react-native/icons/${files.get(one.imported.name)}`))),
        );
      },
    },
  };
}

module.exports = function (api) {
  // Tests load the library as one ready-made file (see "moduleNameMapper" in package.json) and are left alone.
  const testing = api.env('test');
  return {
    presets: ['babel-preset-expo'],
    plugins: testing ? [] : [oneIconAtATime],
  };
};
