// Milestone 6, the Vault: passwords and codes scrambled on the phone, sharing one, the Vault key and
// helpers, emergency access, and a door code on a guest pass.
//
// It is walked as several people on several phones, because nearly everything here is about what one person
// can open and another can't:
//   Nora (nora@example.com, in the sample family) sets up her Vault and saves her key. Sam, a new person,
//   joins her circle and sets up his. Nora adds a login and shares it three ways in turn; Sam reads it, then
//   can only use it, then has lost it. A code that is gone after one look. Locking and unlocking. A third
//   phone of Nora's that is let in by the typed Vault key. Emergency access from turning it on to Sam reading
//   what was entrusted, with the two days skipped by moving the clock in the database. Helpers, a recovery
//   on a new phone, and a new Vault key. A guest pass whose web page opens a door code sealed on Nora's phone.
//
// Along the way it reads the API's database directly and fails if any row holds something that should never
// have left a phone: the password, the one-time code secret, the note, the Vault key, a passcode.
//
// The database is reached with psql. DB_URL says where it is when it is not the API's own default
// (postgresql://homeport:homeport@localhost:5432/homeport). Nora's Vault is put back to "never set up" before
// and after, so the walk can run twice (light and dark) and leaves the sample circle as it found it.
const { execFileSync } = require('child_process');
const { VIEWPORT } = require('../lib');

