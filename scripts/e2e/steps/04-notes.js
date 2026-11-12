// Milestone 4, Notes: Notes on Home, a space with folders inside folders, a page built from blocks, the sheet
// that adds a block, a list two people tick at once, the same list with no connection, and (from milestone
// 1, drawn on a page) the audience sheet and a page that is hidden from one person.
//
// As two people: Nora, with the sample circles, and Robin, a new person who joins her family through the
// API and has a phone of their own. What the walk makes, it makes in a space of its own ("Allotment") and
// takes away again at the end; what it ticks in the sample data it unticks. So the walk can run again, in
// the other theme, on the same data.
const path = require('path');
const { randomUUID } = require('crypto');

/** The space the walk makes, and the names of everything it makes: all of it is deleted at the end. */
const SPACE = 'Allotment';
const MINE = ['Seeds', 'Tomatoes', 'Tomatoes and peppers', 'Sowing dates', 'Seed order', 'Watering rota', 'Surprise for Alex', 'To buy', 'Winter jobs'];
/** In the sample shopping list: the lines the walk ticks, and the lines it adds (each from "add again", so the list has held them before). */
const TICKS = ['Bananas', 'Strawberries, 2 boxes', 'Birthday candles', 'Dog food for Biscuit'];
const ADDS = ['Eggs', 'Bread', 'Coffee'];

