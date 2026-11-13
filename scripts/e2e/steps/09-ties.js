// Milestone 9, what ties it together: Activity, the Sunday summary, what a notification says, export, leaving a
// circle and deleting the account, the circle switcher's lines, and asking to see something in the Vault.
//
// It is walked in two parts.
//
//   Nora (nora@example.com, the sample family) uses every screen with the sample data: Activity with its chips,
//   paying a bill from the line that says it is due, the sheet behind the gear (muting, the Sunday summary),
//   "Hide details in notifications", an export from asking to the zip itself, the numbers before leaving, the
//   page that deletes the account, and the circle switcher.
//
//   Ada and Ben are new each run, in a circle of their own, on two phones, because the rest is about what one
//   person does and another sees. Ben stands on "Who is it for?" while he is let into Ada's circle from
//   elsewhere, and is taken Home. What Ada keeps to herself, or hides from Ben, never shows in his Activity;
//   what she shares does, with the dot on the tab. Ben has had his one look at a code of Ada's and asks to see
//   it again: he takes the question back, asks again, is told "not now", asks once more, and Ada allows it
//   from Activity with her Vault locked, so her phone asks to unlock first and then makes the key by itself.
//   Ben opens the code. Then Ben leaves the circle: what he kept private is gone, what he shared stays. Ada
//   deletes her account, and the welcome screen says what became of it.
//
// Nothing here reads the database: what the API answers each person is the check. The two new people's
// accounts are deleted at the end, so a run leaves nobody behind and can be run again.
const crypto = require('crypto');

const NORA = 'nora@example.com';

