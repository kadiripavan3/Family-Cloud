// Walks through the app the way a new person would, in the web build, against the local API. It takes a
// screenshot of every screen and stops at the first thing that doesn't work, leaving a picture of it.
//
// Each milestone's steps are a file of their own in `steps/`, numbered in the order they run
// (`01-spine.js`, …). A steps file exports `async function run(ctx)`; `ctx` is what `lib.js` hands out: the
// page, `step`, `shot`, and the rest. Add to the milestone's file when you add a screen, and start a new file
// with a new milestone. Steps that load the app afresh (opening a link) come last in their file.
//
// Before running: the API on port 8080 with the local profile, and the web build served on 8081
// (`node scripts/e2e/serve.js <dist> 8081`). Other addresses: set API_URL and WEB_URL, and build the web
// app with EXPO_PUBLIC_API_URL set to the same API address.
// usage: node scripts/e2e/walkthrough.js <outDir> <light|dark>      (ONLY=<file name without .js> for one part)
const fs = require('fs');
const path = require('path');
const { start } = require('./lib');

const STEPS = path.join(__dirname, 'steps');

(async () => {
  const [out, scheme] = process.argv.slice(2);
  if (!out || !['light', 'dark'].includes(scheme)) throw new Error('usage: node scripts/e2e/walkthrough.js <outDir> <light|dark>');
  fs.mkdirSync(out, { recursive: true });
  // ONLY=06-vault (or several, with commas) walks just those files: for whoever is working on one part.
  const only = (process.env.ONLY || '').split(',').map((name) => name.trim()).filter(Boolean);
  const milestones = fs.readdirSync(STEPS).filter((file) => /^\d\d-[\w-]+\.js$/.test(file) && (only.length === 0 || only.includes(file.replace(/\.js$/, '')))).sort();
  const ctx = await start(out, scheme);
  try {
    for (const file of milestones) {
      console.log('milestone', file);
      await require(path.join(STEPS, file)).run(ctx);
    }
    console.log('errors', JSON.stringify(ctx.errors.slice(0, 10), null, 1));
  } finally {
    await ctx.browser.close();
  }
})().catch((e) => {
  console.error('FLOW FAILED:', e.message);
  process.exit(1);
});