exports.run = async function run(ctx) {
  const { page, T, R, L, shot, step, WEB_URL, IMG, CODE } = ctx;
  let nora;
  let linds;
  let groceries;
  let robin;
  let secret;

  /**
   * Holds a row or a block down until its menu opens. (A sheet that is still sliding away can swallow the
   * hold and leave a plain press behind; then the row is held once more.)
   */
  const hold = async (locator) => {
    const menu = page.getByRole('button', { name: /^(Pin to the top of Notes|Take the pin away|Move up|Move down|Remove from the page)$/ });
    for (let tries = 0; tries < 3; tries += 1) {
      await page.waitForTimeout(400);
      await locator.click({ delay: 700 });
      if (await menu.last().waitFor({ timeout: 2000 }).then(() => true, () => false)) return;
    }
    throw new Error('holding it down did not open its menu');
  };
  /** Does something on a phone and waits for the API to have taken the queue of changes that it sent. */
  const sent = async (phonePage, kind, act) => {
    const [answer] = await Promise.all([phonePage.waitForResponse((r) => r.request().method() === 'POST' && new RegExp(`/v1/${kind}/[^/]+/changes$`).test(r.url())), act()]);
    if (!answer.ok()) throw new Error(`sending changes gave ${answer.status()}`);
  };
  /** Shows what is in a folder, if it isn't showing already. */
  const unfold = async (row) => {
    if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
  };
  /** How many lines on a phone's screen say that they wait. */
  const waiting = (phonePage) => phonePage.getByText('waiting', { exact: true }).count();
  /** Back, as many screens as it takes. */
  const back = async (screens = 1) => {
    for (let gone = 0; gone < screens; gone += 1) await R('button', { name: 'Back' }).click();
  };

  /** Deletes a folder of the walk with everything in it. */
  const removeFolder = async (id) => {
    const inside = (await ctx.api(nora, 'GET', `/v1/folders/${id}/items?limit=100`)).items;
    for (const item of inside) {
      if (item.kind === 'folder') await removeFolder(item.id);
      else await ctx.api(nora, 'DELETE', `/v1/things/${item.id}`).catch(() => undefined);
    }
    await ctx.api(nora, 'DELETE', `/v1/things/${id}`).catch(() => undefined);
  };
  /** Puts the sample data back as it was: nothing of the walk's own is left, and what it ticked is unticked. */
  const tidy = async () => {
    const list = await ctx.api(nora, 'GET', `/v1/checklists/${groceries.id}`);
    const changes = list.items.flatMap((item) => (ADDS.includes(item.text) ? [{ op: 'remove', itemId: item.id }] : TICKS.includes(item.text) && item.done ? [{ op: 'change', itemId: item.id, change: { done: false } }] : []));
    if (changes.length) await ctx.api(nora, 'POST', `/v1/checklists/${groceries.id}/changes`, { changes });
    if (!list.showTicked) await ctx.api(nora, 'PUT', `/v1/checklists/${groceries.id}/look`, { showTicked: true });
    const spaces = (await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/notes`)).spaces.filter((space) => space.title === SPACE);
    for (const space of spaces) await removeFolder(space.id);
    // A list that was started inside a page isn't in any folder: it is found by its name.
    for (const kind of ['pages', 'checklists']) {
      const things = (await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/${kind}?limit=100`)).items.filter((thing) => thing.mine && MINE.includes(thing.title));
      for (const thing of things) await ctx.api(nora, 'DELETE', `/v1/things/${thing.id}`).catch(() => undefined);
    }
  };

  try {
    await step('notes', async () => {
      await ctx.signIn('nora@example.com');
      await R('button', { name: 'The Linds. Change circle' }).waitFor();
      nora = (await ctx.api(null, 'POST', '/local-auth/token', { email: 'nora@example.com', code: CODE })).accessToken;
      linds = (await ctx.api(nora, 'GET', '/v1/circles')).find((circle) => circle.name === 'The Linds');
      const home = (await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/notes`)).spaces.find((space) => space.title === 'Home');
      groceries = (await ctx.api(nora, 'GET', `/v1/folders/${home.id}/items`)).items.find((item) => item.kind === 'checklist' && item.title === 'Groceries');
      // (In case an earlier walk broke off half way.)
      await tidy();

      // 5.1: what she pinned, with a line on where each stands; then the spaces, with what is in each and who sees it.
      await R('tab', { name: 'Notes' }).click();
      await R('heading', { name: 'Pinned' }).waitFor();
      await R('button', { name: /^Groceries\. \d+ left · Alex is (ticking|adding)$/ }).waitFor();
      await R('button', { name: /^Wi‑Fi and smart home\. Edited / }).waitFor();
      for (const space of ['Home', 'Kids', 'Trips', "Nora's work"]) await R('button', { name: new RegExp(`^${space}\\. \\d+ folders · \\d+ pages?$`) }).waitFor();
      await page.getByLabel('Seen by: Alex and you').last().waitFor();
      await page.getByLabel('Seen by: Only you').last().waitFor();
      await shot('notes');
      // Under them: what changed lately, and the pages and lists that are in no folder yet.
      await R('heading', { name: 'Lately' }).scrollIntoViewIfNeeded();
      await R('button', { name: /^Not filed\. \d+ (page or list|pages and lists) in no folder yet$/ }).scrollIntoViewIfNeeded();
      await shot('notes-lately');
      await R('button', { name: /^Not filed\./ }).click();
      await R('heading', { name: 'Not filed' }).waitFor();
      await shot('notes-not-filed');
      await back();
      // "Spaces" lists them all, and is where a new one is made (further down).
      await R('button', { name: 'Spaces. See all' }).click();
      await R('button', { name: 'New space' }).waitFor();
      await shot('notes-spaces');
      await R('button', { name: 'Close' }).click({ position: { x: 195, y: 60 } });
      await R('button', { name: 'New space' }).waitFor({ state: 'detached' });
    });

    await step('space', async () => {
      // 5.2: folders inside folders that open in place, with pages, lists and sheets side by side.
      await R('button', { name: /^Home\. \d+ folders · / }).click();
      await R('heading', { name: 'Home', exact: true }).waitFor();
      await T(/^\d+ pages$/).waitFor();
      await R('button', { name: 'Seen by: The Linds. Change who can see this' }).waitFor();
      await R('button', { name: /^House manual\. Folder\. \d+ pages\. Show/ }).click();
      await R('button', { name: /^Wi‑Fi and smart home\. Page/ }).waitFor();
      await R('button', { name: /^Bins and recycling days\. Page/ }).waitFor();
      // One level further in, and closed again.
      await R('button', { name: /^Appliances and manuals\. Folder\./ }).click();
      await R('button', { name: /^Boiler\. Page/ }).waitFor();
      await shot('space-nested');
      await R('button', { name: /^Appliances and manuals\. Folder\./ }).click();
      await R('button', { name: /^Boiler\. Page/ }).waitFor({ state: 'detached' });
      // A list says how much is left and who is in it; a sheet where it stands; a hidden page from whom.
      await R('button', { name: /^Groceries\. List\. \d+ left · Alex is / }).waitFor();
      await R('button', { name: /^Christmas plan\. Page\. Not Mia or Leo$/ }).waitFor();
      await T('Page, checklist, sheet or folder').waitFor();
      await shot('space');
      // Templates opens the gallery (its own steps are in 04-templates.js); closing it comes back to the space.
      await R('button', { name: 'Templates', exact: true }).click();
      await R('heading', { name: 'Templates' }).waitFor({ timeout: 20000 });
      await R('button', { name: 'Close', exact: true }).click();
      await T('Page, checklist, sheet or folder').waitFor();
    });

    await step('page', async () => {
      // 5.3: the page of the drawing. Where it is filed, who sees it, who changed it last, and its blocks.
      await R('button', { name: /^Wi‑Fi and smart home\. Page/ }).click();
      await T('Home / House manual').waitFor();
      await R('button', { name: /^Seen by: Alex, Mia and you\./ }).waitFor();
      await T(/^Edited by Alex · /).waitFor();
      await T('If the internet drops', { exact: true }).waitFor();
      await R('checkbox', { name: 'Unplug the white box for 10 seconds', checked: true }).waitFor();
      await T('Where the router lives').waitFor();
      await T('@Alex', { exact: true }).waitFor();
      await shot('page');
      // A list drawn in the page is ticked right there, and unticked again.
      const call = 'Still nothing? Call Telemach, 080 12 34';
      await sent(page, 'checklists', () => R('checkbox', { name: call, checked: false }).click());
      await R('checkbox', { name: call, checked: true }).waitFor();
      await sent(page, 'checklists', () => R('checkbox', { name: call, checked: true }).click());
      await R('checkbox', { name: call, checked: false }).waitFor();
    });

    await step('blocks', async () => {
      // 5.4: the + in the page's bar. Fifteen kinds of block; the ones that aren't built yet say so.
      await R('button', { name: 'Add to this page' }).click();
      await R('heading', { name: 'Add to this page' }).waitFor();
      for (const tile of ['Text', 'Checklist', 'Photo', 'File', 'Place', 'Sheet', 'Bill', 'Event', 'Password', 'Goal', 'Person', 'Countdown', 'Recipe', 'Poll', 'Sum']) await R('button', { name: tile, exact: true }).waitFor();
      await T(/^Sheets, bills, events, passwords and goals stay live\./).waitFor();
      await shot('blocks');
      await R('button', { name: 'Countdown', exact: true }).click();
      await T("Countdown blocks aren't built yet. They are on their way.").waitFor();
      await R('button', { name: 'OK', exact: true }).click();
    });

    await step('audience', async () => {
      // 4.3, drawn over this page: the one sheet behind its chip.
      await R('button', { name: /^Seen by: Alex, Mia and you\./ }).click();
      await T('Who can see this?').waitFor();
      await T('“Wi‑Fi and smart home”, a page in The Linds').waitFor();
      await R('radio', { name: /^Some people/, checked: true }).waitFor();
      await shot('audience');
      await R('button', { name: 'Done', exact: true }).click();
      await T('Who can see this?').waitFor({ state: 'detached' });
      // The way to the page leads to the folder it is in, opened by itself.
      await R('button', { name: 'Home / House manual. Open this folder' }).click();
      await R('heading', { name: 'House manual' }).waitFor();
      await T('New in House manual').waitFor();
      await shot('folder');
      await back(3);
      await R('heading', { name: 'Pinned' }).waitFor();
    });

    await step('surprise', async () => {
      // 4.4: a page for everyone but one. The chip says "Not Mia", the note says until when, the gift list is
      // drawn in the page with what each gift costs, and the party's event, budget and list are links.
      await R('button', { name: /^Kids\. \d+ folders · / }).click();
      await R('heading', { name: 'Kids', exact: true }).waitFor();
      await R('button', { name: /^Birthdays\. Folder\./ }).click();
      await R('button', { name: /^Mia's 10th birthday\. Page\. Not Mia$/ }).click();
      await T('Kids / Birthdays').waitFor();
      await R('button', { name: 'Seen by: Not Mia. Change who can see this' }).waitFor();
      await T(/^Hidden from Mia until \d+ December/).waitFor();
      await T('Not in their search, their Activity or their calendar. It opens to them the morning after.').waitFor();
      await R('checkbox', { name: 'Roller skates, size 33', checked: true }).waitFor();
      for (const said of ['Alex bought them', '€45', '€28', '€90']) await T(said, { exact: true }).waitFor();
      await R('button', { name: /^Mia's 10th birthday party\. Event\. Sat 5 Dec/ }).waitFor();
      await R('button', { name: /^Party prep\. List\. \d of 9 done$/ }).waitFor();
      await shot('surprise');
      // A gift is ticked in the page, and unticked.
      await sent(page, 'checklists', () => R('checkbox', { name: 'Watercolour set', checked: false }).click());
      await R('checkbox', { name: 'Watercolour set', checked: true }).waitFor();
      await sent(page, 'checklists', () => R('checkbox', { name: 'Watercolour set', checked: true }).click());
      await R('checkbox', { name: 'Watercolour set', checked: false }).waitFor();
      // A link opens what it shows.
      await R('button', { name: /^Party prep\. List\./ }).click();
      await R('heading', { name: 'Party prep' }).waitFor();
      await T(/^\d left of 9$/).waitFor();
      await back(3);
      await R('heading', { name: 'Pinned' }).waitFor();
    });

    await step('a-new-space', async () => {
      // A space of her own, with a name and an emoji. It starts as only hers, like everything in a family.
      await R('button', { name: 'Spaces. See all' }).click();
      await R('button', { name: 'New space' }).click();
      await R('heading', { name: 'New space' }).waitFor();
      await L('Name', { exact: true }).fill(SPACE);
      await R('radio', { name: '⛺' }).click();
      await shot('new-space');
      await R('button', { name: 'Create', exact: true }).click();
      await R('heading', { name: SPACE, exact: true }).waitFor();
      await R('button', { name: 'Seen by: Only you. Change who can see this' }).waitFor();
      await T('Nothing in here yet. Start a page, a list or a folder below.').waitFor();
      // A folder in it...
      await R('button', { name: `New in ${SPACE}` }).click();
      await R('button', { name: /^Folder\. A shelf inside this one$/ }).click();
      await L('Name', { exact: true }).fill('Seeds');
      await R('button', { name: 'Create', exact: true }).click();
      await R('button', { name: /^Seeds\. Folder\. Show/ }).waitFor();
      // ...opened by itself, to make a folder, a page and a list inside it.
      await hold(R('button', { name: /^Seeds\. Folder\./ }));
      await R('button', { name: 'Open this folder' }).click();
      await R('heading', { name: 'Seeds', exact: true }).waitFor();
      await R('button', { name: `${SPACE}. Open this folder` }).waitFor();
      await R('button', { name: 'New in Seeds' }).click();
      await R('button', { name: /^Folder\. A shelf inside this one$/ }).click();
      await L('Name', { exact: true }).fill('Tomatoes');
      await R('button', { name: 'Create', exact: true }).click();
      await R('button', { name: /^Tomatoes\. Folder\. Show/ }).waitFor();

      await R('button', { name: 'New in Seeds' }).click();
      await R('button', { name: /^Page\. Words, photos, lists and live blocks$/ }).click();
      await R('heading', { name: 'New note' }).waitFor();
      await T('Goes into Seeds').waitFor();
      await L('Title', { exact: true }).fill('Sowing dates');
      await shot('new-note-in-folder');
      await R('button', { name: 'Save', exact: true }).click();
      await page.waitForURL(/\/page\/[0-9a-f-]{36}/);
      // The page knows the way to itself: its space, then its folder.
      await T(`${SPACE} / Seeds`).waitFor();
      await T('Nothing on this page yet. Tap here to write, or add something with the + below.').waitFor();
      await back();
      await R('button', { name: /^Sowing dates\. Page/ }).waitFor();

      await R('button', { name: 'New in Seeds' }).click();
      await R('button', { name: /^Checklist\. Lines to tick, alone or together$/ }).click();
      await R('heading', { name: 'New checklist' }).waitFor();
      await L('Name of the list').fill('Seed order');
      await L('Lines to start with').fill('Tomato seeds\nSeed trays\nLabels');
      await R('button', { name: 'Save', exact: true }).click();
      await page.waitForURL(/\/checklist\/[0-9a-f-]{36}/);
      await T('3 left of 3').waitFor();
      await back();
      await R('button', { name: /^Seed order\. List\. 3 left$/ }).waitFor();
      await shot('folder-new');
    });

    await step('move-and-rename', async () => {
      /** The three rows of the folder, top to bottom, by their names. */
      const order = async () => {
        const rows = page.getByRole('button', { name: /^(Tomatoes|Tomatoes and peppers|Sowing dates|Seed order)\. (Folder|Page|List)/ });
        return (await rows.evaluateAll((all) => all.map((row) => row.getAttribute('aria-label').split('.')[0]))).slice(-3).join(', ');
      };
      /** Waits until the rows stand in this order. */
      const inOrder = async (wanted) => {
        for (let tries = 0; tries < 40 && (await order()) !== wanted; tries += 1) await page.waitForTimeout(250);
        if ((await order()) !== wanted) throw new Error(`the folder's rows are in the order "${await order()}", not "${wanted}"`);
      };
      await inOrder('Tomatoes, Sowing dates, Seed order');
      // The last row goes up one, from the menu that holding it opens.
      await hold(R('button', { name: /^Seed order\. List/ }));
      await R('button', { name: 'Move up', exact: true }).click();
      await inOrder('Tomatoes, Seed order, Sowing dates');
      // The page moves into the folder inside this one: the folders open in the sheet as they do in Notes.
      await hold(R('button', { name: /^Sowing dates\. Page/ }));
      await R('button', { name: 'Move to another folder' }).click();
      await R('heading', { name: 'Move “Sowing dates”' }).waitFor();
      await R('button', { name: 'Out of every folder' }).waitFor();
      await R('button', { name: `Show what is in ${SPACE}` }).click();
      await R('button', { name: 'Show what is in Seeds' }).click();
      await R('button', { name: 'Move into Tomatoes' }).waitFor();
      await shot('move');
      await R('button', { name: 'Move into Tomatoes' }).click();
      await R('heading', { name: 'Move “Sowing dates”' }).waitFor({ state: 'detached' });
      await R('button', { name: /^Sowing dates\. Page/ }).waitFor({ state: 'detached' });
      // The folder gets another name; what is in it shows when it is opened in place.
      await hold(R('button', { name: /^Tomatoes\. Folder\./ }));
      await R('button', { name: 'Name and emoji' }).click();
      await L('Name', { exact: true }).fill('Tomatoes and peppers');
      await R('button', { name: 'Save', exact: true }).click();
      await unfold(R('button', { name: /^Tomatoes and peppers\. Folder\. 1 page\. / }));
      await R('button', { name: /^Sowing dates\. Page/ }).click();
      // The page's way to itself has followed it: three steps now.
      await T(`${SPACE} / Seeds / Tomatoes and peppers`).waitFor();
      await shot('breadcrumb');
    });

    await step('a-page-of-blocks', async () => {
      // Words, typed in place: Return ends a block and begins the next. Marks are typed the way people write them.
      await R('button', { name: 'Add text' }).click();
      await L('Text', { exact: true }).fill('# When to sow');
      await page.keyboard.press('Enter');
      await T('When to sow', { exact: true }).waitFor();
      await L('Text', { exact: true }).fill('Sow *indoors* in March. Ask @Alex about the cold frame.');
      await page.keyboard.press('Enter');
      await T('indoors', { exact: true }).waitFor();
      await L('Text', { exact: true }).fill('- Tomatoes: the middle of March');
      await page.keyboard.press('Enter');
      // A bullet is followed by a bullet.
      await L('Bullet', { exact: true }).fill('Peppers: two weeks earlier');
      await T('*bold*   _slanted_   ~struck~   @name').waitFor();
      await shot('page-typing');
      await sent(page, 'pages', () => R('button', { name: 'Done', exact: true }).click());
      await T('@Alex', { exact: true }).waitFor();
      await T('Peppers: two weeks earlier').waitFor();
      await T(/^Edited by Nora · /).waitFor();

      // A list started in the page, with its first lines; ticked right there.
      await R('button', { name: 'Add a checklist' }).click();
      await R('heading', { name: 'A list in this page' }).waitFor();
      await L('Name of the list').fill('To buy');
      await L('Lines to start with').fill('Compost\nSeed trays');
      await shot('page-new-list');
      await sent(page, 'pages', () => R('button', { name: 'Add the list' }).click());
      await sent(page, 'checklists', () => R('checkbox', { name: 'Compost', checked: false }).click());
      await R('checkbox', { name: 'Compost', checked: true }).waitFor();

      // A photo and a file, each through the upload: a place is asked for, the file is sent, the API is told.
      await R('button', { name: 'Add to this page' }).click();
      const [photo] = await Promise.all([page.waitForEvent('filechooser'), R('button', { name: 'Photo', exact: true }).click()]);
      await sent(page, 'pages', () => photo.setFiles(path.join(IMG, 'desk.jpg')));
      await R('button', { name: 'Photo. More' }).click();
      await R('button', { name: 'Change the words under it' }).click();
      await L('Caption').fill('The cold frame');
      await sent(page, 'pages', () => R('button', { name: 'Save', exact: true }).click());
      await T('The cold frame').waitFor();
      await R('button', { name: 'Add to this page' }).click();
      const [file] = await Promise.all([page.waitForEvent('filechooser'), R('button', { name: 'File', exact: true }).click()]);
      await sent(page, 'pages', () => file.setFiles({ name: 'seed-order.txt', mimeType: 'text/plain', buffer: Buffer.from('Tomato seeds, 2 packets\nSeed trays, 4\n') }));
      await R('button', { name: 'Open seed-order.txt' }).waitFor();

      // A place.
      await R('button', { name: 'Add to this page' }).click();
      await R('button', { name: 'Place', exact: true }).click();
      await L('Place', { exact: true }).fill('The allotments by the river');
      await sent(page, 'pages', () => R('button', { name: 'Add the place' }).click());
      await R('button', { name: 'The allotments by the river. Open in Maps' }).waitFor();

      // A live block: another thing as it stands today, with its line and who sees it. It opens the thing.
      await R('button', { name: 'Add to this page' }).click();
      await R('button', { name: 'Goal', exact: true }).click();
      await R('heading', { name: 'Choose a goal' }).waitFor();
      await L('Search', { exact: true }).fill('norway');
      await R('button', { name: /^Norway 2027\. Goal/ }).waitFor();
      await shot('blocks-choose');
      await sent(page, 'pages', () => R('button', { name: /^Norway 2027\. Goal/ }).click());
      await R('heading', { name: 'Choose a goal' }).waitFor({ state: 'detached' });
      await R('button', { name: /^Norway 2027\. Goal\. \d+% · / }).waitFor();
      await shot('page-blocks');
      await R('button', { name: /^Norway 2027\. Goal\. \d+% · / }).click();
      await R('heading', { name: 'Norway 2027' }).waitFor();
      await back();

      // A block becomes another kind of text, from the menu that holding it opens; then it is removed.
      await hold(R('button', { name: /^Bullet: Peppers/ }));
      await sent(page, 'pages', () => R('button', { name: 'Make it plain text' }).click());
      await hold(R('button', { name: /^Text: Peppers/ }));
      await sent(page, 'pages', () => R('button', { name: 'Remove from the page' }).click());
      await R('button', { name: /^Text: Peppers/ }).waitFor({ state: 'detached' });
      // The page gets an emoji and a pin.
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Change the emoji' }).click();
      await R('radio', { name: '💡' }).click();
      await R('button', { name: 'Change the emoji' }).waitFor();
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Pin to the top of Notes' }).click();
      await R('button', { name: 'Pin to the top of Notes' }).waitFor({ state: 'detached' });
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Take the pin away' }).waitFor();
      await shot('page-menu');
      await R('button', { name: 'Close' }).click({ position: { x: 195, y: 60 } });
      await R('button', { name: 'Take the pin away' }).waitFor({ state: 'detached' });
    });

    await step('a-second-person', async () => {
      // Robin is new, and joins Nora's family: the link to join is the circle's own, for its owner to read.
      robin = await ctx.second('Robin Hale');
      const code = (await ctx.api(nora, 'GET', `/v1/circles/${linds.id}`)).joinUrl.split('/').pop();
      await ctx.api(robin.token, 'PUT', `/v1/join/${code}`);
      // Their phone was asked to set up a circle a moment ago; the invitation's own screen takes them into this one.
      await robin.page.goto(`${WEB_URL}/join/${code}`);
      await robin.R('heading', { name: "You're already in The Linds" }).waitFor({ timeout: 20000 });
      await robin.R('button', { name: 'Open The Linds' }).click();
      await robin.R('button', { name: 'The Linds. Change circle' }).waitFor({ timeout: 20000 });
      await robin.R('tab', { name: 'Notes' }).click();
      await robin.R('tab', { name: 'Notes', selected: true }).waitFor();
      // What is shared with the whole family is theirs to see; a space for the adults Nora named, or hers alone, is not.
      await robin.R('button', { name: /^Home\. \d+ folders · / }).waitFor();
      if (await robin.page.getByRole('button', { name: /^Kids\. / }).count()) throw new Error('Robin sees a space that was shared with Alex only');
      if (await robin.page.getByRole('button', { name: new RegExp(`^${SPACE}\\. `) }).count()) throw new Error("Robin sees a space that is only Nora's");
    });

    await step('only-nora-sees-it', async () => {
      // Nora shares the space with everyone, and one page in it; a second page stays hers alone.
      await back(2);
      await R('heading', { name: SPACE, exact: true }).waitFor();
      await R('button', { name: 'Seen by: Only you. Change who can see this' }).click();
      await R('radio', { name: /^Everyone in The Linds/ }).click();
      await R('button', { name: 'Done', exact: true }).click();
      await R('button', { name: 'Seen by: The Linds. Change who can see this' }).waitFor();
      const words = { 'Watering rota': 'Tomatoes every evening.', 'Surprise for Alex': 'A greenhouse heater, for his birthday.' };
      for (const title of Object.keys(words)) {
        await R('button', { name: `New in ${SPACE}` }).click();
        await R('button', { name: /^Page\. Words, photos, lists and live blocks$/ }).click();
        await L('Title', { exact: true }).fill(title);
        await L('Words', { exact: true }).fill(words[title]);
        if (title === 'Watering rota') {
          await R('button', { name: 'Seen by Only you. Change' }).click();
          await R('button', { name: 'Seen by The Linds. Change' }).waitFor();
        }
        await R('button', { name: 'Save', exact: true }).click();
        await page.waitForURL(/\/page\/[0-9a-f-]{36}/);
        await T(words[title]).waitFor();
        if (title === 'Watering rota') await back();
      }
      secret = page.url().split('/').pop();
      await R('button', { name: 'Seen by: Only you. Change who can see this' }).waitFor();
      // The shared page shows the private one as a live block. (Put there through the API, the way another
      // phone would do it.)
      const rota = (await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/pages?limit=100`)).items.find((one) => one.title === 'Watering rota');
      await ctx.api(nora, 'POST', `/v1/pages/${rota.id}/blocks`, { clientId: randomUUID(), kind: 'live', thingId: secret });

      // Robin finds the space now, and the shared page in it; not the other one, and not Nora's own folder.
      await robin.page.goto(WEB_URL + '/?place=notes');
      await robin.R('button', { name: new RegExp(`^${SPACE}\\. `) }).click({ timeout: 20000 });
      // (Notes shows the same rows under "Lately": the space has to be the screen in front before one is pressed.)
      await robin.R('heading', { name: SPACE, exact: true }).waitFor();
      await robin.R('button', { name: /^Watering rota\. Page/ }).waitFor();
      if (await robin.page.getByText('Surprise for Alex').count()) throw new Error('Robin sees, in the space, a page that only Nora may see');
      if (await robin.page.getByRole('button', { name: /^Seeds\. Folder/ }).count()) throw new Error('Robin sees, in the space, a folder that only Nora may see');
      await robin.shot('space-as-someone-else');
      // In the page that is shared, the block that shows the private page says only that something is there.
      await robin.R('button', { name: /^Watering rota\. Page/ }).click();
      await robin.T("Something you can't see").waitFor();
      await robin.T('It is shared with other people, not with you.').waitFor();
      if (await robin.page.getByText('Surprise for Alex').count()) throw new Error('a live block told Robin the name of a page that only Nora may see');
      await robin.shot('page-something-you-cant-see');
      // Not on Notes' home either, not in search, and not by its address.
      await robin.page.goto(WEB_URL + '/?place=notes');
      await robin.R('heading', { name: 'Lately' }).waitFor({ timeout: 20000 });
      if (await robin.page.getByText('Surprise for Alex').count()) throw new Error('Robin sees, on Notes, a page that only Nora may see');
      await robin.R('button', { name: 'Search notes' }).click();
      await robin.L('Search The Linds').fill('greenhouse heater');
      await robin.T('Nothing found for “greenhouse heater”').waitFor();
      ctx.expectNotFound = true;
      await robin.page.goto(`${WEB_URL}/page/${secret}`);
      await robin.R('heading', { name: "This isn't available" }).waitFor({ timeout: 20000 });
      ctx.expectNotFound = false;

      // Robin opens the shared page again and leaves it open; then Nora shares the other page with everyone.
      await robin.page.goto(`${WEB_URL}/page/${rota.id}`);
      await robin.T("Something you can't see").waitFor({ timeout: 20000 });
      await R('button', { name: 'Seen by: Only you. Change who can see this' }).click();
      await R('radio', { name: /^Everyone in The Linds/ }).click();
      await R('button', { name: 'Done', exact: true }).click();
      await R('button', { name: 'Seen by: The Linds. Change who can see this' }).waitFor();
      // The block on Robin's phone fills in by itself, and opens the page.
      await robin.R('button', { name: /^Surprise for Alex\. Page/ }).waitFor({ timeout: 20000 });
      await robin.shot('page-live-block');
      await robin.R('button', { name: /^Surprise for Alex\. Page/ }).click();
      await robin.T('A greenhouse heater, for his birthday.').waitFor();
      // And search finds it, by words inside it.
      await robin.page.goto(WEB_URL + '/?place=notes');
      await robin.R('button', { name: 'Search notes' }).click({ timeout: 20000 });
      await robin.L('Search The Linds').fill('greenhouse heater');
      await robin.R('button', { name: /^Surprise for Alex\. Page/ }).waitFor();
      await back(2);
      await R('heading', { name: 'Pinned' }).waitFor();
      // What Nora pinned a moment ago is on Notes' home.
      await R('button', { name: /^Sowing dates\. Edited / }).waitFor();
    });

    await step('a-list-of-her-own', async () => {
      // Lines are added from the box at the bottom, one after the other: the cursor stays where it is.
      await R('button', { name: new RegExp(`^${SPACE}\\. `) }).click();
      await R('heading', { name: SPACE, exact: true }).waitFor();
      await unfold(R('button', { name: /^Seeds\. Folder\./ }));
      await R('button', { name: /^Seed order\. List\. 3 left$/ }).click();
      await T('3 left of 3').waitFor();
      await L('Add an item').fill('Twine');
      await sent(page, 'checklists', () => page.keyboard.press('Enter'));
      await R('checkbox', { name: 'Twine', checked: false }).waitFor();
      if (!(await L('Add an item').evaluate((box) => box === document.activeElement))) throw new Error('the box to add a line lost the cursor after adding one');
      await page.keyboard.type('Plant food');
      await sent(page, 'checklists', () => R('button', { name: 'Add', exact: true }).click());
      await T('5 left of 5').waitFor();
      // The microphone needs a phone, and says so.
      await R('button', { name: 'Say it' }).click();
      await T('Saying a line out loud needs the app on a phone. Type it here for now.').waitFor();
      // A line is opened: an amount, a heading, and that it comes back every month.
      await R('button', { name: 'Tomato seeds. More' }).click();
      await L('Amount', { exact: true }).fill('4.50');
      await L('Heading', { exact: true }).fill('To sow');
      await R('radio', { name: 'Every month' }).click();
      await shot('checklist-line');
      await sent(page, 'checklists', () => R('button', { name: 'Save', exact: true }).click());
      await T('To sow', { exact: true }).waitFor();
      await T('€4.50', { exact: true }).waitFor();
      await T('Every month', { exact: true }).waitFor();
      await R('button', { name: 'Seed trays. More' }).click();
      await L('Amount', { exact: true }).fill('12');
      await sent(page, 'checklists', () => R('button', { name: 'Save', exact: true }).click());
      // Amounts add up; the ticked ones are counted apart.
      await T('€16.50 in all').waitFor();
      await sent(page, 'checklists', () => R('checkbox', { name: 'Seed trays', checked: false }).click());
      await T('€16.50 in all · €12 ticked').waitFor();
      // Ticked lines are hidden and shown again, for her alone.
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Hide ticked lines' }).click();
      await R('checkbox', { name: 'Seed trays' }).waitFor({ state: 'detached' });
      await T('1 ticked line hidden').waitFor();
      await shot('checklist-ticked-hidden');
      await R('button', { name: 'Show ticked lines' }).click();
      await R('checkbox', { name: 'Seed trays', checked: true }).waitFor();
      // A line is removed; the ticked ones are cleared.
      await R('button', { name: 'Labels. More' }).click();
      await sent(page, 'checklists', () => R('button', { name: 'Remove this line' }).click());
      await R('checkbox', { name: 'Labels' }).waitFor({ state: 'detached' });
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Clear the ticked lines' }).click();
      await R('checkbox', { name: 'Seed trays' }).waitFor({ state: 'detached' });
      await T('3 left of 3').waitFor();
      // The list gets another name, and is deleted after asking.
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Rename', exact: true }).click();
      await L('Name of the list').fill('Winter jobs');
      await R('button', { name: 'Save', exact: true }).click();
      await R('heading', { name: 'Winter jobs' }).waitFor();
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Delete list' }).click();
      await T('Delete this list?').waitFor();
      await R('button', { name: 'Delete list' }).click();
      await R('heading', { name: SPACE, exact: true }).waitFor();
      await R('button', { name: /^Winter jobs\. List/ }).waitFor({ state: 'detached' });
      await back();
      await R('heading', { name: 'Pinned' }).waitFor();
    });

    await step('checklist', async () => {
      // 5.5: the shopping list of the drawing, as two people at once.
      await R('button', { name: /^Home\. \d+ folders · / }).click();
      await R('heading', { name: 'Home', exact: true }).waitFor();
      await R('button', { name: /^Groceries\. List\. \d+ left/ }).click();
      await R('heading', { name: 'Groceries' }).waitFor();
      await T('7 left of 12').waitFor();
      await T(/is here now, ticking things off$/).waitFor();
      for (const heading of ['Fruit and veg', 'Fridge', 'Other']) await T(heading, { exact: true }).waitFor();
      await T('Every week', { exact: true }).waitFor();
      await T("Mia can't see this one").waitFor();
      for (const again of ADDS) await R('button', { name: `Add ${again} again` }).waitFor();
      await shot('checklist');

      await robin.page.goto(`${WEB_URL}/checklist/${groceries.id}`);
      await robin.T('7 left of 12').waitFor({ timeout: 20000 });
      // Each ticks a different line and adds one...
      await sent(page, 'checklists', () => R('checkbox', { name: 'Birthday candles', checked: false }).click());
      await sent(robin.page, 'checklists', () => robin.R('checkbox', { name: 'Dog food for Biscuit', checked: false }).click());
      await sent(page, 'checklists', () => R('button', { name: 'Add Eggs again' }).click());
      await sent(robin.page, 'checklists', () => robin.R('button', { name: 'Add Bread again' }).click());
      // ...and both see all of it within a few seconds, without doing anything.
      for (const phone of [ctx, robin]) {
        await phone.R('checkbox', { name: 'Birthday candles', checked: true }).waitFor({ timeout: 15000 });
        await phone.R('checkbox', { name: 'Dog food for Biscuit', checked: true }).waitFor({ timeout: 15000 });
        await phone.R('checkbox', { name: 'Eggs', checked: false }).waitFor({ timeout: 15000 });
        await phone.R('checkbox', { name: 'Bread', checked: false }).waitFor({ timeout: 15000 });
        await phone.T('7 left of 14').waitFor({ timeout: 15000 });
      }
      // Each is told that the other is in the list too.
      await T(/Robin are here now$/).waitFor({ timeout: 15000 });
      await robin.T(/Nora are here now$/).waitFor({ timeout: 15000 });
      await shot('checklist-two-people');
      await robin.shot('checklist-as-the-other');
    });

    await step('offline', async () => {
      // 13.2: Nora's phone loses its connection in the shop. The list says so in its own words.
      const before = ctx.errors.length;
      await page.context().setOffline(true);
      await T("You're offline. Your ticks are saved here and will reach everyone when you're back.").waitFor();
      // She ticks two lines: they are ticked at once, and each says that it waits.
      await R('checkbox', { name: 'Bananas', checked: false }).click();
      await R('checkbox', { name: 'Strawberries, 2 boxes', checked: false }).click();
      await R('checkbox', { name: 'Bananas', checked: true }).waitFor();
      await R('checkbox', { name: 'Strawberries, 2 boxes', checked: true }).waitFor();
      if ((await waiting(page)) !== 2) throw new Error(`two lines should say "waiting", and ${await waiting(page)} do`);
      await shot('offline');
      // And she adds a line: it is on the list, and waits as well.
      await R('button', { name: 'Add Coffee again' }).click();
      await R('checkbox', { name: 'Coffee', checked: false }).waitFor();
      if ((await waiting(page)) !== 3) throw new Error(`three lines should say "waiting", and ${await waiting(page)} do`);
      await T('6 left of 15').waitFor();
      await shot('offline-added');

      // What was opened lately still opens without a connection; what never was says so.
      await back();
      await R('button', { name: /^Wi‑Fi and smart home\. Page/ }).click();
      await T("You're offline. What you change is saved here and will reach everyone when you're back.").waitFor();
      await T('If the internet drops', { exact: true }).waitFor();
      await T('Where the router lives').waitFor();
      await shot('offline-page');
      await back();
      await R('button', { name: /^Bins and recycling days\. Page/ }).click();
      await T("This hasn't been loaded on this phone yet. It shows up by itself when you're back online.").waitFor();
      await shot('offline-never-opened');
      await back();
      await R('button', { name: /^Groceries\. List/ }).click();
      await R('checkbox', { name: 'Coffee', checked: false }).waitFor();
      if ((await waiting(page)) !== 3) throw new Error('what waited was lost when the list was closed and opened again');

      // Robin, who is online, has seen none of it yet.
      await robin.page.waitForTimeout(6000);
      await robin.R('checkbox', { name: 'Bananas', checked: false }).waitFor();
      await robin.R('checkbox', { name: 'Strawberries, 2 boxes', checked: false }).waitFor();
      if (await robin.page.getByRole('checkbox', { name: 'Coffee' }).count()) throw new Error("Robin sees a line that hasn't left Nora's phone yet");
      await robin.T('7 left of 14').waitFor();

      // Back online: everything arrives in the order it was made, and the marks go.
      await sent(page, 'checklists', () => page.context().setOffline(false));
      // (A request that was on its way when the connection went is the browser's to complain about. Nothing else went wrong.)
      const others = ctx.errors.splice(before).filter((problem) => !/ERR_INTERNET_DISCONNECTED/.test(problem));
      ctx.errors.push(...others);
      await T("You're offline. Your ticks are saved here and will reach everyone when you're back.").waitFor({ state: 'detached' });
      for (let tries = 0; tries < 40 && (await waiting(page)) > 0; tries += 1) await page.waitForTimeout(250);
      if (await waiting(page)) throw new Error('a line still says "waiting" after everything was sent');
      await T('6 left of 15').waitFor();
      await robin.R('checkbox', { name: 'Bananas', checked: true }).waitFor({ timeout: 15000 });
      await robin.R('checkbox', { name: 'Strawberries, 2 boxes', checked: true }).waitFor({ timeout: 15000 });
      await robin.R('checkbox', { name: 'Coffee', checked: false }).waitFor({ timeout: 15000 });
      await robin.T('6 left of 15').waitFor({ timeout: 15000 });
      await shot('checklist-caught-up');
      await robin.shot('checklist-caught-up-as-the-other');
    });

    await step('tidy-up', async () => {
      // Robin's phone is put away, and the sample data is as it was: the next walk finds what this one found.
      await robin.close();
      robin = null;
      await tidy();
      // The list on Nora's phone hears of it by asking again, as it does every few seconds.
      await T('7 left of 12').waitFor({ timeout: 15000 });
      await back(2);
      await R('heading', { name: 'Pinned' }).waitFor();
      await ctx.signOut();
    });
  } catch (problem) {
    // Whatever went wrong on the way, nobody and nothing of this walk is left behind in the sample circle.
    await page.context().setOffline(false).catch(() => undefined);
    if (robin) await robin.close().catch(() => undefined);
    if (nora && groceries) await tidy().catch(() => undefined);
    throw problem;
  }
};