exports.run = async function run(ctx) {
  const { page, step, tag, WEB_URL, API_URL, CODE } = ctx;
  const me = { page, T: ctx.T, R: ctx.R, L: ctx.L, shot: ctx.shot };
  const id = () => crypto.randomUUID();
  /** The day on the phone (the walk's browser), as the app sends it. */
  const today = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  /** A sheet is closed by pressing outside it, above it. */
  const closeSheet = (who) => who.R('button', { name: 'Close' }).click({ position: { x: 195, y: 40 } });
  const back = (who) => who.R('button', { name: 'Back', exact: true }).click();
  /** To a tab from anywhere under the tabs. The Activity tab is called "Activity, something new" while it has its dot. */
  const tab = (who, name) => who.R('tab', { name: name === 'Activity' ? /^Activity/ : name }).click();
  /**
   * Something in a long list, which only draws the rows near the screen: the list is scrolled down a screen at
   * a time until it is there. Fails when the end of the list comes first.
   */
  const inList = async (who, target) => {
    await who.page.mouse.move(195, 520);
    for (let screens = 0; screens < 30 && (await target.count()) === 0; screens += 1) {
      await who.page.mouse.wheel(0, 500);
      await who.page.waitForTimeout(250);
    }
    await target.first().waitFor({ timeout: 20000 });
    await target.first().scrollIntoViewIfNeeded();
    return target.first();
  };
  /** A change the app sends, waited for: resolves with the API's answer to it. */
  const sent = (who, method, ending, act) => Promise.all([who.page.waitForResponse((r) => r.request().method() === method && r.url().split('?')[0].endsWith(ending)), act()]).then(([answer]) => answer);

  let nora;
  let linds;

  // ---------- Nora, with the sample data ----------

  await step('ties-start', async () => {
    if (page.url() === 'about:blank') await page.goto(WEB_URL + '/');
    await ctx.T('Get started').waitFor({ timeout: 20000 });
    await ctx.signIn(NORA);
    nora = (await ctx.api(null, 'POST', '/local-auth/token', { email: NORA, code: CODE })).accessToken;
    linds = (await ctx.api(nora, 'GET', '/v1/circles')).find((circle) => circle.name === 'The Linds');
    await me.R('button', { name: 'The Linds. Change circle' }).waitFor({ timeout: 20000 });
  });

  await step('circle-switch', async () => {
    // 3.2 Your circles: each circle's line is the API's, with what each place adds to it, and so is what "Just me" counts.
    const lines = await ctx.api(nora, 'GET', '/v1/home/circles');
    await me.R('button', { name: 'The Linds. Change circle' }).click();
    await me.R('heading', { name: 'Your circles' }).waitFor();
    for (const circle of lines.circles.filter((one) => one.kind !== 'solo')) {
      const here = circle.id === linds.id ? '. You are here' : '';
      await me.R('button', { name: `${circle.name}. ${circle.line}${here}`, exact: true }).waitFor();
    }
    if (!lines.circles.some((one) => /^Friends · \d+ people/.test(one.line))) throw new Error('no circle of friends says "Friends · N people"');
    await me.R('button', { name: `Just me. ${lines.onlyYou === 1 ? '1 thing' : `${lines.onlyYou} things`} only you can see` }).waitFor();
    await me.shot('circle-switch');
    await closeSheet(me);
    await me.R('heading', { name: 'Your circles' }).waitFor({ state: 'detached' });
  });

  let bill;
  await step('activity', async () => {
    // A bill of the walk's own, due today, to pay from Activity and take away again.
    bill = await ctx.api(nora, 'POST', '/v1/bills', { clientId: id(), circleId: linds.id, title: `Walk bill ${tag}`, amountCents: 1250, dueOn: today(), pays: 'by_hand', repeat: 'once' });
    await tab(me, 'Activity');
    await me.R('heading', { name: 'Activity' }).waitFor();
    for (const chip of ['All', /^Asks/, 'Photos', 'Money', 'Plan']) await me.R('button', { name: chip, exact: typeof chip === 'string' }).waitFor();
    // 11.1 Activity: what changed, what is due and who is asking, under "Today" and what came before.
    await me.T(/^(Today|Earlier this week|Earlier)$/).first().waitFor({ timeout: 20000 });
    await me.shot('activity');
    // What the list shows is what the API answers this person: its newest lines are the first on the screen.
    const asked = await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/activity?filter=all&day=${today()}`);
    const sentence = (line) => line.sentence.map((part) => part.text).join('');
    for (const line of asked.items.slice(0, 3)) await me.page.getByText(sentence(line), { exact: false }).first().waitFor({ state: 'attached' });
    // What is due stands under Today, after what is new there: the bill is in the list, however much happened today.
    await inList(me, me.page.getByRole('button', { name: new RegExp(`Walk bill ${tag} is due today, €12\\.50`) }));
    await me.shot('activity-due');
  });

  await step('activity-chips', async () => {
    // The chips ask the API again; Photos holds nothing that is due.
    await me.R('button', { name: 'Photos', exact: true }).click();
    await me.R('button', { name: new RegExp(`Walk bill ${tag}`) }).first().waitFor({ state: 'detached', timeout: 20000 });
    await me.shot('activity-photos');
    await me.R('button', { name: 'Plan', exact: true }).click();
    await me.shot('activity-plan');
    await me.R('button', { name: /^Asks/ }).click();
    const asks = (await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/activity?filter=asks`)).items;
    const open = asks.find((line) => (line.buttons || []).some((button) => button.act === 'allow_ask'));
    if (open) {
      // The sample family's question (Alex and the bank card PIN): the line opens both answers. It is not
      // answered here, so the next run finds it too.
      const said = open.sentence.map((part) => part.text).join('');
      await me.R('button', { name: new RegExp(`^(New\\. )?${said.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click();
      await me.R('heading', { name: said }).waitFor();
      await me.T(/Allowing makes a key on this phone that opens it for /).waitFor();
      await me.R('button', { name: 'Not now', exact: true }).waitFor();
      await me.shot('activity-answer');
      await closeSheet(me);
      await me.R('heading', { name: said }).waitFor({ state: 'detached' });
    } else {
      await me.T('Nobody is asking').waitFor();
    }
    await me.R('button', { name: 'Money', exact: true }).click();
    await page.waitForResponse((r) => r.url().includes('filter=money')).catch(() => undefined);
    await inList(me, me.page.getByRole('button', { name: new RegExp(`Walk bill ${tag} is due today`) }));
    await me.shot('activity-money');
  });

  await step('activity-pay', async () => {
    // Paying from the line that says it is due marks the person's own share, for that time it was due.
    const pay = await inList(me, me.page.getByRole('button', { name: `Pay. Walk bill ${tag} is due today, €12.50` }));
    const paid = await sent(me, 'PUT', `/v1/bills/${bill.id}/paid`, () => pay.click());
    if (!paid.ok()) throw new Error(`paying from Activity gave ${paid.status()}`);
    if (paid.request().postDataJSON().dueOn !== bill.dueOn) throw new Error('paying did not say which time it was due');
    await me.R('button', { name: new RegExp(`Walk bill ${tag} is due today`) }).first().waitFor({ state: 'detached', timeout: 20000 });
    if (!(await ctx.api(nora, 'GET', `/v1/bills/${bill.id}`)).paid) throw new Error('the bill is not paid after "Pay"');
    await ctx.api(nora, 'DELETE', `/v1/things/${bill.id}`);
    await me.R('button', { name: 'All', exact: true }).click();
  });

  await step('activity-mute', async () => {
    // The sheet behind the gear. Muting is told to the API at once, and taken back.
    await me.R('button', { name: 'Activity settings' }).click();
    await me.R('heading', { name: 'Activity in The Linds' }).waitFor();
    await me.R('switch', { name: 'Mute The Linds', checked: false }).waitFor();
    let answer = await sent(me, 'PUT', `/v1/circles/${linds.id}/mute`, () => me.R('switch', { name: 'Mute The Linds' }).click());
    if (!answer.ok()) throw new Error(`muting gave ${answer.status()}`);
    await me.R('switch', { name: 'Mute The Linds', checked: true }).waitFor();
    if (!(await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/activity`)).muted) throw new Error('the circle is not muted after the switch');
    await me.shot('activity-sheet');
    answer = await sent(me, 'PUT', `/v1/circles/${linds.id}/mute`, () => me.R('switch', { name: 'Mute The Linds' }).click());
    if (!answer.ok()) throw new Error(`taking the mute back gave ${answer.status()}`);
    await me.R('switch', { name: 'Mute The Linds', checked: false }).waitFor();
    if ((await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/activity`)).muted) throw new Error('the circle is still muted');
  });

  await step('digest', async () => {
    // 11.3 The Sunday summary, of the last week that ended: what the API worked out for this person.
    await me.R('button', { name: /^The Sunday summary/ }).click();
    await me.R('heading', { name: 'Your week' }).waitFor();
    const week = new Date();
    week.setDate(week.getDate() - ((week.getDay() + 6) % 7) - 7);
    const monday = `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, '0')}-${String(week.getDate()).padStart(2, '0')}`;
    if (!page.url().includes(`/summary/${linds.id}`) || !page.url().includes(`week=${monday}`)) throw new Error(`the summary opened at ${page.url()}, not on last week`);
    const summary = await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/summary?week=${monday}`);
    await me.T(`The Linds · ${summary.range}`).waitFor({ timeout: 20000 });
    if (summary.hero) await me.T(summary.hero.title, { exact: true }).waitFor();
    for (const stat of summary.stats) await me.L(`${stat.figure} ${stat.label}`, { exact: true }).waitFor();
    if (summary.nextWeek.length) await me.T('Next week').waitFor();
    for (const row of summary.nextWeek) await me.T(row.title, { exact: true }).waitFor();
    await me.shot('digest');
    // Its two switches are behind the gear, and each is saved as it is changed.
    await me.R('button', { name: 'Summary settings' }).click();
    await me.R('heading', { name: 'The Sunday summary' }).waitFor();
    const before = (await ctx.api(nora, 'GET', '/v1/me/settings')).summaryEmail;
    await me.R('switch', { name: 'Also send it by email', checked: before }).waitFor();
    let saved = await sent(me, 'PUT', '/v1/me/settings', () => me.R('switch', { name: 'Also send it by email' }).click());
    if (!saved.ok() || (await ctx.api(nora, 'GET', '/v1/me/settings')).summaryEmail === before) throw new Error('the summary by email was not saved');
    await me.shot('digest-sheet');
    saved = await sent(me, 'PUT', '/v1/me/settings', () => me.R('switch', { name: 'Also send it by email' }).click());
    if (!saved.ok() || (await ctx.api(nora, 'GET', '/v1/me/settings')).summaryEmail !== before) throw new Error('the summary by email was not put back');
    await closeSheet(me);
    // A row of next week opens its thing, like every list of things.
    const first = summary.nextWeek.find((row) => row.thingId);
    if (first) {
      await me.R('button', { name: new RegExp(`^${first.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click();
      await page.waitForURL(new RegExp(first.thingId));
      await back(me);
    }
    await me.R('heading', { name: 'Your week' }).waitFor();
    await back(me);
    await me.R('heading', { name: 'Activity' }).waitFor();
  });

  await step('push', async () => {
    // 11.2 Notifications. A browser gets none, so what the app owns of them is walked by itself: the address
    // each kind carries opens its screen, and "Hide details in notifications" is the account's own setting.
    // "Alex asks to see something in the Vault" opens Activity on its Asks chip.
    await Promise.all([page.waitForResponse((r) => r.url().includes(`/v1/circles/${linds.id}/activity?`) && r.url().includes('filter=asks')), page.goto(`${WEB_URL}/activity?filter=asks`)]);
    await me.R('heading', { name: 'Activity' }).waitFor({ timeout: 20000 });
    await me.shot('push-asks');
    // "Your week in The Linds" opens that circle's summary; "Your export is ready" opens Export and leaving.
    await page.goto(`${WEB_URL}/summary/${linds.id}?week=${today()}`);
    await me.R('heading', { name: 'Your week' }).waitFor({ timeout: 20000 });
    await page.goto(`${WEB_URL}/settings/leaving`);
    await me.R('heading', { name: 'Your things stay yours' }).waitFor({ timeout: 20000 });
    await page.goto(`${WEB_URL}/settings/security`);
    await me.T('This phone').waitFor({ timeout: 20000 });
    const before = (await ctx.api(nora, 'GET', '/v1/me/settings')).hideDetails;
    await me.R('switch', { name: 'Hide details in notifications', checked: before }).waitFor({ timeout: 20000 });
    let saved = await sent(me, 'PUT', '/v1/me/settings', () => me.R('switch', { name: 'Hide details in notifications' }).click());
    if (!saved.ok() || (await ctx.api(nora, 'GET', '/v1/me/settings')).hideDetails === before) throw new Error('"Hide details in notifications" was not saved to the account');
    await me.R('switch', { name: 'Hide details in notifications', checked: !before }).waitFor();
    await me.T('“A bill is due”, not which or how much').waitFor();
    await me.shot('security');
    saved = await sent(me, 'PUT', '/v1/me/settings', () => me.R('switch', { name: 'Hide details in notifications' }).click());
    if (!saved.ok() || (await ctx.api(nora, 'GET', '/v1/me/settings')).hideDetails !== before) throw new Error('"Hide details in notifications" was not put back');
    await page.goto(WEB_URL + '/');
    await me.R('tab', { name: 'Home' }).waitFor({ timeout: 20000 });
  });

  await step('you', async () => {
    // 12.1 You: the storage line is what the current circle keeps, of what it may keep.
    await tab(me, 'You');
    await me.R('heading', { name: 'Nora', exact: true }).waitFor();
    await me.R('button', { name: /^Storage and backup\. .+ of \d+ (GB|TB)$/ }).waitFor({ timeout: 20000 });
    await me.shot('you');
    await me.R('button', { name: /^Storage and backup/ }).click();
    await me.R('heading', { name: 'Storage and backup' }).waitFor();
    await me.T('By person').waitFor({ timeout: 20000 });
    await me.shot('storage');
    await back(me);
  });

  await step('leaving', async () => {
    // 12.4 Export and leaving.
    await me.R('button', { name: /^Export and leaving/ }).click();
    await me.R('heading', { name: 'Your things stay yours' }).waitFor();
    await me.T('If you leave The Linds').waitFor();
    for (const line of ['What you kept private leaves with you', 'What you shared stays for the others, as a copy', 'Passwords you shared stop working for them']) await me.T(line).waitFor();
    await me.shot('leaving');
    // Exporting the Vault is the phone's own work, which isn't built: the row says so.
    await me.R('button', { name: /^Export the Vault/ }).click();
    await me.T(/^Nobody but your phone can open your Vault, so only your phone can export it\./).waitFor();
    await me.R('button', { name: 'Got it' }).click();
  });

  await step('export', async () => {
    // Whatever an earlier walk that stopped half-way left behind goes first.
    for (const old of await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/exports`)) await ctx.api(nora, 'DELETE', `/v1/exports/${old.id}`).catch(() => undefined);
    await me.R('button', { name: /^Export everything/ }).click();
    await me.T(/^One zip of ordinary files from The Linds/).waitFor();
    await me.R('radio', { name: 'All you can see', checked: true }).waitFor();
    await me.R('radio', { name: 'Only what you made' }).click();
    const asked = await sent(me, 'POST', `/v1/circles/${linds.id}/exports`, () => me.R('button', { name: 'Make the export' }).click());
    if (!asked.ok() || asked.request().postDataJSON().scope !== 'mine') throw new Error('the export was not asked for as chosen');
    await me.T(/^Being made\./).waitFor();
    await me.T(/^What you made · asked for /).waitFor();
    await me.shot('export-being-made');
    // It is made in the background, and the sheet looks again by itself until it is ready.
    await me.R('button', { name: /^Save the export\. [\d,]+ files? · / }).waitFor({ timeout: 150000 });
    await me.T(/^Kept until .+, then removed$/).waitFor();
    await me.shot('export-ready');
    const [made] = await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/exports`);
    if (made.state !== 'ready' || !made.url) throw new Error(`the export is ${made.state}`);
    // The file itself: a zip, with as many files as the sheet says.
    const zip = Buffer.from(await (await fetch(made.url)).arrayBuffer());
    if (zip.subarray(0, 2).toString('latin1') !== 'PK') throw new Error('what the export leads to is not a zip');
    if (!zip.includes(Buffer.from('README'))) throw new Error('the export has no README');
    // Saving opens the file where the browser can keep it.
    const [opened] = await Promise.all([page.context().waitForEvent('page'), me.R('button', { name: /^Save the export\./ }).click()]);
    await opened.close().catch(() => undefined);
    // Removing it takes it out of the list, and the API forgets it.
    await me.R('button', { name: 'Remove this export' }).click();
    await me.R('button', { name: /^Save the export\./ }).waitFor({ state: 'detached', timeout: 20000 });
    if ((await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/exports`)).length) throw new Error('the removed export is still listed');
    await closeSheet(me);
  });

  await step('leaving-numbers', async () => {
    // The numbers before leaving are the API's; Nora stays.
    const numbers = await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/leaving`);
    const things = (count) => (count === 1 ? '1 thing' : `${count.toLocaleString('en-US')} things`);
    await me.R('button', { name: 'Leave The Linds' }).click();
    await me.R('heading', { name: 'Leave The Linds?' }).waitFor();
    if (numbers.onlyYours > 0) await me.T(new RegExp(`^${things(numbers.onlyYours)} only you can see (is|are) deleted\\.`)).waitFor({ timeout: 20000 });
    if (numbers.shared > 0) await me.T(new RegExp(`^${things(numbers.shared)} you shared stays? for the others, in your name$`)).waitFor();
    if (numbers.nextOwner) await me.T(`${numbers.nextOwner} becomes the owner.`).waitFor();
    await me.shot('leave-sheet');
    await me.R('button', { name: 'Stay' }).click();
    await me.R('heading', { name: 'Leave The Linds?' }).waitFor({ state: 'detached' });
    if (!(await ctx.api(nora, 'GET', '/v1/circles')).some((circle) => circle.id === linds.id)) throw new Error('"Stay" left the circle');
    // Deleting the account asks which goes. Nora keeps hers.
    await me.R('button', { name: /^Delete account/ }).click();
    await me.T('Delete your account?').waitFor();
    await me.R('radio', { name: /^Only Homeport\./, checked: true }).waitFor();
    await me.R('radio', { name: /^Homeport, and Journey too\./ }).click();
    await me.R('radio', { name: /^Homeport, and Journey too\./, checked: true }).waitFor();
    await me.shot('delete-account-which');
    await me.R('button', { name: 'Keep my account' }).click();
    await me.R('heading', { name: 'Your things stay yours' }).waitFor();
    await me.R('button', { name: 'Log out' }).click();
    await me.T('Get started').waitFor({ timeout: 20000 });
  });

  // ---------- Ada and Ben, new each run, on two phones ----------

  const PASSCODE = { ada: `ada-pass-${tag}`, ben: `ben-pass-${tag}` };
  const CIRCLE = `Ties ${tag}`;
  const CODE_TITLE = `Shed code ${tag}`;
  const SECRET = `9-${tag}-star`;
  let ada;
  let ben;
  let circle;
  let joinCode;
  const adaPhone = me;

  /** Sets a Vault up from its place under Home. */
  const setUpVault = async (who, passcode) => {
    await who.page.goto(WEB_URL + '/?place=vault');
    await who.R('button', { name: 'Set up my Vault' }).click({ timeout: 20000 });
    await who.L('A passcode for this browser').fill(passcode);
    await who.L('The same passcode again').fill(passcode);
    await who.R('button', { name: 'Make my keys' }).click();
    await who.R('heading', { name: 'Your Vault key' }).waitFor({ timeout: 30000 });
    await who.R('button', { name: "I've saved my key" }).click();
    await who.R('button', { name: /^Logins, \d+$/ }).waitFor({ timeout: 20000 });
  };
  /** Waits for something on a page of the Vault, unlocking first when the page came up locked (as it does after being loaded afresh). */
  const onceUnlocked = async (who, passcode, target) => {
    const lockedNow = who.page.getByRole('button', { name: 'Unlock with your passcode' }).last();
    await target.or(lockedNow).waitFor({ timeout: 20000 });
    if (await lockedNow.isVisible().catch(() => false)) {
      await lockedNow.click();
      await who.L('Passcode', { exact: true }).fill(passcode);
      await who.R('button', { name: 'Unlock', exact: true }).click();
    }
    await target.waitFor({ timeout: 30000 });
  };
  /** The code's own page on Ben's phone, read afresh. */
  const benOpensCode = async (id) => {
    await ben.page.goto(`${WEB_URL}/vault-item/${id}`);
    await onceUnlocked(ben, PASSCODE.ben, ben.page.getByRole('heading', { name: CODE_TITLE }).last());
  };
  /** Ada's Activity, read afresh. */
  const adaReadsActivity = async () => {
    await tab(adaPhone, 'Home');
    await tab(adaPhone, 'Activity');
    await adaPhone.R('heading', { name: 'Activity' }).waitFor();
  };

  await step('ties-two-people', async () => {
    // Ada has a circle of friends. Ben is new, in no circle: his phone stands on "Who is it for?".
    ada = await ctx.signUp('Ada Ties');
    circle = await ctx.api(ada.token, 'POST', '/v1/circles', { clientId: id(), kind: 'crew', name: CIRCLE });
    joinCode = circle.joinUrl.split('/').pop();
    ben = await ctx.second('Ben Ties');
    await ben.T('Who are you sharing with?').waitFor({ timeout: 20000 });
    // He is let in from elsewhere (the invitation, accepted outside this phone). The app still remembers "no circles".
    await ctx.api(ben.token, 'PUT', `/v1/join/${joinCode}`);
    await ben.page.waitForTimeout(500);
    if (!(await ben.T('Who are you sharing with?').isVisible())) throw new Error('the setup screen went away before it came to the front');
    // The setup screens come to the front again: the circles are asked for, and Home opens on the one there is.
    await ben.page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await ben.R('button', { name: `${CIRCLE}. Change circle` }).waitFor({ timeout: 20000 });
    await ben.shot('joined-elsewhere');
    await ctx.signIn(ada.email);
    await adaPhone.R('button', { name: `${CIRCLE}. Change circle` }).waitFor({ timeout: 20000 });
  });

  let shown;
  let privateOne;
  let hiddenOne;
  await step('activity-hidden-stays-hidden', async () => {
    // Ada adds three pages: one for the circle, one she keeps to herself, one she hides from Ben.
    const benMember = (await ctx.api(ben.token, 'GET', '/v1/circles'))[0].myMemberId;
    shown = await ctx.api(ada.token, 'POST', '/v1/pages', { clientId: id(), circleId: circle.id, title: `Picnic ${tag}`, body: 'Bread, cheese, a blanket.', audience: 'circle' });
    privateOne = await ctx.api(ada.token, 'POST', '/v1/pages', { clientId: id(), circleId: circle.id, title: `Diary ${tag}`, body: 'Nobody reads this.', audience: 'me' });
    hiddenOne = await ctx.api(ada.token, 'POST', '/v1/pages', { clientId: id(), circleId: circle.id, title: `Surprise ${tag}`, body: "Ben's birthday.", audience: 'circle' });
    const through = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    await ctx.api(ada.token, 'PUT', `/v1/things/${hiddenOne.id}/audience`, { audience: 'circle', hiddenFrom: [{ memberId: benMember, through }] });
    // And changes the hidden one, which would be news to anyone who may see it.
    await ctx.api(ada.token, 'POST', '/v1/pages', { clientId: id(), circleId: circle.id, title: `Second surprise ${tag}`, body: 'Also for the birthday.', audience: 'me' });

    // Ben's phone: the tab has its dot, because something he may see is new.
    await ben.page.goto(WEB_URL + '/');
    await ben.R('tab', { name: 'Activity, something new' }).waitFor({ timeout: 20000 });
    await ben.shot('home-dot');
    await tab(ben, 'Activity');
    await ben.R('heading', { name: 'Activity' }).waitFor();
    await ben.R('button', { name: new RegExp(`^New\\. Ada (added|shared) Picnic ${tag}`) }).waitFor({ timeout: 20000 });
    // What Ada kept to herself and what she hid from him are in none of it: not on the screen, not in what the API answers him.
    for (const secret of [`Diary ${tag}`, `Surprise ${tag}`, `Second surprise ${tag}`]) {
      if (await ben.page.getByText(secret, { exact: false }).count()) throw new Error(`"${secret}" shows in Ben's Activity`);
    }
    const answered = JSON.stringify(await ctx.api(ben.token, 'GET', `/v1/circles/${circle.id}/activity`));
    if (/Diary|[Ss]urprise/.test(answered) || answered.includes(privateOne.id) || answered.includes(hiddenOne.id)) throw new Error("what the API answers Ben about Activity holds something of Ada's that he may not see");
    await ben.shot('activity-other-person');
    // Opening the tab is what marks it as seen: the dot goes.
    await ben.R('tab', { name: 'Activity', exact: true }).waitFor({ timeout: 20000 });
    if ((await ctx.api(ben.token, 'GET', `/v1/circles/${circle.id}/activity/unread`)).fresh !== 0) throw new Error('Activity is still new to Ben after he opened it');
    // The line opens the page it is about.
    await ben.R('button', { name: new RegExp(`Ada (added|shared) Picnic ${tag}`) }).click();
    await ben.page.waitForURL(new RegExp(`/page/${shown.id}`));
    await ben.T('Bread, cheese, a blanket.').waitFor({ timeout: 20000 });
    await back(ben);
    // Ada, who made them, is told nothing about her own changes.
    await adaReadsActivity();
    if (JSON.stringify(await ctx.api(ada.token, 'GET', `/v1/circles/${circle.id}/activity`)).includes(`Picnic ${tag}`)) throw new Error("Ada's own change shows in her Activity");
    await adaPhone.shot('activity-own-changes');
  });

  let codeId;
  await step('ask-one-look-used-up', async () => {
    // Both set up a Vault. Ada keeps a code and shares it with Ben for one look, which he takes.
    await setUpVault(adaPhone, PASSCODE.ada);
    await setUpVault(ben, PASSCODE.ben);
    await adaPhone.R('button', { name: /^Codes, \d+$/ }).click();
    await adaPhone.R('heading', { name: 'Codes' }).waitFor();
    await adaPhone.R('button', { name: 'Add', exact: true }).click();
    await adaPhone.R('heading', { name: 'New code' }).waitFor();
    await adaPhone.L('Title', { exact: true }).fill(CODE_TITLE);
    await adaPhone.L('Label', { exact: true }).fill('shed');
    await adaPhone.L('Code', { exact: true }).fill(SECRET);
    await adaPhone.R('button', { name: 'Add', exact: true }).click();
    await adaPhone.R('heading', { name: CODE_TITLE }).waitFor({ timeout: 20000 });
    codeId = page.url().split('?')[0].split('/').pop();
    await adaPhone.R('button', { name: /^Share with someone/ }).click();
    await adaPhone.R('checkbox', { name: 'Share with Ben' }).click();
    await adaPhone.R('radio', { name: /^Can see\./ }).click();
    await adaPhone.R('switch', { name: "Gone after it's opened once" }).click();
    await adaPhone.R('button', { name: 'Share with 1 person' }).click();
    await adaPhone.R('button', { name: 'Ben: Can see. Change' }).waitFor({ timeout: 20000 });

    await benOpensCode(codeId);
    await ben.R('button', { name: 'Open it now' }).click();
    await ben.T('This was the one look').waitFor({ timeout: 20000 });
    await ben.R('button', { name: 'Show code' }).click();
    await ben.T(SECRET).waitFor();
    // The look is used up: he knows the code is there and can't open it.
    await benOpensCode(codeId);
    await ben.T('You opened this once').waitFor();
    if (await ben.page.getByText(SECRET).count()) throw new Error('a code that was for one look is shown a second time');
  });

  await step('ask-to-see', async () => {
    // Asking to see it: for today only, for one look, or with no end.
    await ben.R('button', { name: 'Ask to see it' }).click();
    await ben.R('heading', { name: `Ask to see “${CODE_TITLE}”` }).waitFor();
    await ben.T("Ada gets the question in Activity and on their phone, and answers it there. The notification doesn't name the item.").waitFor();
    await ben.R('radio', { name: /^For today only\./, checked: true }).waitFor();
    await ben.shot('ask-to-see');
    let asked = await sent(ben, 'POST', `/v1/things/${codeId}/asks`, () => ben.R('button', { name: 'Ask Ada' }).click());
    if (!asked.ok() || !asked.request().postDataJSON().until) throw new Error('the question was not asked for today only');
    await ben.T(/^You asked Ada (just now|\d+ min ago)\. They haven't answered yet\.$/).waitFor({ timeout: 20000 });
    await ben.shot('ask-waiting');
    // Taking it back: Ada has nothing to answer.
    await ben.R('button', { name: 'Take the question back' }).click();
    await ben.R('button', { name: 'Ask to see it' }).waitFor({ timeout: 20000 });
    if ((await ctx.api(ada.token, 'GET', `/v1/circles/${circle.id}/activity/unread`)).asks !== 0) throw new Error('a question that was taken back still waits for Ada');
    // Asking again.
    await ben.R('button', { name: 'Ask to see it' }).click();
    asked = await sent(ben, 'POST', `/v1/things/${codeId}/asks`, () => ben.R('button', { name: 'Ask Ada' }).click());
    if (!asked.ok()) throw new Error(`asking again gave ${asked.status()}`);
    await ben.T(/^You asked Ada .+They haven't answered yet\.$/).waitFor({ timeout: 20000 });
  });

  await step('ask-not-now', async () => {
    // Ada finds the question in Activity: on the tab's dot, on the Asks chip, and as a line with "Allow".
    await adaPhone.page.goto(WEB_URL + '/');
    await adaPhone.R('tab', { name: 'Activity, something new' }).waitFor({ timeout: 20000 });
    await tab(adaPhone, 'Activity');
    await adaPhone.R('button', { name: 'Asks, 1' }).waitFor({ timeout: 20000 });
    const line = new RegExp(`^New\\. Ben asks to see ${CODE_TITLE} in the Vault\\. .*for today only$`);
    await adaPhone.R('button', { name: line }).waitFor({ timeout: 20000 });
    await adaPhone.R('button', { name: `Allow. Ben asks to see ${CODE_TITLE} in the Vault` }).waitFor();
    await adaPhone.shot('activity-ask');
    // The line itself opens both answers. "Not now" tells the API, and Ben.
    await adaPhone.R('button', { name: line }).click();
    await adaPhone.R('heading', { name: `Ben asks to see ${CODE_TITLE} in the Vault` }).waitFor();
    await adaPhone.T('For today only. Allowing makes a key on this phone that opens it for Ben. Nobody at Homeport can do that for you.').waitFor();
    await adaPhone.shot('answer-ask');
    const askId = (await ctx.api(ada.token, 'GET', `/v1/circles/${circle.id}/activity?filter=asks`)).items.flatMap((one) => one.buttons).find((button) => button.act === 'decline_ask').askId;
    const answer = await sent(adaPhone, 'PUT', `/v1/asks/${askId}`, () => adaPhone.R('button', { name: 'Not now', exact: true }).click());
    if (!answer.ok() || answer.request().postDataJSON().allow !== false) throw new Error('"Not now" was not sent as the answer');
    await adaPhone.T('Ben was told: not now').waitFor({ timeout: 20000 });
    await adaPhone.R('button', { name: /^Allow\. Ben asks/ }).waitFor({ state: 'detached', timeout: 20000 });
    // Ben can still not open it, and is told so; asking again is open to him.
    await benOpensCode(codeId);
    await ben.T('Ada said not now. You can ask again another time.').waitFor({ timeout: 20000 });
    const again = await fetch(`${API_URL}/v1/vault/items/${codeId}/open`, { method: 'POST', headers: { Authorization: 'Bearer ' + ben.token } });
    if (again.ok) throw new Error('"Not now" opened the code to Ben');
    await ben.shot('ask-declined');
  });

  await step('ask-allow', async () => {
    // Ben asks once more, for one look this time.
    await ben.R('button', { name: 'Ask to see it' }).click();
    await ben.R('radio', { name: /^For one look\./ }).click();
    const asked = await sent(ben, 'POST', `/v1/things/${codeId}/asks`, () => ben.R('button', { name: 'Ask Ada' }).click());
    if (!asked.ok() || asked.request().postDataJSON().once !== true) throw new Error('the question was not asked for one look');
    await ben.T(/^You asked Ada .+They haven't answered yet\.$/).waitFor({ timeout: 20000 });

    // Ada's Vault is locked (her phone was opened afresh). "Allow" on the line asks her to unlock first: only her phone can make the key.
    await adaPhone.page.goto(WEB_URL + '/');
    await adaPhone.R('tab', { name: /^Activity/ }).waitFor({ timeout: 20000 });
    await tab(adaPhone, 'Activity');
    await adaPhone.R('button', { name: `Allow. Ben asks to see ${CODE_TITLE} in the Vault` }).click({ timeout: 20000 });
    await adaPhone.T('Unlock the Vault to allow it').waitFor();
    await adaPhone.T('Only your phone can make the key. Unlock, and it carries on by itself.').waitFor();
    await adaPhone.shot('answer-ask-locked');
    // Until her phone has shared it, the API refuses "allow": it holds no key to hand over.
    const askId = (await ctx.api(ada.token, 'GET', `/v1/circles/${circle.id}/activity?filter=asks`)).items.flatMap((one) => one.buttons).find((button) => button.act === 'allow_ask').askId;
    const early = await fetch(`${API_URL}/v1/asks/${askId}`, { method: 'PUT', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + ada.token }, body: JSON.stringify({ allow: true }) });
    if (early.status !== 409) throw new Error(`"allow" before the phone shared the item was answered ${early.status}`);
    // Unlocked, it carries on by itself: the item is shared from this phone, then the API is told.
    await adaPhone.R('button', { name: 'Unlock with your passcode' }).click();
    await adaPhone.L('Passcode', { exact: true }).fill(PASSCODE.ada);
    await adaPhone.R('button', { name: 'Unlock', exact: true }).click();
    await adaPhone.T('Ben can open it now').waitFor({ timeout: 40000 });
    await adaPhone.shot('ask-allowed');
    await adaPhone.R('button', { name: /^Allow\. Ben asks/ }).waitFor({ state: 'detached', timeout: 20000 });
    await adaPhone.R('button', { name: new RegExp(`Ben asks to see ${CODE_TITLE} in the Vault\\. .*You said yes`) }).waitFor({ timeout: 20000 });

    // Ben is told in his Activity, and uses it: one look, as he asked.
    await ben.page.goto(WEB_URL + '/');
    await tab(ben, 'Activity');
    await ben.R('button', { name: new RegExp(`Ada said yes: you can open ${CODE_TITLE}`) }).click({ timeout: 20000 });
    await onceUnlocked(ben, PASSCODE.ben, ben.page.getByRole('button', { name: 'Open it now' }).last());
    await ben.R('button', { name: 'Open it now' }).click();
    await ben.R('button', { name: 'Show code' }).click({ timeout: 20000 });
    await ben.T(SECRET).waitFor();
    await ben.shot('ask-used');
  });

  let benPrivate;
  let benShared;
  await step('leave-circle', async () => {
    // Ben has a page of his own and one he shares. He leaves the circle himself.
    benPrivate = await ctx.api(ben.token, 'POST', '/v1/pages', { clientId: id(), circleId: circle.id, title: `Ben's own ${tag}`, body: 'Mine.', audience: 'me' });
    benShared = await ctx.api(ben.token, 'POST', '/v1/pages', { clientId: id(), circleId: circle.id, title: `Ben's shared ${tag}`, body: 'Ours.', audience: 'circle' });
    const numbers = await ctx.api(ben.token, 'GET', `/v1/circles/${circle.id}/leaving`);
    if (numbers.onlyYours !== 1 || numbers.shared < 1) throw new Error(`the numbers before leaving are not what Ben made: ${JSON.stringify(numbers)}`);
    await ben.page.goto(WEB_URL + '/settings/leaving');
    await ben.T(`If you leave ${CIRCLE}`).waitFor({ timeout: 20000 });
    await ben.R('button', { name: `Leave ${CIRCLE}` }).click();
    await ben.R('heading', { name: `Leave ${CIRCLE}?` }).waitFor();
    await ben.T('1 thing only you can see is deleted. Export first to keep it.').waitFor({ timeout: 20000 });
    await ben.T(numbers.shared === 1 ? '1 thing you shared stays for the others, in your name' : `${numbers.shared} things you shared stay for the others, in your name`).waitFor();
    await ben.shot('leave-sheet-numbers');
    const left = await sent(ben, 'DELETE', `/v1/members/${(await ctx.api(ben.token, 'GET', '/v1/circles'))[0].myMemberId}`, () => ben.page.getByRole('button', { name: `Leave ${CIRCLE}` }).last().click());
    if (!left.ok()) throw new Error(`leaving gave ${left.status()}`);
    // He is in no circle now: the app is on setting one up, and stays there.
    await ben.T('Who are you sharing with?').waitFor({ timeout: 20000 });
    await ben.shot('after-leaving');
    if ((await ctx.api(ben.token, 'GET', '/v1/circles')).length !== 0) throw new Error('Ben is still in a circle after leaving');

    // What he shared stays for Ada; what he kept private went with him.
    const kept = await ctx.api(ada.token, 'GET', `/v1/pages/${benShared.id}`);
    if (kept.title !== `Ben's shared ${tag}`) throw new Error("the page Ben shared didn't stay for Ada");
    await adaPhone.page.goto(`${WEB_URL}/page/${benShared.id}`);
    await adaPhone.T('Ours.', { exact: true }).waitFor({ timeout: 20000 });
    await adaPhone.shot('left-shared-stays');
    // Even back in the circle he doesn't get it again: it was deleted, not put aside.
    await ctx.api(ben.token, 'PUT', `/v1/join/${joinCode}`);
    const gone = await fetch(`${API_URL}/v1/pages/${benPrivate.id}`, { headers: { Authorization: 'Bearer ' + ben.token } });
    if (gone.status !== 404) throw new Error(`Ben's private page was answered ${gone.status} after he left`);
    const still = await fetch(`${API_URL}/v1/pages/${benShared.id}`, { headers: { Authorization: 'Bearer ' + ben.token } });
    if (still.status !== 200) throw new Error(`the page Ben shared was answered ${still.status} to him after he came back`);
    // The code Ada let him see stopped working for him when he left.
    const code = await fetch(`${API_URL}/v1/vault/items/${codeId}/open`, { method: 'POST', headers: { Authorization: 'Bearer ' + ben.token } });
    if (code.ok) throw new Error('a shared code still opens for someone who left the circle');
    await ben.close();
  });

  await step('delete-account', async () => {
    // Ada deletes her account: only Homeport. She is signed out, and the welcome screen says what became of it.
    await adaPhone.page.goto(WEB_URL + '/settings/delete-account');
    await adaPhone.T('Delete your account?').waitFor({ timeout: 20000 });
    await adaPhone.R('radio', { name: /^Only Homeport\./, checked: true }).waitFor();
    await adaPhone.shot('delete-account');
    const gone = await sent(adaPhone, 'DELETE', '/v1/me', () => adaPhone.R('button', { name: 'Delete my account' }).click());
    if (!gone.ok() || !/journeyToo=false/.test(gone.url())) throw new Error('the account was not deleted as "only Homeport"');
    await adaPhone.T('Get started').waitFor({ timeout: 20000 });
    await adaPhone.T('Your Homeport account is deleted. Your sign-in is untouched, so Journey goes on as it was.').waitFor();
    await adaPhone.shot('farewell');
    await adaPhone.R('button', { name: 'Close', exact: true }).click();
    await adaPhone.T(/^Your Homeport account is deleted/).waitFor({ state: 'detached' });
  });
};
