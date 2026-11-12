// Milestone 4, the templates: the gallery (its chips and counts, search, starting a plain template and one
// that does work, the sentence for one that isn't ready), and Notes' own three that do work: the weekly meal
// plan, the chore wheel and the time capsule. Where a template keeps something from someone it is walked as
// two people: Sam joins Nora's family through the API, seals a letter into a capsule that Nora then can't
// read (and neither can Sam), and sees a chore Nora ticked as done.
//
// It can be run again and again on the same data: what an earlier run left (a dinner, a tick) is taken back
// through the API first.
const path = require('path');
const { soundFile } = require('../sound');

exports.run = async function run(ctx) {
  const { page, T, R, L, shot, step, tag, WEB_URL, IMG, CODE } = ctx;
  let nora;
  let linds;
  const asNora = (method, address, body) => ctx.api(nora, method, address, body);
  /** Puts the sheet that is up away, the way a person does: by tapping the dimmed page above it. */
  const closeSheet = (phone) => phone.R('button', { name: 'Close', exact: true }).click({ position: { x: 24, y: 24 } });
  /** The sample board of a template in The Linds, as Nora sees it today. */
  const sampleBoard = async (template, title) => {
    const boards = (await asNora('GET', `/v1/circles/${linds.id}/boards?template=${template}&limit=50`)).items;
    const found = boards.find((board) => !title || board.title === title);
    return asNora('GET', `/v1/boards/${found.id}`);
  };
  /** From the gallery: a template's card, and the board of it the circle has already. */
  const openFromGallery = async (card, row) => {
    await page.goto(WEB_URL + '/templates');
    await R('button', { name: card }).click();
    await T('In The Linds already').waitFor();
    await R('button', { name: row }).click();
  };
  const idInAddress = (address) => address.match(/\/board\/([0-9a-f-]{36})/)[1];

  await step('templates', async () => {
    await ctx.signIn('nora@example.com');
    nora = (await ctx.api(null, 'POST', '/local-auth/token', { email: 'nora@example.com', code: CODE })).accessToken;
    linds = (await asNora('GET', '/v1/circles')).find((circle) => circle.name === 'The Linds');
    await page.goto(WEB_URL + '/templates');
    // The chips and counts as the API serves them for a family: everything first, then its shelves and topics.
    await R('heading', { name: 'Templates' }).waitFor({ timeout: 20000 });
    for (const chip of ['All 53', 'Keepsakes', 'Home', 'Kids', 'Food', 'Fair and fun']) await R('button', { name: chip, exact: true }).waitFor();
    // The family's own stand first, and the ones that do work are marked LIVE.
    await R('button', { name: 'Weekly meal plan. Does work for you. Plan dinners, get the shopping list' }).waitFor();
    await R('button', { name: 'House manual. Wi‑Fi, bins, boiler, who to call' }).waitFor();
    if ((await page.getByText('LIVE', { exact: true }).count()) < 10) throw new Error('the templates that do work are not marked LIVE');
    await shot('templates');
    await R('button', { name: 'Keepsakes', exact: true }).click();
    await R('button', { name: /^The good things jar\./ }).waitFor();
    await R('button', { name: /^House manual\./ }).waitFor({ state: 'detached' });
    await R('button', { name: 'Food', exact: true }).click();
    await R('button', { name: /^Recipe book\./ }).waitFor();
    await R('button', { name: /^Chore wheel\./ }).waitFor({ state: 'detached' });
  });

  await step('templates-search', async () => {
    await R('button', { name: 'Search templates' }).click();
    await L('Search templates').fill('letters');
    await R('button', { name: /^Time capsule\./ }).waitFor();
    await R('button', { name: /^Open when…\./ }).waitFor();
    await R('button', { name: /^Recipe book\./ }).waitFor({ state: 'detached' });
    await shot('templates-search');
    await L('Search templates').fill('nothing like this');
    await T('Nothing by that name').waitFor();
    await R('button', { name: 'Close search' }).click();
    await R('button', { name: 'All 53', exact: true }).waitFor();
  });

  await step('templates-not-ready', async () => {
    // One whose rules aren't in the API yet says so, in the API's words, and can't be started. (A flat's
    // cleaning rota is one of six that are marked LIVE and have no drawing of their own yet.)
    await R('button', { name: 'Search templates' }).click();
    await L('Search templates').fill('Cleaning rota');
    await R('button', { name: /^Cleaning rota\./ }).click();
    await T('Coming with the next update').waitFor();
    await T("It can't be started yet. Every template without this note can.").waitFor();
    if (await R('button', { name: 'Start', exact: true }).isVisible().catch(() => false)) throw new Error('a template that is not ready offers Start');
    await shot('templates-not-ready');
    await closeSheet(ctx);
    await T('Coming with the next update').waitFor({ state: 'detached' });
    await R('button', { name: 'Close search' }).click();
    await R('button', { name: 'All 53', exact: true }).waitFor();
  });

  await step('templates-start-plain', async () => {
    // A plain template makes its pages and lists, and its first page opens.
    await R('button', { name: 'All 53', exact: true }).click();
    await R('button', { name: /^House manual\./ }).click();
    await T('Starting it makes').waitFor();
    await T('Page · House manual').waitFor();
    await T('Checklist · When we go away').waitFor();
    await R('button', { name: 'Seen by Only you. Change' }).waitFor();
    await shot('templates-start');
    const [started] = await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/templates/house_manual/start')), R('button', { name: 'Start', exact: true }).click()]);
    if (started.status() !== 201) throw new Error(`starting the house manual gave ${started.status()}`);
    const made = (await started.json()).made;
    if (made.map((thing) => thing.kind).join() !== 'page,checklist') throw new Error(`the house manual made ${made.map((thing) => thing.kind)}`);
    await page.waitForURL(new RegExp(`/page/${made[0].id}`));
    await T('House manual').waitFor({ timeout: 20000 });
    await shot('templates-started-plain');
    // What it made is this run's alone: it is taken away again, so the next run starts the same.
    for (const thing of made) await asNora('DELETE', `/v1/things/${thing.id}`);
  });

  let capsuleId;
  await step('templates-start-live', async () => {
    // One that does work asks what it needs to begin, makes its board, and the board opens.
    await page.goto(WEB_URL + '/templates');
    await R('button', { name: /^Time capsule\./ }).click();
    await T('This one does work for you: it keeps itself up to date as you use it.').waitFor();
    if ((await R('button', { name: 'Start another' }).getAttribute('aria-disabled')) !== 'true') throw new Error('a capsule could be started without the day it opens');
    await L('What it is called').fill(`Capsule ${tag}`);
    await R('button', { name: /^The day it opens: Choose a day/ }).click();
    await R('button', { name: 'Next month' }).click();
    await R('button', { name: /^15 / }).click();
    await R('button', { name: /^The day it opens: 15 / }).waitFor();
    // Shared with the family from the start, so everyone can add to it.
    await R('button', { name: 'Seen by Only you. Change' }).click();
    await R('button', { name: 'Seen by The Linds. Change' }).waitFor();
    await shot('templates-start-live');
    await R('button', { name: 'Start another' }).click();
    await R('heading', { name: `Capsule ${tag}` }).waitFor({ timeout: 20000 });
    await T('Nothing inside yet. A letter is a good first thing.').waitFor();
    capsuleId = idInAddress(page.url());
  });

  await step('meal-plan', async () => {
    // What an earlier run left on the plan is taken off first.
    const before = await sampleBoard('meal_plan');
    const after = await asNora('GET', `/v1/boards/${before.id}?show=${nextWeek()}`);
    for (const day of [...before.view.days, ...after.view.days]) for (const meal of day.meals) if (meal.name === 'Baked salmon' || meal.name.startsWith('Walk-through')) await asNora('DELETE', `/v1/board-entries/${meal.id}`);
    await asNora('PATCH', `/v1/boards/${before.id}`, { settings: { cookingFor: 4, toGroceries: true } });

    await openFromGallery(/^Weekly meal plan\. Does work/, /^Weekly meal plan\. \d+ dinners? this week/);
    await R('heading', { name: 'Weekly meal plan' }).waitFor({ timeout: 20000 });
    // The week with its dinners and who cooks, the recipes as chips, and the two rows that do the work.
    for (const weekday of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) await T(weekday, { exact: true }).waitFor();
    await R('button', { name: /^Monday\. Tomato pasta\. 25 min\. Alex cooks/ }).waitFor();
    await T('Mia and Leo choose').waitFor();
    await R('button', { name: 'Baked salmon. Plan it' }).waitFor();
    await T(/^\d+ ingredients go to Groceries$/).waitFor();
    await R('switch', { name: 'Send ingredients to Groceries', checked: true }).waitFor();
    await L('Cooking for 4').waitFor();
    await R('button', { name: /^Seen by: The Linds/ }).waitFor();
    await shot('meal-plan');
  });

  const going = async () => Number((await T(/^\d+ ingredients? (go|goes) to Groceries$/).innerText()).match(/\d+/)[0]);

  await step('meal-plan-recipe', async () => {
    // A recipe is dropped onto a day (tap it, then the day), and its ingredients go to Groceries.
    const before = await going();
    await R('button', { name: 'Baked salmon. Plan it' }).click();
    await T('Now tap the day for Baked salmon.').waitFor();
    await shot('meal-plan-recipe-chosen');
    await R('button', { name: 'Sunday. Drop Baked salmon here' }).click();
    await R('button', { name: /^Sunday\. Baked salmon\. 35 min/ }).waitFor();
    await T(`${before + 5} ingredients go to Groceries`).waitFor();
    // One of them is at home already: it comes off the count.
    await R('button', { name: /^Sunday\. Baked salmon/ }).click();
    await R('heading', { name: 'Baked salmon' }).waitFor();
    await R('checkbox', { name: 'Lemon', checked: false }).click();
    await R('checkbox', { name: 'Lemon', checked: true }).waitFor();
    await T('At home already').waitFor();
    await shot('meal-plan-meal');
    await closeSheet(ctx);
    await T(`${before + 4} ingredients go to Groceries`).waitFor();
  });

  await step('meal-plan-by-hand', async () => {
    // A dinner written by hand, in another week (More holds the weeks).
    await R('button', { name: 'More', exact: true }).click();
    await R('button', { name: 'Next week' }).click();
    await T(/^\d+ to \d+ November$|^\d+ \w+ to \d+ \w+$/).waitFor();
    await R('button', { name: 'Tuesday. Drop a recipe here' }).click();
    await R('heading', { name: 'Dinner on Tuesday' }).waitFor();
    await L('What is it?').fill('Walk-through stew');
    await L('Minutes to make').fill('50');
    await R('button', { name: 'Alex', exact: true }).click();
    await L('What it needs, one per line').fill('Beans\nCarrots');
    await shot('meal-plan-add');
    await R('button', { name: 'Add to the plan' }).click();
    await R('button', { name: 'Tuesday. Walk-through stew. 50 min. Alex cooks' }).waitFor();
    await T('2 ingredients go to Groceries').waitFor();
    await shot('meal-plan-next-week');
    await R('button', { name: 'More', exact: true }).click();
    await R('button', { name: 'Back to this week' }).click();
    await R('button', { name: /^Monday\. Tomato pasta/ }).waitFor();
  });

  await step('meal-plan-switches', async () => {
    // The Groceries switch and how many it cooks for are the board's settings.
    await R('switch', { name: 'Send ingredients to Groceries' }).click();
    await R('switch', { name: 'Send ingredients to Groceries', checked: false }).waitFor();
    await T(/^\d+ ingredients stay on the plan$/).waitFor();
    await shot('meal-plan-groceries-off');
    await R('switch', { name: 'Send ingredients to Groceries' }).click();
    await R('switch', { name: 'Send ingredients to Groceries', checked: true }).waitFor();
    await R('button', { name: 'Cook for one more' }).click();
    await L('Cooking for 5').waitFor();
    await R('button', { name: 'Cook for one fewer' }).click();
    await L('Cooking for 4').waitFor();
    // More holds what every board can do: who sees it, a new name, deleting it for its owner.
    await R('button', { name: 'More', exact: true }).click();
    await R('button', { name: /^Who can see this/ }).waitFor();
    await R('button', { name: 'Rename' }).waitFor();
    await R('button', { name: 'Delete' }).waitFor();
    await shot('board-more');
    await R('button', { name: /^Who can see this/ }).click();
    await T('Who can see this?').waitFor();
    await R('button', { name: 'Done' }).click();
    await T('Who can see this?').waitFor({ state: 'detached' });
  });

  let wheelId;
  await step('chore-wheel', async () => {
    // An earlier run's tick is taken back, so Nora's job starts undone.
    const wheel = await sampleBoard('chore_wheel');
    wheelId = wheel.id;
    const bins = wheel.view.jobs.find((job) => job.name === 'Bins and recycling');
    for (const day of bins.doneOn) await asNora('POST', `/v1/boards/${wheel.id}/act`, { verb: 'tick', body: { jobId: bins.id, done: false, day } });

    await openFromGallery(/^Chore wheel\. Does work/, /^Chore wheel\. Week \d+/);
    await R('heading', { name: 'Chore wheel' }).waitFor({ timeout: 20000 });
    await T('Turns every Monday').waitFor();
    await R('button', { name: /^Week \d+\. Turn the wheel to next week/ }).waitFor();
    // This week's jobs and whose they are; a child's row shows their stars.
    await R('checkbox', { name: /^Bins and recycling\. Nora · Tuesday and Friday evening/, checked: false }).waitFor();
    await R('checkbox', { name: /^Laundry\. Alex · all 2 done/, checked: true }).waitFor();
    await R('checkbox', { name: /^Set the table\. Mia · .* stars$/ }).waitFor();
    await R('checkbox', { name: /^Feed Biscuit\. Leo · .* stars$/ }).waitFor();
    await T('Stars turn into pocket money').waitFor();
    await T("10 stars pay €2 into “Mia's skates fund”.").waitFor();
    await shot('chore-wheel');
  });

  await step('chore-wheel-tick', async () => {
    // Nora ticks her job for today.
    await R('checkbox', { name: /^Bins and recycling/ }).click();
    await R('checkbox', { name: /^Bins and recycling\. Nora · (done this morning|done today)/, checked: true }).waitFor();
    // A child's tick is a star: taking Leo's tick of today back and giving it again moves his count by one.
    const stars = async () => Number((await R('checkbox', { name: /^Feed Biscuit/ }).getAttribute('aria-label')).match(/(\d+) stars?$/)[1]);
    const had = await stars();
    await R('checkbox', { name: /^Feed Biscuit/ }).click();
    await R('checkbox', { name: new RegExp(`^Feed Biscuit\\..* ${had - 1} stars?$`) }).waitFor();
    await R('checkbox', { name: /^Feed Biscuit/ }).click();
    await R('checkbox', { name: new RegExp(`^Feed Biscuit\\..* ${had} stars?$`) }).waitFor();
    await shot('chore-wheel-ticked');
    // The wheel turns to next week: every job is the next person's, and there is nothing to tick yet.
    await R('button', { name: /^Week \d+\. Turn the wheel to next week/ }).click();
    await T(/^Next week, from \d+ \w+/).waitFor();
    await R('checkbox', { name: /^Bins and recycling\. Alex · Tuesday and Friday evening/ }).waitFor();
    await R('checkbox', { name: /^Feed Biscuit\. Nora · Every morning/ }).waitFor();
    await shot('chore-wheel-next-week');
    await R('button', { name: /^Week \d+, next week\. Turn the wheel back/ }).click();
    await T('Turns every Monday').waitFor();
  });

  await step('time-capsule', async () => {
    await openFromGallery(/^Time capsule\. Does work/, /^For Mia, on her 18th birthday\./);
    await R('heading', { name: 'For Mia, on her 18th birthday' }).waitFor({ timeout: 20000 });
    // The countdown, who it is kept from, and what is sealed inside as closed envelopes.
    await T(/^Opens 4 December 2034 · \d+ years to go$/).waitFor();
    await R('button', { name: /^Seen by: Not Mia/ }).waitFor();
    await T('Sealed inside').waitFor();
    await R('button', { name: /^A letter from Nora\. 2 pages · sealed .*\. Sealed$/ }).waitFor();
    await R('button', { name: /^A voice message from Alex\. 2 min 14 s\. Sealed$/ }).waitFor();
    await R('button', { name: /^Grandma Astrid's cookie recipe\. In her handwriting, with a photo\. Sealed$/ }).waitFor();
    await R('button', { name: /^12 photos from this year\./ }).waitFor();
    await T('Sealed means sealed. You can add, but nobody can read it before the date.').waitFor();
    await shot('time-capsule');
    // Sealed means sealed, also for the one who wrote it.
    await R('button', { name: /^A letter from Nora\./ }).click();
    await T('Sealed means sealed. It opens on 4 December 2034, and nobody can read it before then.').waitFor();
    await shot('time-capsule-sealed');
    await R('button', { name: 'OK' }).click();
  });

  await step('time-capsule-add', async () => {
    // Into this run's own capsule: a photo and a recording (a picked sound file stands in for the microphone).
    await page.goto(`${WEB_URL}/board/${capsuleId}`);
    await R('heading', { name: `Capsule ${tag}` }).waitFor({ timeout: 20000 });
    await R('button', { name: 'Add to the capsule' }).click();
    await R('radio', { name: 'Letter', checked: true }).waitFor();
    await shot('time-capsule-add');
    await R('radio', { name: 'Photo' }).click();
    const [photos] = await Promise.all([page.waitForEvent('filechooser'), R('button', { name: 'Choose a photo' }).click()]);
    await photos.setFiles(path.join(IMG, 'desk.jpg'));
    await R('button', { name: 'Choose another photo' }).waitFor();
    await L('A line for the outside').fill('The kitchen table, this year');
    await R('button', { name: 'Seal it in' }).click();
    await R('button', { name: /^A photo from Nora\. The kitchen table, this year\. Sealed$/ }).waitFor({ timeout: 20000 });

    await R('button', { name: 'Add to the capsule' }).click();
    await R('radio', { name: 'Voice' }).click();
    const [sounds] = await Promise.all([page.waitForEvent('filechooser'), R('button', { name: 'Add a recording' }).click()]);
    await sounds.setFiles(soundFile('capsule-message', 3));
    await T('Recording attached · 0:03').waitFor();
    await R('button', { name: 'Seal it in' }).click();
    await R('button', { name: /^A voice message from Nora\. 3 s\. Sealed$/ }).waitFor({ timeout: 20000 });

    // A letter can wait as a draft, which only its writer sees, and is sealed when it is ready.
    await R('button', { name: 'Add to the capsule' }).click();
    await L('Your letter').fill(`A first try, ${tag}.`);
    await R('button', { name: 'Keep it as a draft' }).click();
    await R('button', { name: 'A letter from Nora. Draft · only you can see it' }).click();
    await T(`A first try, ${tag}.`).waitFor();
    await shot('time-capsule-draft');
    await R('button', { name: 'Seal it in' }).click();
    await R('button', { name: /^A letter from Nora\. 1 page · sealed .*\. Sealed$/ }).waitFor();
    await T(`A first try, ${tag}.`).waitFor({ state: 'detached' });
  });

  await step('two-people', async () => {
    // Sam joins Nora's family (the join link is in the circle for its owner), on a second phone.
    const sam = await ctx.second('Sam Demo');
    try {
      const code = (await asNora('GET', `/v1/circles/${linds.id}`)).joinUrl.split('/').pop();
      await ctx.api(sam.token, 'PUT', `/v1/join/${code}`);
      // Sam's phone still thinks Sam is in no circle: the invitation's own address opens the circle there.
      await sam.page.goto(`${WEB_URL}/join/${code}`);
      await sam.R('button', { name: 'Open The Linds' }).click();
      await sam.R('button', { name: 'The Linds. Change circle' }).waitFor({ timeout: 20000 });

      // Sam writes a letter into the capsule and seals it.
      const secret = `Only for the day it opens, ${tag}.`;
      await sam.page.goto(`${WEB_URL}/board/${capsuleId}`);
      await sam.R('heading', { name: `Capsule ${tag}` }).waitFor({ timeout: 20000 });
      await sam.R('button', { name: 'Add to the capsule' }).click();
      await sam.L('Your letter').fill(secret);
      await sam.R('button', { name: 'Seal it in' }).click();
      await sam.R('button', { name: /^A letter from Sam\. 1 page · sealed .*\. Sealed$/ }).waitFor({ timeout: 20000 });
      // Once sealed, the one who wrote it can't read it either.
      await sam.R('button', { name: /^A letter from Sam\./ }).click();
      await sam.T(/^Sealed means sealed\. It opens on 15 /).waitFor();
      if (await sam.page.getByText(secret).count()) throw new Error('the writer can still read a sealed letter');
      await sam.shot('time-capsule-sealed-writer');
      const forSam = (await ctx.api(sam.token, 'GET', `/v1/boards/${capsuleId}`)).view.items.find((item) => item.title === 'A letter from Sam');
      if (!forSam || forSam.text !== null || !forSam.sealed) throw new Error('the API still hands a sealed letter to its writer');

      // Nora sees that Sam's letter is in the capsule, and can't read it.
      await page.goto(`${WEB_URL}/board/${capsuleId}`);
      await R('button', { name: /^A letter from Sam\. 1 page · sealed .*\. Sealed$/ }).waitFor({ timeout: 20000 });
      await R('button', { name: /^A letter from Sam\./ }).click();
      await T(/^Sealed means sealed\. It opens on 15 /).waitFor();
      if (await page.getByText(secret).count()) throw new Error("Nora can read Sam's sealed letter");
      const forNora = (await asNora('GET', `/v1/boards/${capsuleId}`)).view.items.find((item) => item.title === 'A letter from Sam');
      if (!forNora || forNora.text !== null) throw new Error("the API hands Sam's sealed letter to Nora");
      await shot('time-capsule-two-people');
      await R('button', { name: 'OK' }).click();

      // The chore Nora ticked shows as done for Sam.
      await sam.page.goto(`${WEB_URL}/board/${wheelId}`);
      await sam.R('checkbox', { name: /^Bins and recycling\. Nora · (done this morning|done today)/, checked: true }).waitFor({ timeout: 20000 });
      await sam.shot('chore-wheel-two-people');
    } catch (problem) {
      // What went wrong on the second phone is only to be seen there.
      await sam.page.screenshot({ path: `${ctx.out}/${ctx.scheme}-FAILED-two-people-sam.png` }).catch(() => undefined);
      console.log(`ON SAM'S SCREEN: ${await sam.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(-400)).catch(() => '(could not be read)')}`);
      throw problem;
    } finally {
      await sam.close();
    }
  });

  await step('board-delete', async () => {
    // Its owner deletes a board, after being asked; it is gone for everyone, and Home is where that leaves her.
    await R('button', { name: 'More', exact: true }).click();
    await R('button', { name: 'Delete' }).click();
    await R('heading', { name: `Delete “Capsule ${tag}”?` }).waitFor();
    await shot('board-delete');
    await R('button', { name: 'Delete it' }).click();
    await R('tab', { name: 'Home' }).waitFor({ timeout: 20000 });
    ctx.expectNotFound = true;
    await page.goto(`${WEB_URL}/board/${capsuleId}`);
    await R('heading', { name: "This isn't available" }).waitFor({ timeout: 20000 });
    await shot('board-gone');
    await R('button', { name: 'Go to Home' }).click();
    await R('tab', { name: 'Home' }).waitFor({ timeout: 20000 });
    ctx.expectNotFound = false;
    await ctx.signOut();
  });

  /** A day of next week, as the API takes it for `show`. */
  function nextWeek() {
    const day = new Date(Date.now() + 7 * 86400000);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  }
};