const DB_URL = process.env.DB_URL || 'postgresql://homeport:homeport@localhost:5432/homeport';
const db = (sql) => execFileSync('psql', [DB_URL, '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim();

const NORA = 'nora@example.com';
/** Every table the Vault writes to, and the two a sealed card on a guest pass lives in. */
const TABLES = ['vaults', 'things', 'vault_items', 'vault_grants', 'vault_emergencies', 'vault_emergency_items', 'vault_helpers', 'vault_recoveries', 'vault_recovery_shares', 'vault_notices', 'guest_passes', 'guest_pass_cards'];
const KEY_SHAPE = /^([A-HJ-NP-Z2-9]{4} ){5}[A-HJ-NP-Z2-9]{4}$/;

/** Fails when any row of the Vault's tables holds one of these, in any of the spellings a careless request could carry it in. */
function noRowHolds(what, secrets) {
  const stored = TABLES.map((table) => db(`select coalesce(string_agg(t::text, ' '), '') from ${table} t`)).join('\n');
  for (const secret of secrets.filter(Boolean)) {
    const bytes = Buffer.from(secret, 'utf8');
    for (const spelling of [secret, secret.replace(/ /g, ''), bytes.toString('base64url'), bytes.toString('base64').replace(/=+$/, ''), bytes.toString('hex')]) {
      if (spelling.length >= 6 && stored.includes(spelling)) throw new Error(`the database holds ${what} in the clear`);
    }
  }
}

/** Puts a person's Vault back to "never set up", with everything they made in it. The sample items stay. */
function forgetVaultOf(email) {
  const user = db(`select id from local_users where email = '${email}'`);
  if (!user) return;
  db(`
    delete from guest_passes where id in (select pass_id from guest_pass_cards);
    delete from things where kind = 'vault_item' and id in (select thing_id from vault_items where ciphertext <> 'sample-item-not-scrambled')
      and owner_id in (select id from members where user_id = '${user}');
    delete from vault_emergencies where owner_id = '${user}' or trusted_id = '${user}';
    delete from vault_helpers where owner_id = '${user}' or helper_id = '${user}';
    delete from vault_recoveries where owner_id = '${user}';
    delete from vault_notices where user_id = '${user}';
    delete from vaults where user_id = '${user}';
  `);
}

exports.run = async function run(ctx) {
  const { page, step, tag, WEB_URL, CODE, browser, scheme } = ctx;
  const PASSWORD = `Walk-${tag}-through!9`;
  const CHANGED = `Changed-${tag}-later!7`;
  const TOTP = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const DOOR = `4821-${tag}-then-star`;
  const NOTE = `The will is in the blue folder ${tag}. Call Jonas first.`;
  const PASSCODE = { nora: `nora-pass-${tag}`, sam: `sam-pass-${tag}`, ida: `ida-pass-${tag}`, third: `third-pass-${tag}`, fourth: `fourth-pass-${tag}` };
  const secrets = () => [PASSWORD, CHANGED, TOTP, DOOR, NOTE, vaultKey, newVaultKey, ...Object.values(PASSCODE)];
  let vaultKey = '';
  let newVaultKey = '';
  let nora;
  let linds;
  let sam;
  let ida;

  /** What the steps use of a phone, by the person on it. `me` is the first phone, Nora's. */
  const me = { page, T: ctx.T, R: ctx.R, L: ctx.L, shot: ctx.shot };
  /** A phone of someone who has an account already: their own browser, signed in through the screens. */
  const phoneOf = async (email) => {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: scheme, permissions: ['clipboard-read', 'clipboard-write'] });
    const theirs = await context.newPage();
    theirs.on('pageerror', (e) => ctx.errors.push('pageerror: ' + e.message));
    const T = (...a) => theirs.getByText(...a).last();
    const R = (...a) => theirs.getByRole(...a).last();
    const L = (...a) => theirs.getByLabel(...a).last();
    await theirs.goto(WEB_URL + '/');
    await T('Get started').waitFor({ timeout: 20000 });
    await R('button', { name: 'I already have an account' }).click();
    await R('button', { name: 'Continue with email' }).click();
    await L('Email', { exact: true }).fill(email);
    await R('button', { name: 'Send code' }).click();
    await T('Check your email').waitFor();
    await L('6-digit code').fill(CODE);
    await theirs.getByRole('tab', { name: 'Home' }).last().waitFor({ timeout: 20000 });
    const shot = async (name) => {
      await theirs.waitForTimeout(900);
      await theirs.screenshot({ path: `${ctx.out}/${scheme}-vault-${name}.png` });
    };
    return { page: theirs, T, R, L, shot, close: () => context.close() };
  };

  /** To the Vault's place under Home, from anywhere under the tabs. */
  const toVault = async (who) => {
    await who.page.goto(WEB_URL + '/?place=vault');
    await who.R('tab', { name: 'Vault' }).waitFor({ timeout: 20000 });
  };
  /** The Vault of this phone, unlocked: with the passcode when it has locked itself meanwhile. */
  const unlocked = async (who, passcode) => {
    await toVault(who);
    const drawers = who.page.getByRole('button', { name: /^Logins, \d+$/ }).last();
    const lockedNow = who.page.getByRole('button', { name: 'Unlock with your passcode' }).last();
    await drawers.or(lockedNow).waitFor({ timeout: 20000 });
    if (await lockedNow.isVisible().catch(() => false)) {
      await lockedNow.click();
      await who.L('Passcode', { exact: true }).fill(passcode);
      await who.R('button', { name: 'Unlock', exact: true }).click();
    }
    await drawers.waitFor({ timeout: 30000 });
  };
  /** A new person joins The Linds by the link its owner would send them. */
  const join = async (who) => {
    await who.page.goto(`${WEB_URL}/join/${linds.joinUrl.split('/').pop()}`);
    await who.R('heading', { name: 'Join The Linds?' }).waitFor({ timeout: 20000 });
    await who.R('button', { name: 'Join', exact: true }).click();
    await who.R('button', { name: 'The Linds. Change circle' }).waitFor({ timeout: 20000 });
  };
  /** Sets a Vault up from its place under Home, and returns the Vault key the screen showed once. */
  const setUp = async (who, passcode, shots) => {
    await toVault(who);
    await who.T('Set up your Vault').waitFor();
    if (shots) await who.shot('vault-not-set-up');
    await who.R('button', { name: 'Set up my Vault' }).click();
    await who.T('Scrambled before it leaves').waitFor();
    // Said plainly where the passcode is chosen: this is a preview, not a place for real secrets.
    await who.T('The browser preview is for trying things out').waitFor();
    await who.L('A passcode for this browser').fill(passcode);
    await who.L('The same passcode again').fill(passcode);
    if (shots) await who.shot('vault-setup');
    await who.R('button', { name: 'Make my keys' }).click();
    await who.R('heading', { name: 'Your Vault key' }).waitFor({ timeout: 30000 });
    const key = await who.page.getByTestId('vault-key').last().getAttribute('aria-label');
    if (!KEY_SHAPE.test(key)) throw new Error(`the Vault key on screen has another shape: ${key}`);
    return key;
  };

  await step('vault-reset', async () => {
    forgetVaultOf(NORA);
    // Whoever an earlier walk that stopped half-way left behind in the sample circle leaves it now.
    for (const email of db("select email from local_users where email ~ '^(sam|ida)\\.vault\\.'").split('\n').filter(Boolean)) {
      const token = (await ctx.api(null, 'POST', '/local-auth/token', { email, code: CODE })).accessToken;
      await ctx.api(token, 'DELETE', '/v1/me').catch(() => undefined);
    }
    if (page.url() === 'about:blank') await page.goto(WEB_URL + '/');
    await ctx.T('Get started').waitFor({ timeout: 20000 });
    await ctx.signIn(NORA);
    nora = (await ctx.api(null, 'POST', '/local-auth/token', { email: NORA, code: CODE })).accessToken;
    linds = (await ctx.api(nora, 'GET', '/v1/circles')).find((circle) => circle.name === 'The Linds');
  });

  await step('vault-set-up', async () => {
    vaultKey = await setUp(me, PASSCODE.nora, true);
    // 9.6 Your Vault key, the first time: shown once, with its code for a camera, to save or print.
    await me.T("we can't reset it for you").waitFor();
    await page.getByTestId('vault-key-qr').last().waitFor();
    await me.T('If you lose it').waitFor();
    await me.R('button', { name: /^Add a helper/ }).waitFor();
    await me.shot('vault-key');
    await me.R('button', { name: 'Copy', exact: true }).click();
    await me.T(/^Copied\. This page clears it from the clipboard after 60 seconds/).waitFor();
    if ((await page.evaluate(() => navigator.clipboard.readText())) !== vaultKey) throw new Error('Copy did not copy the Vault key');
    await me.R('button', { name: 'Save as PDF' }).click();
    // The API holds a public key and a wrapped private key, and has never seen the Vault key or the passcode.
    const row = db(`select public_key, wrapped_private_key, key_saved_at is null from vaults v join local_users u on u.id = v.user_id where u.email = '${NORA}'`);
    if (!/^[\w-]{43}\|[\w-]{98}\|t$/.test(row)) throw new Error(`the Vault's row is not what was expected: ${row}`);
    noRowHolds('the Vault key or the passcode', secrets());
    await me.R('button', { name: "I've saved my key" }).click();
  });

  await step('vault-home', async () => {
    // 9.2 The Vault: the six drawers with their counts, what needs a look, what others shared, and the countdown.
    await me.R('button', { name: /^Logins, 5$/ }).waitFor({ timeout: 20000 });
    for (const drawer of [/^Cards, 1$/, /^IDs, 3$/, /^Wi‑Fi, 1$/, /^Codes, 2$/, /^Secrets, 1$/]) await me.R('button', { name: drawer }).waitFor();
    await me.T('Two passwords need a look').waitFor();
    await me.T('One is used in more than one place. One showed up in a known leak.').waitFor();
    await me.T('Shared with you').waitFor();
    await me.T('Netflix').waitFor();
    await me.T(/^Locks itself in [01]:\d\d$/).waitFor();
    await me.shot('vault');
    if (db(`select key_saved_at is not null from vaults v join local_users u on u.id = v.user_id where u.email = '${NORA}'`) !== 't') throw new Error('"I\'ve saved my key" was not noted');
  });

  await step('vault-sample-item', async () => {
    // The sample items were never scrambled: they say so, and offer nothing to open, share or change.
    await me.R('button', { name: /^Netflix\./ }).click();
    await me.R('heading', { name: 'Netflix' }).waitFor();
    await me.T('Sample item').waitFor();
    await me.T(/^Add your own to see the real thing\./).waitFor();
    await me.shot('vault-item-sample');
    await me.R('button', { name: 'Back' }).click();
  });

  // ---------- two people ----------

  await step('vault-second-person', async () => {
    // Sam is new. He joins Nora's circle by its link and sets up his Vault.
    sam = await ctx.second('Sam Vault');
    await join(sam);
    await setUp(sam, PASSCODE.sam, false);
    await sam.R('button', { name: "I've saved my key" }).click();
    await sam.R('button', { name: /^Logins, \d+$/ }).waitFor({ timeout: 20000 });
  });

  /** The id of a thing from the address of its screen. */
  const idIn = (url) => url.split('?')[0].split('/').pop();
  /** The one-time codes that are right about now, worked out here from the same secret, apart from the app. */
  const codesNow = () => {
    const key = Buffer.from('12345678901234567890', 'ascii'); // what TOTP above spells in base32
    return [-1, 0, 1].map((step) => {
      const counter = Buffer.alloc(8);
      counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + step));
      const mac = require('crypto').createHmac('sha1', key).update(counter).digest();
      const at = mac[19] & 15;
      const digits = String((mac.readUInt32BE(at) & 0x7fffffff) % 1000000).padStart(6, '0');
      return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    });
  };
  let login;
  let door;
  let current = PASSWORD;
  const title = `Streaming ${tag}`;
  const shed = `Shed code ${tag}`;

  await step('vault-add-login', async () => {
    await unlocked(me, PASSCODE.nora);
    await me.R('button', { name: /^Logins, 5$/ }).click();
    await me.R('heading', { name: 'Logins' }).waitFor();
    await me.R('button', { name: /^Bank\./ }).waitFor();
    await me.shot('vault-drawer');
    await me.R('button', { name: 'Add', exact: true }).click();
    await me.R('heading', { name: 'New login' }).waitFor();
    await me.L('Title', { exact: true }).fill(title);
    await me.L('Site', { exact: true }).fill('stream.example');
    await me.L('Email or username').fill('linds.home@example.com');
    // A password made on the phone: twenty characters, shown so it can be read.
    await me.R('button', { name: 'Make a strong password' }).click();
    const made = await me.L('Password', { exact: true }).inputValue();
    if (!/^[a-km-zA-HJ-NP-Z2-9!#$%&*+\-=?@^_]{20}$/.test(made)) throw new Error(`the generated password has another shape: ${made.length} characters`);
    // A weak one is called weak before it is saved.
    await me.L('Password', { exact: true }).fill('sunshine');
    await me.T('This one is weak: short, or all of one kind.').waitFor();
    await me.L('Password', { exact: true }).fill(PASSWORD);
    await me.L('One-time code secret').fill('gezd gnbv gy3t qojq gezd gnbv gy3t qojq');
    await me.shot('vault-item-new');
    await me.R('button', { name: 'Add', exact: true }).click();
    // 9.3 A password: the email, the password as dots, a one-time code that counts down, who can use it, the verdict.
    await me.R('heading', { name: title }).waitFor({ timeout: 20000 });
    login = idIn(page.url());
    await me.T('linds.home@example.com').waitFor();
    const code = await me.T(/^\d{3} \d{3}$/).textContent();
    if (!codesNow().includes(code)) throw new Error(`the one-time code on screen (${code}) is not the one RFC 6238 gives for this moment`);
    if (await page.getByText(PASSWORD).count()) throw new Error('the password is on screen before the eye was pressed');
    await me.T("It's yours").waitFor();
    await me.T('Strong, and not used twice').waitFor();
    await me.T(/Not checked against known leaks: no leak check is connected yet\.$/).waitFor();
    await me.shot('vault-item');
    await me.R('button', { name: 'Show password' }).click();
    await me.T(PASSWORD).waitFor();
    await me.R('button', { name: 'Hide password' }).click();
    await me.T(PASSWORD).waitFor({ state: 'detached' });
    // Copying without showing, and the page says when the clipboard is cleared.
    await me.R('button', { name: 'Copy password' }).click();
    await me.T(/^Copied\. This page clears it from the clipboard after 60 seconds/).waitFor();
    if ((await page.evaluate(() => navigator.clipboard.readText())) !== PASSWORD) throw new Error('Copy did not copy the password');
    // What the API stored: labels in the clear, the phone's verdict, and one scrambled piece.
    const row = db(`select t.title, t.audience, v.site, v.health, v.version, v.ciphertext ~ '^[A-Za-z0-9_-]+$' from vault_items v join things t on t.id = v.thing_id where v.thing_id = '${login}'`);
    if (row !== `${title}|me|stream.example|ok|1|t`) throw new Error(`the item's row is not what was expected: ${row}`);
    noRowHolds('the password or the one-time code secret', secrets());
  });

  await step('vault-share-see', async () => {
    // 9.4 Share a secret: who, one of three ways, gone after one look, or until an evening.
    await me.R('button', { name: /^Share with someone/ }).click();
    await me.T(`Share “${title}”`).waitFor();
    await me.R('checkbox', { name: 'Share with Sam' }).click();
    // Mia has no sign-in of her own: nothing can be sealed for her, and the sheet says so.
    await me.R('checkbox', { name: 'Share with Mia' }).click();
    await me.T(/^Mia has no sign-in of their own, so nothing can be sealed for them\./).waitFor();
    // "Can use" is a rule of the app, and the sheet says so in the protocol's words.
    await me.T(/is a rule of the app, not of the mathematics\./).waitFor();
    await me.T("Gone after it's opened once").waitFor();
    await me.T('Stops working').waitFor();
    await me.shot('vault-share');
    await me.R('radio', { name: /^Can see\./ }).click();
    await me.R('button', { name: 'Share with 1 person' }).click();
    await me.R('button', { name: 'Sam: Can see. Change' }).waitFor({ timeout: 20000 });
    // Sam, on his own phone, opens it with nothing but his own key and reads the same password.
    await unlocked(sam, PASSCODE.sam);
    await sam.R('button', { name: new RegExp(`^${title}\\. From Nora · you can see it`) }).click();
    await sam.R('heading', { name: title }).waitFor();
    await sam.R('button', { name: 'Show password' }).click();
    await sam.T(PASSWORD).waitFor();
    await sam.T("It's theirs", { exact: false }).or(sam.T('It is theirs')).waitFor();
    await sam.shot('vault-item-shared');
    noRowHolds('the password', secrets());
  });

  await step('vault-edit', async () => {
    // Nora changes the password: the same item key, a new scrambled piece, a new version. Sam reads the new one.
    await me.R('button', { name: 'Edit' }).click();
    await me.R('heading', { name: 'Edit' }).waitFor();
    await me.L('Password', { exact: true }).fill(CHANGED);
    await me.shot('vault-item-edit');
    await me.R('button', { name: 'Save', exact: true }).click();
    await me.R('heading', { name: 'Edit' }).waitFor({ state: 'detached', timeout: 20000 });
    await me.R('button', { name: 'Show password' }).click();
    await me.T(CHANGED).waitFor();
    current = CHANGED;
    if (db(`select version from vault_items where thing_id = '${login}'`) !== '2') throw new Error('saving a change did not make a new version');
    await sam.R('button', { name: 'Back' }).click();
    await sam.R('button', { name: new RegExp(`^${title}\\. From Nora`) }).click();
    await sam.R('button', { name: 'Show password' }).click();
    await sam.T(CHANGED).waitFor();
    noRowHolds('the changed password', secrets());
  });

  await step('vault-share-use', async () => {
    // "Can use, can't keep": the app never shows it to Sam, and offers "copy once".
    await me.R('button', { name: 'Sam: Can see. Change' }).click();
    await me.T(`Sam and “${title}”`).waitFor();
    await me.R('radio', { name: /^Can use, can't keep\./ }).click();
    await me.shot('vault-share-one-person');
    await me.R('button', { name: 'Share with 1 person' }).click();
    await me.R('button', { name: 'Sam: Can use. Change' }).waitFor({ timeout: 20000 });
    await sam.R('button', { name: 'Back' }).click();
    await sam.R('button', { name: new RegExp(`^${title}\\. From Nora · you can use it`) }).click();
    await sam.T('You can use this, not see it').waitFor();
    await sam.T(/is a rule of this app, not of the mathematics\./).waitFor();
    await sam.R('button', { name: 'Copy password once' }).waitFor();
    if (await sam.page.getByRole('button', { name: 'Show password' }).count()) throw new Error('someone who can only use it was offered the eye');
    if (await sam.page.getByText(current).count()) throw new Error('someone who can only use it was shown the password');
    await sam.shot('vault-item-use');
    await sam.R('button', { name: 'Copy password once' }).click();
    await sam.T(/^Copied\./).waitFor();
    if ((await sam.page.evaluate(() => navigator.clipboard.readText())) !== current) throw new Error('"Copy once" did not copy the password');
  });

  await step('vault-share-remove', async () => {
    // Taking it back gives the item a new key in the same step. It is gone for Sam.
    await me.R('button', { name: 'Sam: Can use. Change' }).click();
    await me.R('checkbox', { name: 'Share with Sam' }).click();
    await me.T(/^Sam may have kept what they saw\. The item gets a new key now/).waitFor();
    await me.shot('vault-share-remove');
    await me.R('button', { name: 'Stop sharing' }).click();
    await me.R('button', { name: 'Sam: Can use. Change' }).waitFor({ state: 'detached', timeout: 20000 });
    // Nora's own page opens it again with the new key.
    await me.R('button', { name: 'Show password' }).waitFor({ timeout: 20000 });
    const row = db(`select v.version, t.audience, (select count(*) from vault_grants g where g.thing_id = v.thing_id) from vault_items v join things t on t.id = v.thing_id where v.thing_id = '${login}'`);
    if (row !== '3|me|1') throw new Error(`after taking it back the item's row is not what was expected: ${row}`);
    // The API hands Sam nothing any more, and his Vault doesn't list it.
    const handed = await fetch(`${ctx.API_URL}/v1/vault/items/${login}/open`, { method: 'POST', headers: { Authorization: 'Bearer ' + sam.token } });
    if (handed.status !== 404) throw new Error(`a removed person was answered ${handed.status} when asking for the item`);
    await sam.R('button', { name: 'Back' }).click();
    await sam.R('button', { name: /^Logins, \d+$/ }).waitFor();
    await sam.R('button', { name: new RegExp(`^${title}\\.`) }).waitFor({ state: 'detached', timeout: 20000 });
  });

  await step('vault-once', async () => {
    // A door code, shared for one look.
    await me.R('button', { name: 'Back' }).click();
    await me.R('heading', { name: 'Logins' }).waitFor();
    await me.R('button', { name: 'Back' }).click();
    await me.R('button', { name: /^Codes, 2$/ }).click();
    await me.R('heading', { name: 'Codes' }).waitFor();
    await me.R('button', { name: 'Add', exact: true }).click();
    await me.R('heading', { name: 'New code' }).waitFor();
    await me.L('Title', { exact: true }).fill(shed);
    await me.L('Label', { exact: true }).fill('shed');
    await me.L('Code', { exact: true }).fill(DOOR);
    await me.R('button', { name: 'Add', exact: true }).click();
    await me.R('heading', { name: shed }).waitFor({ timeout: 20000 });
    door = idIn(page.url());
    await me.R('button', { name: /^Share with someone/ }).click();
    await me.R('checkbox', { name: 'Share with Sam' }).click();
    await me.R('radio', { name: /^Can see\./ }).click();
    await me.R('switch', { name: "Gone after it's opened once" }).click();
    await me.shot('vault-share-once');
    await me.R('button', { name: 'Share with 1 person' }).click();
    await me.R('button', { name: 'Sam: Can see. Change' }).waitFor({ timeout: 20000 });
    await me.T('Gone for them after one look').waitFor();

    await unlocked(sam, PASSCODE.sam);
    await sam.R('button', { name: new RegExp(`^${shed}\\. From Nora · you can see it`) }).click();
    // Opening is the one look, so it doesn't open by itself.
    await sam.T('You can open this once').waitFor();
    await sam.shot('vault-item-once');
    await sam.R('button', { name: 'Open it now' }).click();
    await sam.T('This was the one look').waitFor({ timeout: 20000 });
    await sam.R('button', { name: 'Show code' }).click();
    await sam.T(DOOR).waitFor();
    const grant = db(`select g.wrapped_key is null, g.used_at is not null from vault_grants g join members m on m.id = g.member_id join local_users u on u.id = m.user_id where g.thing_id = '${door}' and u.email = '${sam.email}'`);
    if (grant !== 't|t') throw new Error(`the one look did not use the key up: ${grant}`);
    // A second look: there is none.
    await sam.R('button', { name: 'Back' }).click();
    await sam.R('button', { name: new RegExp(`^${shed}\\. From Nora · opened once, gone now`) }).click();
    await sam.T('You opened this once').waitFor();
    if (await sam.page.getByText(DOOR).count()) throw new Error('a code that was for one look is shown a second time');
    const again = await fetch(`${ctx.API_URL}/v1/vault/items/${door}/open`, { method: 'POST', headers: { Authorization: 'Bearer ' + sam.token } });
    if (again.status !== 403) throw new Error(`a second look was answered ${again.status}`);
    noRowHolds('the door code', secrets());
  });

  // ---------- locking, and another phone ----------

  await step('vault-lock', async () => {
    // 9.1 The Vault, locked. Locking by hand; a wrong passcode opens nothing; the right one does.
    await unlocked(me, PASSCODE.nora);
    await me.R('button', { name: 'Lock the Vault now' }).click();
    await me.T('The Vault is locked').waitFor();
    await me.T(/^Passwords, cards, IDs and door codes\. Scrambled on this phone before they leave it/).waitFor();
    await me.R('button', { name: 'Use your Vault key' }).waitFor();
    await me.shot('vault-locked');
    await me.R('button', { name: 'Unlock with your passcode' }).click();
    await me.L('Passcode', { exact: true }).fill('not-the-passcode');
    await me.R('button', { name: 'Unlock', exact: true }).click();
    await me.T("That passcode doesn't open it. Try again, or use your Vault key.").waitFor({ timeout: 30000 });
    await me.shot('vault-locked-passcode');
    await me.L('Passcode', { exact: true }).fill(PASSCODE.nora);
    await me.R('button', { name: 'Unlock', exact: true }).click();
    await me.R('button', { name: /^Logins, 6$/ }).waitFor({ timeout: 30000 });
    // A page of the Vault that is opened by its address while it is locked asks to unlock first.
    await page.goto(`${WEB_URL}/vault-item/${login}`);
    await me.T('The Vault is locked').waitFor({ timeout: 20000 });
    await me.shot('vault-locked-page');
    await me.R('button', { name: 'Unlock with your passcode' }).click();
    await me.L('Passcode', { exact: true }).fill(PASSCODE.nora);
    await me.R('button', { name: 'Unlock', exact: true }).click();
    await me.R('heading', { name: title }).waitFor({ timeout: 30000 });
  });

  await step('vault-new-phone', async () => {
    // A third phone of Nora's: signed in, and let into the Vault by the typed Vault key and nothing else.
    const third = await phoneOf(NORA);
    await toVault(third);
    await third.T("This browser doesn't hold your Vault yet. Type your Vault key once, and it stays here behind a passcode.").waitFor({ timeout: 20000 });
    await third.shot('vault-locked-new-phone');
    await third.R('button', { name: 'Use your Vault key' }).click();
    await third.R('heading', { name: 'Your Vault key' }).waitFor();
    await third.L('A passcode for this browser').fill(PASSCODE.third);
    await third.L('The same passcode again').fill(PASSCODE.third);
    // Any other key opens nothing: there is no "forgot my key".
    await third.L('Vault key', { exact: true }).fill('AAAA BBBB CCCC DDDD EEEE FFFF');
    await third.R('button', { name: 'Unlock', exact: true }).click();
    await third.T(/^That key doesn't open your Vault\./).waitFor({ timeout: 30000 });
    // Typed the way people type: small letters.
    await third.L('Vault key', { exact: true }).fill(vaultKey.toLowerCase());
    await third.shot('vault-unlock-with-key');
    await third.R('button', { name: 'Unlock', exact: true }).click();
    await third.R('button', { name: /^Logins, 6$/ }).waitFor({ timeout: 30000 });
    await third.R('button', { name: /^Logins, 6$/ }).click();
    await third.R('button', { name: new RegExp(`^${title}\\.`) }).click();
    await third.R('button', { name: 'Show password' }).click();
    await third.T(current).waitFor();
    await third.close();
    noRowHolds('the Vault key or a passcode', secrets());
  });

  // ---------- if something happens ----------

  const noraId = () => db(`select id from local_users where email = '${NORA}'`);

  await step('emergency', async () => {
    // 9.5 If something happens: the person, the wait, what opens, and a note. The escrow is made on Nora's phone.
    await unlocked(me, PASSCODE.nora);
    await me.R('button', { name: /^If something happens\. Off/ }).click();
    await me.R('heading', { name: 'If something happens to you' }).waitFor();
    await me.T('none of it').waitFor();
    await me.T('You have 48 hours to say no').waitFor();
    await me.R('button', { name: /^Choose someone you trust\./ }).click();
    await me.T('Who can ask?').waitFor();
    await me.R('button', { name: /^Sam Vault/ }).click();
    await me.T('Sam asks').waitFor();
    await me.T('It opens to Sam').waitFor();
    await me.R('button', { name: /^Time to say no\. 48 hours/ }).click();
    await me.R('button', { name: '3 days · 72 hours' }).click();
    await me.T('You have 72 hours to say no').waitFor();
    await me.R('button', { name: /^Time to say no\. 72 hours/ }).click();
    await me.R('button', { name: '2 days · 48 hours' }).click();
    await me.R('button', { name: /^What opens\./ }).click();
    await me.T('What opens to them?').waitFor();
    await me.R('checkbox', { name: `Include ${title}` }).click();
    await me.R('button', { name: 'Done' }).click();
    await me.R('button', { name: /^A note for the family\./ }).click();
    await me.L('A note for the family', { exact: true }).fill(NOTE);
    await me.R('button', { name: 'Done' }).click();
    await me.T(`${title}, 1 thing`).waitFor();
    await me.shot('emergency');
    await me.R('button', { name: 'Turn it on' }).click();
    await me.T('It is on. Sam can ask.').waitFor({ timeout: 20000 });
    await me.shot('emergency-on');
    const row = db(`select e.state, e.wait_hours, e.note ~ '^[A-Za-z0-9_-]+$', (select count(*) from vault_emergency_items i where i.emergency_id = e.id) from vault_emergencies e where e.owner_id = '${noraId()}'`);
    if (row !== 'ready|48|t|1') throw new Error(`the arrangement's row is not what was expected: ${row}`);
    noRowHolds('the note for the family', secrets());
  });

  await step('emergency-asked', async () => {
    // Sam's side: he can ask, and sees none of it until it opens.
    await unlocked(sam, PASSCODE.sam);
    await sam.R('button', { name: 'People you help, people who trust you' }).click();
    await sam.R('heading', { name: 'People you help' }).waitFor();
    await sam.R('button', { name: /^Nora Lind\. You can ask for their Vault/ }).click();
    await sam.R('heading', { name: "Nora's Vault" }).waitFor();
    await sam.T(/Until it opens you see none of it, not even what would open\.$/).waitFor();
    await sam.shot('entrusted');
    await sam.R('button', { name: "Ask for Nora's Vault" }).click();
    await sam.R('button', { name: 'Ask', exact: true }).click();
    await sam.T('You asked').waitFor({ timeout: 20000 });
    await sam.T(/to go$/).waitFor();
    await sam.shot('entrusted-asked');
    // Nothing is handed over while Nora can still say no.
    const early = await fetch(`${ctx.API_URL}/v1/vault/entrusted/${idIn(sam.page.url())}/items/${login}/open`, { method: 'POST', headers: { Authorization: 'Bearer ' + sam.token } });
    if (early.status !== 403) throw new Error(`the entrusted item was answered ${early.status} before the wait was over`);
    // Nora is told when she opens her Vault, also while it is locked: saying no needs no key.
    await toVault(me);
    await me.T('Sam asked to open your Vault').waitFor({ timeout: 20000 });
    await me.shot('vault-asked');
    await me.R('button', { name: /^Say no\./ }).click();
    await me.T('Sam asked to open your Vault').waitFor({ state: 'detached', timeout: 20000 });
    // Sam is refused, and can ask again another day. The page asks again by itself every few seconds.
    await sam.T(/^Nora said no /).waitFor({ timeout: 30000 });
    await sam.shot('entrusted-refused');
    await sam.R('button', { name: "Ask for Nora's Vault" }).click();
    await sam.R('button', { name: 'Ask', exact: true }).click();
    await sam.T('You asked').waitFor({ timeout: 20000 });
  });

  await step('emergency-open', async () => {
    // 48 hours pass without a no: the clock is moved in the database, as the API's own tests do.
    db(`update vault_emergencies set opens_at = now() - interval '1 minute' where owner_id = '${noraId()}' and state = 'asked'`);
    await sam.T('It is open to you').waitFor({ timeout: 40000 });
    // The note that was sealed for Sam, and the one item that was chosen. What wasn't chosen is not there.
    await sam.T(NOTE).waitFor();
    await sam.R('button', { name: `Open ${title}` }).waitFor();
    const opened = await ctx.api(sam.token, 'GET', `/v1/vault/entrusted/${idIn(sam.page.url())}`);
    if (opened.items.map((item) => item.title).join() !== title) throw new Error('something that was not chosen is listed');
    await sam.shot('entrusted-open');
    await sam.R('button', { name: `Open ${title}` }).click();
    await sam.R('button', { name: 'Show password' }).click();
    await sam.T(current).waitFor();
    await sam.shot('entrusted-item');
    await sam.R('button', { name: 'Close' }).click();
    // Nora sees that it is open, and switches it off: the escrow is deleted.
    await unlocked(me, PASSCODE.nora);
    await me.T('Your Vault is open to Sam').waitFor({ timeout: 20000 });
    await me.R('button', { name: /^Look\. Your Vault is open to Sam/ }).click();
    await me.T('It is open to Sam').waitFor();
    await me.shot('emergency-open');
    await me.R('button', { name: 'Switch it off' }).click();
    await me.T('Switch it off?').waitFor();
    await me.R('button', { name: 'Switch it off' }).click();
    await me.R('button', { name: 'Turn it on' }).waitFor({ timeout: 20000 });
    if (db(`select count(*) from vault_emergencies where owner_id = '${noraId()}'`) !== '0') throw new Error('switching it off left the arrangement in the database');
    noRowHolds('the note or the password', secrets());
    await me.R('button', { name: 'Back' }).click();
  });

  // ---------- helpers, and getting back in ----------

  /** The check words a phone shows, as one line. */
  const wordsOn = async (who) => (await who.page.getByTestId('check-words').last().getAttribute('aria-label')).replace(/^Check words\. /, '');

  await step('vault-helpers', async () => {
    // Ida is a second helper: one alone must never be enough.
    ida = await ctx.second('Ida Vault');
    await join(ida);
    await setUp(ida, PASSCODE.ida, false);
    await ida.R('button', { name: "I've saved my key" }).click();
    await ida.R('button', { name: /^Logins, \d+$/ }).waitFor({ timeout: 20000 });

    // 9.6 Your Vault key, later: the key was shown once and this phone doesn't keep it. Nora asks two helpers.
    await unlocked(me, PASSCODE.nora);
    await me.R('button', { name: /^Your Vault key\. Saved/ }).click();
    await me.R('heading', { name: 'Your Vault key' }).waitFor();
    await me.T('Shown once').waitFor();
    await me.T('You said you saved it.').waitFor();
    await me.R('button', { name: /^Add a helper\./ }).click();
    await me.T('Who can help you back in?').waitFor();
    await me.shot('vault-key-choose-helper');
    await me.R('button', { name: /^Sam Vault/ }).click();
    await me.R('button', { name: /^Sam was asked\. Waiting for their answer/ }).waitFor({ timeout: 20000 });
    await me.R('button', { name: /^Add a second helper\./ }).click();
    await me.R('button', { name: /^Ida Vault/ }).click();
    await me.R('button', { name: /^Ida was asked\./ }).waitFor({ timeout: 20000 });

    // Each helper is told when they open their Vault, and says yes.
    for (const helper of [sam, ida]) {
      await unlocked(helper, helper === sam ? PASSCODE.sam : PASSCODE.ida);
      await helper.T('Nora asks you to be a helper').waitFor({ timeout: 20000 });
      await helper.R('button', { name: /^Answer\./ }).click();
      await helper.R('heading', { name: 'People you help' }).waitFor();
      if (helper === sam) await helper.shot('helping-asked');
      await helper.R('button', { name: 'Yes, help Nora' }).click();
      await helper.T('You are a helper').waitFor({ timeout: 20000 });
    }

    // Nora's phone splits her Vault key so that any two parts rebuild it. It doesn't keep the key, so she types it once.
    await me.R('button', { name: 'Back' }).click();
    await me.T('Your helpers are waiting for their parts').waitFor({ timeout: 20000 });
    await me.R('button', { name: /^Split\./ }).click();
    await me.T('Hand your helpers their parts').waitFor();
    await me.L('Your Vault key', { exact: true }).fill('AAAA BBBB CCCC DDDD EEEE FFFF');
    await me.R('button', { name: 'Split it for 2 helpers' }).click();
    await me.T("That isn't your Vault key. Nothing was split.").waitFor({ timeout: 30000 });
    await me.L('Your Vault key', { exact: true }).fill(vaultKey);
    await me.R('button', { name: 'Split it for 2 helpers' }).click();
    await me.R('button', { name: /^Sam can help you back in\. Helper · said yes/ }).waitFor({ timeout: 30000 });
    await me.R('button', { name: /^Ida can help too\. Any two helpers together/ }).waitFor();
    await me.R('button', { name: /^Add a third helper\. So two are always reachable/ }).waitFor();
    await me.shot('vault-key-helpers');
    const shares = db(`select count(*) filter (where sealed_share ~ '^[A-Za-z0-9_-]{100,}$'), count(*) from vault_helpers where owner_id = '${noraId()}'`);
    if (shares !== '2|2') throw new Error(`each helper should hold one sealed part: ${shares}`);
    noRowHolds('the Vault key (a helper would hold it whole)', secrets());
    await me.R('button', { name: 'Back' }).click();
  });

  await step('vault-recovery', async () => {
    // A fourth phone of Nora's, and no Vault key: she asks her helpers.
    const fourth = await phoneOf(NORA);
    await toVault(fourth);
    await fourth.R('button', { name: "I've lost my Vault key" }).click();
    await fourth.R('heading', { name: 'Get back in with your helpers' }).waitFor();
    await fourth.R('button', { name: 'Ask my helpers' }).click();
    await fourth.T('Your helpers were asked').waitFor({ timeout: 20000 });
    await fourth.T(/^Keep this page open\.|Keep this page open\./).waitFor();
    const first = await wordsOn(fourth);

    // Her other phone is told, and can cancel a recovery it didn't start.
    await toVault(me);
    await me.T('Someone is getting back into your Vault').waitFor({ timeout: 20000 });
    await me.R('button', { name: /^Look at it\./ }).click();
    await me.T("This recovery wasn't started on this phone").waitFor();
    if ((await wordsOn(me)) !== first) throw new Error('the two phones show different check words for the same recovery');
    await me.shot('recover-not-mine');
    await me.R('button', { name: 'Cancel this recovery' }).click();
    await me.R('button', { name: 'Cancel it' }).click();
    await me.R('button', { name: 'Ask my helpers' }).or(me.T('There is no way back in')).waitFor({ timeout: 20000 });
    await me.R('button', { name: 'Close' }).click();
    // The phone that started it notices by itself, and starts again: a new recovery, other words.
    await fourth.R('button', { name: 'Ask my helpers' }).waitFor({ timeout: 30000 });
    await fourth.R('button', { name: 'Ask my helpers' }).click();
    await fourth.T('Your helpers were asked').waitFor({ timeout: 20000 });
    const words = await wordsOn(fourth);
    if (words === first) throw new Error('a new recovery shows the check words of the one before');
    await fourth.shot('recover-started');

    // Each helper is told, reads the same words, and passes their part on.
    for (const helper of [sam, ida]) {
      await unlocked(helper, helper === sam ? PASSCODE.sam : PASSCODE.ida);
      await helper.T('Nora needs your help to get back in').waitFor({ timeout: 20000 });
      await helper.R('button', { name: /^Help\./ }).click();
      await helper.T('Nora is getting back into their Vault').waitFor();
      if ((await wordsOn(helper)) !== words) throw new Error("a helper's check words are not the ones on the new phone");
      if (helper === sam) await helper.shot('helping-needed');
      await helper.R('button', { name: 'They match: pass my part on' }).click();
      await helper.T('You passed your part on').waitFor({ timeout: 20000 });
    }
    noRowHolds('the Vault key or a part of it', secrets());

    // The new phone joins the two parts into the Vault key and is back in.
    await fourth.T('Two helpers have helped').waitFor({ timeout: 30000 });
    await fourth.L('A passcode for this browser').fill(PASSCODE.fourth);
    await fourth.L('The same passcode again').fill(PASSCODE.fourth);
    await fourth.shot('recover-ready');
    await fourth.R('button', { name: 'Open my Vault' }).click();
    await fourth.T("You're back in").waitFor({ timeout: 40000 });
    await fourth.shot('recover-back-in');
    // And a new Vault key straight away: the old one came out of two parts other people held.
    await fourth.R('button', { name: 'Make a new Vault key' }).click();
    await fourth.R('heading', { name: 'Your Vault key' }).waitFor({ timeout: 30000 });
    newVaultKey = await fourth.page.getByTestId('vault-key').last().getAttribute('aria-label');
    if (!KEY_SHAPE.test(newVaultKey) || newVaultKey === vaultKey) throw new Error('the new Vault key is not a new one');
    // The helpers' parts were thrown away with the old key. The new one is on screen, so it is split without typing.
    await fourth.R('button', { name: 'Split it for 2 helpers' }).click();
    await fourth.R('button', { name: /^Sam can help you back in\. Helper · said yes/ }).waitFor({ timeout: 30000 });
    await fourth.shot('vault-key-new');
    await fourth.R('button', { name: "I've saved my key" }).click();
    await fourth.R('button', { name: /^Logins, 6$/ }).waitFor({ timeout: 20000 });
    const row = db(`select key_version, key_saved_at is not null, (select count(*) from vault_recoveries r where r.owner_id = v.user_id and r.state = 'open'), (select count(*) from vault_recovery_shares) from vaults v where v.user_id = '${noraId()}'`);
    if (row !== '2|t|0|0') throw new Error(`after the recovery the Vault's row is not what was expected: ${row}`);
    // The old Vault key opens nothing any more: the API only holds the private key wrapped with the new one.
    await fourth.R('button', { name: 'Lock the Vault now' }).click();
    await fourth.R('button', { name: 'Use your Vault key' }).click();
    await fourth.R('switch', { name: 'Keep my Vault on this phone' }).click();
    await fourth.L('Vault key', { exact: true }).fill(vaultKey);
    await fourth.R('button', { name: 'Unlock', exact: true }).click();
    await fourth.T(/^That key doesn't open your Vault\./).waitFor({ timeout: 30000 });
    await fourth.L('Vault key', { exact: true }).fill(newVaultKey);
    await fourth.R('button', { name: 'Unlock', exact: true }).click();
    await fourth.R('button', { name: /^Logins, 6$/ }).waitFor({ timeout: 30000 });
    await fourth.close();
    noRowHolds('a Vault key', secrets());
  });

  // ---------- a door code on a guest pass ----------

  await step('vault-guest-pass', async () => {
    // A guest has no app and no key. The code is sealed on Nora's phone; the key travels after the # of the link.
    await unlocked(me, PASSCODE.nora);
    await me.R('tab', { name: 'People' }).click();
    await me.R('button', { name: /^Invite someone\./ }).click();
    await me.R('button', { name: /^New guest pass/ }).click();
    await me.R('heading', { name: 'Guest pass' }).waitFor();
    await me.L('Who is it for?').fill('Ines, the sitter');
    await me.R('checkbox', { name: /\. Not on the pass$/ }).first().click();
    await me.R('button', { name: 'Give the pass' }).click();
    await me.T('Door codes and Wi‑Fi').waitFor({ timeout: 20000 });
    await me.R('button', { name: /^Add a code or the Wi‑Fi\./ }).click();
    await me.T('What should they be able to read?').waitFor();
    await me.shot('guest-pass-add-code');
    await me.R('button', { name: new RegExp(`^${shed}\\.`) }).click();
    await me.T('Shows when tapped').waitFor({ timeout: 20000 });
    await me.T(/^The end of this link, after the #, is the key to the codes\./).waitFor();
    await me.shot('guest-pass-sealed');
    const pass = (await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/guest-passes`)).find((one) => one.cards.length === 1);
    // The API knows the pass's address up to the #, and holds the card scrambled. The key is only on the screen.
    if (pass.url.includes('#')) throw new Error("the API's address of the pass carries a key");
    await me.R('button', { name: 'Copy', exact: true }).click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    if (!new RegExp(`^${pass.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}#[A-Za-z0-9_-]{43}$`).test(link)) throw new Error(`the link to send is not the pass's address with its key: ${link.replace(/#.*/, '#…')}`);
    noRowHolds('the door code, or the key of the pass', [...secrets(), link.split('#')[1]]);
    // Ines's side: the API's own page and script open what Nora's phone sealed.
    await ctx.webPage(link, DOOR, 'guest-pass-sealed-web', async (web) => {
      await web.getByLabel('The four-digit code').fill(pass.code);
      await web.getByRole('button', { name: 'Open' }).click();
      await web.waitForLoadState();
      // (The same known trouble with the page's form as in the spine's walk: see 01-spine.js.)
      if (await web.getByText('Invalid CORS request').count()) {
        await web.request.post(pass.url, { form: { code: pass.code } });
        await web.goto(link);
      }
      await web.getByRole('heading', { name: shed }).waitFor();
      if (await web.getByText(DOOR).count()) throw new Error('the door code is on the page before it was asked for');
      await web.getByRole('button', { name: 'Show' }).click();
    });
    // Without the end of the link, the page has the card and can't open it.
    await ctx.webPage(pass.url, 'This link is incomplete', 'guest-pass-sealed-web-no-key', async (web) => {
      if (await web.getByLabel('The four-digit code').count()) {
        await web.request.post(pass.url, { form: { code: pass.code } }).catch(() => undefined);
        await web.goto(pass.url);
      }
    });
    await me.R('button', { name: 'End it now' }).click();
    await me.R('button', { name: 'End the pass' }).click();
    await me.T('This pass has ended. The link no longer opens anything.').waitFor();
    await me.R('button', { name: 'Close' }).click();
    // Going back is the browser's own step back, which finishes a moment later: wait for it before going anywhere else.
    await page.waitForURL(/\/people$/);
    await me.R('button', { name: /^Invite someone\./ }).last().waitFor();
  });

  await step('vault-delete', async () => {
    // What needs a look, what was shared, and deleting an item.
    await unlocked(me, PASSCODE.nora);
    await me.R('button', { name: /^Two passwords need a look/ }).click();
    await me.R('heading', { name: 'Needs a look' }).waitFor();
    await me.R('button', { name: /^Bank\./ }).waitFor();
    await me.R('button', { name: /^Old email\./ }).waitFor();
    await me.shot('vault-needs-a-look');
    // Copying a sample item says why it can't.
    await me.R('button', { name: 'Copy Bank' }).click();
    await me.T('Sample item: add your own to see the real thing.').waitFor();
    await me.R('button', { name: 'Back' }).click();
    await me.R('button', { name: /^Codes, 3$/ }).click();
    await me.R('button', { name: new RegExp(`^${shed}\\.`) }).click();
    await me.R('button', { name: 'Edit' }).click();
    await me.R('button', { name: 'Delete this item' }).click();
    await me.T('Delete this item?').waitFor();
    await me.R('button', { name: 'Delete it' }).click();
    await me.R('button', { name: /^Codes, 2$/ }).waitFor({ timeout: 20000 });
    if (db(`select count(*) from things where id = '${door}'`) !== '0') throw new Error('the deleted item is still in the database');
  });

  await step('vault-end', async () => {
    await sam.close();
    await ida.close();
    forgetVaultOf(NORA);
    await page.goto(WEB_URL + '/');
    await me.R('tab', { name: 'Home' }).waitFor({ timeout: 20000 });
    await ctx.signOut();
  });
};
