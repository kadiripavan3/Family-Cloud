// Milestone 8, for couples, and the Today of each kind of circle.
//
// Nora and Alex's six templates (Our story, Tucked notes, The anniversary questions, Mystery date, Both said
// yes, The fair share), each on its sample board and on one started from the gallery; the Today of a couple,
// a crew and a flat; and the three galleries those kinds of circle get. Where the API keeps something from
// one of two people it is walked as both: Nora on the phone, Alex first through the API (what is it handed?)
// and then on the phone himself: a tucked note that reaches him only once it has turned up, an anniversary
// year that stays shut until both have answered, a date of which he gets the hint and the open clues, a deck
// that shows only what both said yes to, and a swap one suggests and the other answers.
//
// It can be run again and again on the same data: what it changes on a sample board it takes back, the boards
// it starts are deleted at the end, and what an earlier run left behind is cleared first. It expects the
// sample week as it was added (Friday's date still to come): on older data, run `fresh-db.sh` first.
const { randomUUID } = require('crypto');

/** The looks of the cards the link with Journey draws itself, around the day (walked in 10-journey). */
const JOURNEYS = ['journey_away', 'journey_on_this_day', 'goodnight'];

/** The cards of a day that are Today's own, laid out the way Today lays them out (`partsOf` in the app). */
function partsOf(cards) {
  const sorted = cards.filter((card) => !JOURNEYS.includes(card.look)).sort((a, b) => a.order - b.order);
  const firstPicture = sorted.findIndex((card) => card.imageUrl);
  const before = firstPicture < 0 ? sorted : sorted.slice(0, firstPicture);
  const headline = before.find((card) => !card.figure && !card.imageUrl && !card.action) || null;
  return { headline, lines: before.filter((card) => card !== headline), rail: firstPicture < 0 ? [] : sorted.slice(firstPicture) };
}

/** The first eight cards of each kind's gallery, as its drawing has them: [name, does work]. */
const GALLERIES = {
  couple: { chips: ['For two, 16', 'Home', 'Money', 'Trips', 'All 53'], cards: [['Date ideas', true], ['Who pays what', true], ['Moving in together', false], ['The wedding', false], ['They mentioned it', false], ['Names', true], ['A weekend away', false], ['Someday', false]] },
  flat: { chips: ['For a flat, 15', 'Money', 'Landlord', 'All 53'], cards: [['Cleaning rota', true], ['Bills by nights', true], ['Move-in photos', true], ['Repair log', false], ['House rules', false], ['Is the sofa free?', false], ['House party', false], ['Moving out', false]] },
  crew: { chips: ['For friends, 17', 'Trips', 'Money', 'All 53'], cards: [['When can everyone?', true], ['Secret Santa', true], ['Where next?', true], ['Who brings what', false], ['Split the costs', false], ['A present from all of us', false], ['Games night', false], ['Book club', false]] },
};

exports.run = async function run(ctx) {
  const { page, T, R, L, shot, step, tag, WEB_URL, CODE } = ctx;
  /** The day on this phone, as the API takes it. */
  const DAY = new Date().toLocaleDateString('en-CA');
  let nora;
  let alex;
  let two;
  const made = [];
  const tokenOf = async (email) => (await ctx.api(null, 'POST', '/local-auth/token', { email, code: CODE })).accessToken;
  const asNora = (method, address, body) => ctx.api(nora, method, address, body);
  const asAlex = (method, address, body) => ctx.api(alex, method, address, body);
  const boardAs = (ask, id, show) => ask('GET', `/v1/boards/${id}?day=${DAY}${show ? `&show=${show}` : ''}`);
  const addAs = (ask, id, kind, fields) => ask('POST', `/v1/boards/${id}/entries?day=${DAY}`, { clientId: randomUUID(), kind, fields });
  const actAs = (ask, id, verb, body) => ask('POST', `/v1/boards/${id}/act?day=${DAY}`, { verb, body });
  /** Puts the sheet that is up away, the way a person does: by tapping the dimmed page above it. */
  const closeSheet = () => R('button', { name: 'Close', exact: true }).click({ position: { x: 24, y: 24 } });
  const more = () => R('button', { name: 'More', exact: true });
  /** A box to type in, by its exact label ("The time" is also part of "Set the time"). */
  const F = (label) => L(label, { exact: true });
  const idInAddress = () => page.url().match(/\/board\/([0-9a-f-]{36})/)[1];
  const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** Home, with one of this person's circles as the current one. */
  const switchTo = async (name) => {
    await page.goto(WEB_URL + '/');
    await R('button', { name: /\. Change circle$/ }).click();
    await R('button', { name: new RegExp(`^${escaped(name)}\\.`) }).click();
    await R('button', { name: `${name}. Change circle` }).waitFor({ timeout: 20000 });
    await L('Loading').waitFor({ state: 'detached' });
  };

  /**
   * The sample board of one of the couple's templates: the one with the most in it. Any other board of that
   * template in "Nora and Alex" is what an earlier run of this walk-through started, and goes.
   */
  const sampleBoard = async (template) => {
    const boards = (await asNora('GET', `/v1/circles/${two.id}/boards?template=${template}&limit=50`)).items;
    const whole = await Promise.all(boards.map((board) => boardAs(asNora, board.id)));
    whole.sort((a, b) => JSON.stringify(b.view).length - JSON.stringify(a.view).length);
    for (const leftover of whole.slice(1)) await asNora('DELETE', `/v1/things/${leftover.id}`);
    return whole[0];
  };
  /** The couple's gallery, on the shelf a card stands on: their own ("For two") unless another chip is named. */
  const gallery = async (shelf) => {
    await page.goto(WEB_URL + '/templates');
    await R('heading', { name: 'Templates' }).waitFor({ timeout: 20000 });
    if (shelf) await R('button', { name: shelf, exact: true }).click();
  };
  /** From the gallery: a template's card, and the board of it the couple has already. */
  const openSample = async (card, row, shelf) => {
    await gallery(shelf);
    await R('button', { name: card }).click();
    await T('In Nora and Alex already').waitFor();
    await R('button', { name: row }).click();
  };
  /** From the gallery: a template's card, and Start. The board that opens goes with this run. */
  const startNew = async (card, before, shelf) => {
    await gallery(shelf);
    await R('button', { name: card }).click();
    await T('In Nora and Alex already').waitFor();
    if (before) await before();
    await R('button', { name: 'Start another' }).click();
    await page.waitForURL(/\/board\/[0-9a-f-]{36}/, { timeout: 20000 });
    made.push(idInAddress());
    return idInAddress();
  };

  /** Today, checked against what the API holds for this person in this circle: the headline, every line, the rail. */
  const checkToday = async (token, circle, heading) => {
    const today = await ctx.api(token, 'GET', `/v1/circles/${circle.id}/today?day=${DAY}`);
    const parts = partsOf(today.cards);
    if (parts.headline) await R('button', { name: `${parts.headline.title}. ${parts.headline.line}` }).waitFor({ timeout: 20000 });
    else await T(/left today|Nothing due/).waitFor({ timeout: 20000 });
    for (const item of today.items) await R('button', { name: new RegExp(`${escaped(item.title)}\\. ${escaped(item.note)}$`) }).waitFor();
    for (const card of parts.lines) await R('button', { name: [card.figure, card.title, card.line].filter(Boolean).join('. ') }).waitFor();
    for (const card of parts.lines) if (card.action) await R('button', { name: `${card.action}. ${card.title}` }).waitFor();
    if (parts.rail.length + today.fresh.length) await R('button', { name: `${heading}. See all` }).waitFor();
    for (const card of parts.rail) await R('button', { name: [card.title, card.figure, card.line].filter(Boolean).join('. ') }).waitFor();
    for (const card of today.fresh) await R('button', { name: [card.title, card.pill, card.note].filter(Boolean).join('. ') }).waitFor();
    return { today, parts };
  };

  /** The gallery of the current circle against its drawing: the chips in their order, the first eight cards in theirs, LIVE on the ones that do work, the first card marked. */
  const checkGallery = async (kind) => {
    const drawn = GALLERIES[kind];
    await page.goto(WEB_URL + '/templates');
    await R('heading', { name: 'Templates' }).waitFor({ timeout: 20000 });
    await R('button', { name: drawn.chips[0], exact: true }).waitFor({ timeout: 20000 });
    const labels = await page.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') || ''));
    const at = (wanted) => labels.findIndex((label) => label === wanted || label.startsWith(`${wanted}. `));
    const order = [...drawn.chips, ...drawn.cards.map(([name]) => name)].map(at);
    if (order.some((index) => index < 0) || order.some((index, n) => n > 0 && index < order[n - 1])) throw new Error(`the ${kind}'s gallery is not in its drawing's order: ${JSON.stringify(order)}`);
    for (const [name, live] of drawn.cards) {
      const label = labels[at(name)];
      if (label.includes('Does work for you') !== live) throw new Error(`“${name}” is ${live ? 'not ' : ''}marked LIVE in the ${kind}'s gallery`);
    }
    const first = R('button', { name: new RegExp(`^${escaped(drawn.cards[0][0])}\\.`) });
    if ((await first.getAttribute('aria-selected')) !== 'true') throw new Error(`the first card of the ${kind}'s gallery is not the marked one`);
    const second = R('button', { name: new RegExp(`^${escaped(drawn.cards[1][0])}\\.`) });
    if ((await second.getAttribute('aria-selected')) === 'true') throw new Error(`two cards of the ${kind}'s gallery are marked`);
  };

  // ------------------------------------------------------------------ Today, for two

  let split;
  await step('us-today', async () => {
    await ctx.signIn('nora@example.com');
    nora = await tokenOf('nora@example.com');
    alex = await tokenOf('alex@example.com');
    two = (await asNora('GET', '/v1/circles')).find((circle) => circle.kind === 'couple');
    // The boards an earlier run started and didn't get to delete go first: their cards would stand on Today.
    for (const template of ['our_story', 'tucked_notes', 'anniversary', 'mystery_date', 'both_yes', 'fair_share']) await sampleBoard(template);
    // A payment an earlier run marked as made and didn't take back.
    for (const thing of (await asNora('GET', `/v1/circles/${two.id}/splits`)).items || []) {
      for (const paid of (await asNora('GET', `/v1/splits/${thing.id}`)).paid) if (paid.paidOn === DAY) await asNora('DELETE', `/v1/split-payments/${paid.id}`);
    }
    await switchTo('Nora and Alex');
    // The headline is the mystery date's own words, with the ring; under it the day's list and the couple's keepsakes.
    const { today, parts } = await checkToday(nora, two, 'The two of you');
    if (!parts.headline || parts.headline.look !== 'mystery_date') throw new Error("the couple's Today has no date being planned: start from fresh sample data");
    await T('The two of you').waitFor();
    await R('button', { name: /^7:00\. Run together\./ }).waitFor();
    await R('button', { name: /^A note is tucked away for you\. From Alex\./ }).waitFor();
    await R('button', { name: /^Our story\. [\d,]+ days\. Since a wedding in Piran$/ }).waitFor();
    await R('button', { name: 'Both said yes. A match. Thai, on Saturday' }).waitFor();
    await R('button', { name: /^Someday\. \d+ of \d+ done$/ }).waitFor();
    split = today.items.find((item) => item.kind === 'split');
    await shot('us-today');
    // The headline opens the board it is about; a line with no time and no tick opens its board too.
    await R('button', { name: `${parts.headline.title}. ${parts.headline.line}` }).click();
    await R('heading', { name: 'Date night' }).waitFor({ timeout: 20000 });
    await R('button', { name: 'Back', exact: true }).click();
    await R('button', { name: /^A note is tucked away for you\./ }).click();
    await R('heading', { name: 'Tucked notes' }).waitFor({ timeout: 20000 });
    await R('button', { name: 'Back', exact: true }).click();
    // The heading over the keepsakes leads to where they start.
    await R('button', { name: 'The two of you. See all' }).click();
    await R('heading', { name: 'Templates' }).waitFor({ timeout: 20000 });
    await R('button', { name: 'Close', exact: true }).click();
  });

  await step('us-today-settle', async () => {
    if (!split) throw new Error("the couple's Today has no line about what is owed");
    // "Settle" asks first, and "Not yet" changes nothing.
    const settle = R('button', { name: `Settle. ${split.title}` });
    await settle.click();
    await T(`Has Alex paid you ${split.lead}?`).waitFor();
    await T(/^It is marked as paid in “October”, for everyone who sees it\./).waitFor();
    await shot('us-today-settle');
    await R('button', { name: 'Not yet' }).click();
    await T(`Has Alex paid you ${split.lead}?`).waitFor({ state: 'detached' });
    // "Yes" marks the payment as made: the line leaves Today, for Alex as well.
    await settle.click();
    await R('button', { name: 'Yes, mark it paid' }).click();
    await T('“October” is marked as paid.').waitFor({ timeout: 20000 });
    await R('button', { name: new RegExp(`^${escaped(split.lead)}\\. ${escaped(split.title)}`) }).waitFor({ state: 'detached', timeout: 20000 });
    const forAlex = await asAlex('GET', `/v1/circles/${two.id}/today?day=${DAY}`);
    if (forAlex.items.some((item) => item.kind === 'split')) throw new Error('Alex is still told he owes for October after it was marked as paid');
    await shot('us-today-settled');
    // (The payment is taken back, so the sample week stays as it was.)
    for (const paid of (await asNora('GET', `/v1/splits/${split.thingId}`)).paid) if (paid.paidOn === DAY) await asNora('DELETE', `/v1/split-payments/${paid.id}`);
    await page.goto(WEB_URL + '/');
    await R('button', { name: `Settle. ${split.title}` }).waitFor({ timeout: 20000 });
  });

  await step('us-templates', async () => {
    await checkGallery('couple');
    await shot('us-templates');
    // The six that are built are marked LIVE: three keepsakes further down, three behind "Fair and fun". A chip shows its own shelf.
    for (const name of ['Our story', 'Tucked notes', 'The anniversary questions']) await R('button', { name: new RegExp(`^${name}\\. Does work for you\\.`) }).waitFor();
    await R('button', { name: 'Fair and fun', exact: true }).click();
    for (const name of ['Mystery date', 'Both said yes', 'The fair share']) await R('button', { name: new RegExp(`^${name}\\. Does work for you\\.`) }).waitFor();
    await R('button', { name: /^Our story\./ }).waitFor({ state: 'detached' });
    await R('button', { name: 'Money', exact: true }).click();
    await R('button', { name: /^Who pays what\./ }).waitFor();
    await R('button', { name: /^Mystery date\./ }).waitFor({ state: 'detached' });
    // One that is LIVE in the catalog and not built says so, and can't be started.
    await R('button', { name: /^Who pays what\./ }).click();
    await T('Coming with the next update').waitFor();
    await closeSheet();
  });

  // ------------------------------------------------------------------ Our story

  await step('our-story', async () => {
    const story = await sampleBoard('our_story');
    for (const moment of story.view.moments) if (moment.title.startsWith('Walk-through')) await asNora('DELETE', `/v1/board-entries/${moment.id}`);
    await openSample(/^Our story\. Does work/, /^Our story\. [\d,]+ days/);
    await R('heading', { name: 'Our story' }).waitFor({ timeout: 20000 });
    // The count of the days, and the firsts in order: a day, a month, a star, a journey that was kept.
    await T(/^[\d,]+ days so far$/).waitFor();
    await R('button', { name: /^\d+ July 2014\. Piran\. We met\. A milestone$/ }).waitFor();
    await R('button', { name: 'August 2015. First trip. Mallorca by kayak' }).waitFor();
    await R('button', { name: 'March 2016. First flat. The keys to Trubarjeva' }).waitFor();
    await R('button', { name: '4 December 2016. Mia. Three of us. A milestone' }).waitFor();
    await T('A journey you kept · 9 days, 212 photos').waitFor();
    await shot('our-story');
    // A moment of which only the month is known.
    await R('button', { name: 'Add a moment' }).click();
    await F('What happened').fill(`Walk-through ${tag}`);
    await R('radio', { name: 'The month' }).click();
    await F('A word beside the date').fill('A test');
    await F('A few words').fill('Written by the walk-through, and taken out again.');
    await shot('our-story-add');
    await R('button', { name: 'Add it to the story' }).click();
    const added = R('button', { name: new RegExp(`\\d{4}\\. A test\\. Walk-through ${tag}$`) });
    await added.waitFor({ timeout: 20000 });
    // It opens to be changed: a star, then out again.
    await added.click();
    await T('Change this moment').waitFor();
    await R('switch', { name: 'A milestone' }).click();
    await R('button', { name: 'Save', exact: true }).click();
    const starred = R('button', { name: new RegExp(`A test\\. Walk-through ${tag}\\. A milestone$`) });
    await starred.waitFor({ timeout: 20000 });
    await starred.click();
    await R('button', { name: 'Take it out of the story' }).click();
    await starred.waitFor({ state: 'detached', timeout: 20000 });
  });

  await step('our-story-new', async () => {
    // A story of its own, started from the gallery: it opens empty, and counts from its first moment.
    await startNew(/^Our story\. Does work/);
    await R('heading', { name: 'The firsts, in order' }).waitFor({ timeout: 20000 });
    await shot('our-story-empty');
    await R('button', { name: 'Add the first moment' }).click();
    await F('What happened').fill(`Walk-through ${tag}`);
    await R('button', { name: 'Add it to the story' }).click();
    await R('button', { name: new RegExp(`Walk-through ${tag}$`) }).waitFor({ timeout: 20000 });
    await T('0 days so far').waitFor();
    // What it began with, from More.
    await more().click();
    await R('button', { name: /^When it began/ }).click();
    await F('What it began with').fill('a walk-through');
    await shot('our-story-began');
    await R('button', { name: 'Save', exact: true }).click();
    await T('The days are counted from here.').waitFor({ state: 'detached', timeout: 20000 });
    const settings = (await boardAs(asNora, idInAddress())).settings;
    if (settings.sinceWords !== 'a walk-through') throw new Error('what the story began with was not kept');
    // Alex, the other half, reads it too: a couple's things start as shared with both.
    if ((await boardAs(asAlex, idInAddress())).view.count !== 1) throw new Error('Alex is not handed the story Nora started');
  });

  // ------------------------------------------------------------------ Tucked notes

  let notes;
  await step('tucked', async () => {
    notes = await sampleBoard('tucked_notes');
    // What an earlier run tucked away or left found is taken out first.
    for (const ask of [asNora, asAlex]) {
      for (const note of (await ask('GET', `/v1/boards/${notes.id}/entries?kind=note&q=walk-through&limit=50`)).items) await ask('DELETE', `/v1/board-entries/${note.id}`).catch(() => undefined);
    }
    notes = await boardAs(asNora, notes.id);
    await openSample(/^Tucked notes\. Does work/, /^Tucked notes\. \d+ found so far/);
    await R('heading', { name: 'Tucked notes' }).waitFor({ timeout: 20000 });
    // Nora's own note that is still hiding, how it turns up, and what was found so far.
    await T('Tucked away for Alex').waitFor();
    await R('heading', { name: '“Your coffee this morning was the best part of my day.”' }).waitFor();
    await T(/^It will turn up some time before \w+day\. Neither of you knows when\.$/).waitFor();
    for (const way of ['Some time this week', 'At a time I pick', 'When Alex lands', 'Next time it rains']) await R('button', { name: way, exact: true }).waitFor();
    await T(`Found so far · ${notes.view.found}`).waitFor();
    await T("“I folded your washing. You're welcome. I love you.”").waitFor();
    await T(/^Alex · you found it (today|yesterday|on \w+) at \d\d:\d\d$/).first().waitFor();
    await T(/^You · Alex found it (today|yesterday|on [\w ]+) at \d\d:\d\d$/).first().waitFor();
    await shot('tucked');
    // All of them, a page at a time.
    await R('button', { name: `Show all ${notes.view.found}` }).click();
    await T('“Your keys are in the fruit bowl. As always.”').waitFor({ timeout: 20000 });
  });

  await step('tucked-write', async () => {
    const secret = `A walk-through note, ${tag}.`;
    await R('button', { name: 'Tuck another' }).click();
    await T('Until it turns up, Alex only sees on Today that a note is waiting, and who it is from. Never the words.').waitFor();
    await F('Your note').fill(secret);
    await shot('tucked-write');
    await R('button', { name: 'Tuck it away' }).click();
    await R('heading', { name: `“${secret}”` }).waitFor({ timeout: 20000 });
    await R('button', { name: '1 more' }).waitFor();
    // Alex is handed none of it: not on the board, not in its list, not in a search.
    const forAlex = await boardAs(asAlex, notes.id);
    const listed = await asAlex('GET', `/v1/boards/${notes.id}/entries?kind=note&limit=50`);
    const found = await asAlex('GET', `/v1/circles/${two.id}/search?q=${encodeURIComponent(`walk-through note, ${tag}`)}`);
    if (JSON.stringify([forAlex.view, listed]).includes(tag) || found.hits.length) throw new Error('the API hands Alex a note that has not turned up');
    if (forAlex.view.tucked.some((note) => !note.mine) || forAlex.view.turnedUp.length) throw new Error("Alex is handed someone else's hidden notes");
    // The chips change how the note in the card turns up. One that nothing can signal yet is kept, and says what it waits for.
    await R('button', { name: 'Next time it rains', exact: true }).click();
    await T('It is kept, and it waits. A weather source to say that it is raining. None is connected yet.').waitFor({ timeout: 20000 });
    await T('It can be tucked away, and it waits. A weather source to say that it is raining. None is connected yet.').waitFor();
    await shot('tucked-waits');
    // A time its writer picks: the day, and the time typed the way it is said.
    await R('button', { name: 'At a time I pick', exact: true }).click();
    await T('Pick the moment. Tomorrow at half past seven?').waitFor();
    await F('The time').fill('7.30pm');
    await T('It turns up at 19:30.').waitFor();
    await shot('tucked-at');
    await R('button', { name: 'Set the time' }).click();
    await T(/^It turns up on \w+ \d+ \w+ at 19:30\.$/).waitFor({ timeout: 20000 });
    // Until it has turned up its writer can take it back.
    await more().click();
    await R('button', { name: /^Still tucked away\. 2 notes/ }).click();
    await T('You can take a note back until it has turned up. After that it is theirs.').waitFor();
    await shot('tucked-still');
    await R('button', { name: `Take it back: ${secret}` }).click();
    await R('button', { name: `Take it back: ${secret}` }).waitFor({ state: 'detached', timeout: 20000 });
    await closeSheet();
    await R('heading', { name: '“Your coffee this morning was the best part of my day.”' }).waitFor({ timeout: 20000 });
  });

  await step('tucked-turns-up', async () => {
    // Alex tucks one away for Nora, to turn up in a few seconds. Until then her board has nothing of it...
    const secret = `Walk-through: look under the doormat, ${tag}.`;
    await addAs(asAlex, notes.id, 'note', { text: secret, turnsUp: 'at', at: new Date(Date.now() + 6000).toISOString() });
    const early = await boardAs(asNora, notes.id);
    if (JSON.stringify(early.view).includes(tag)) throw new Error('the API hands Nora a note before it has turned up');
    await page.goto(`${WEB_URL}/board/${notes.id}`);
    await R('heading', { name: 'Tucked notes' }).waitFor({ timeout: 20000 });
    if (await page.getByText(secret).count()) throw new Error('Nora sees a note before it has turned up');
    // ...and then it is hers: the card says so, and she says she found it.
    await page.waitForTimeout(7000);
    await page.goto(`${WEB_URL}/board/${notes.id}`);
    await T('From Alex · it just turned up').waitFor({ timeout: 20000 });
    await R('heading', { name: `“${secret}”` }).waitFor();
    await shot('tucked-turned-up');
    await R('button', { name: 'Found it' }).click();
    await T('From Alex · it just turned up').waitFor({ state: 'detached', timeout: 20000 });
    await T(`Found so far · ${notes.view.found + 1}`).waitFor();
    await T(`“${secret}”`).waitFor();
    await T(/^Alex · you found it today at \d\d:\d\d$/).waitFor();
    // Alex, who wrote it, sees that she did.
    const forAlex = await boardAs(asAlex, notes.id);
    if (!forAlex.view.foundLately.some((note) => note.text === secret && note.mine && note.found)) throw new Error('Alex is not told his note was found');
    await shot('tucked-found');
    // (It goes with this run: a note that has turned up is its reader's to throw away.)
    for (const note of (await asNora('GET', `/v1/boards/${notes.id}/entries?kind=note&q=walk-through&limit=50`)).items) await asNora('DELETE', `/v1/board-entries/${note.id}`);
  });

  // ------------------------------------------------------------------ The anniversary questions

  let questions;
  await step('anniversary', async () => {
    questions = await sampleBoard('anniversary');
    // An answer an earlier run wrote is taken out first.
    for (const mine of questions.view.next.yours) if (mine.answerId && (mine.answer || '').includes('walk-through')) await asNora('DELETE', `/v1/board-entries/${mine.answerId}`);
    questions = await boardAs(asNora, questions.id);
    const next = questions.view.next;
    await openSample(/^The anniversary questions\. Does work/, /^The anniversary questions\. Year thirteen opens/);
    // The year that has opened: both answers side by side, and the word they share.
    await R('heading', { name: /^\d+ July 2026$/ }).waitFor({ timeout: 20000 });
    await T('Year twelve').waitFor();
    await R('heading', { name: 'The best day of this year?' }).waitFor();
    await L('You: The canoe at Bled, when Mia steered.').waitFor();
    await L('Alex: Bled. Obviously Bled.').waitFor();
    await T('You both said Bled').waitFor();
    // The year that is being written: when it opens, how far Nora is, and that Alex has finished. Never his words.
    await T(/^Year thirteen opens on \d+ July$/).waitFor();
    await T(`You've answered ${next.answered} of ${next.yours.length}. Alex's are sealed.`).waitFor();
    if (JSON.stringify(questions.view).includes('The night we got the sledge stuck')) throw new Error("the API hands Nora Alex's sealed answers");
    await shot('anniversary');
    // Nora writes one more of hers.
    const secret = `A walk-through answer, ${tag}.`;
    const open = next.yours.find((one) => !one.answer);
    await R('button', { name: 'Write mine' }).click();
    await T('Year thirteen, yours').waitFor();
    await T("Alex can't read yours until the year opens, and you can't read theirs. Until then you can change yours; once it has opened, every answer stays as it is.").waitFor();
    await F(open.question).fill(secret);
    await shot('anniversary-write');
    await R('button', { name: 'Seal my answers' }).click();
    await T(`You've answered ${next.answered + 1} of ${next.yours.length}. Alex's are sealed.`).waitFor({ timeout: 20000 });
    // Alex is handed nothing of it: his own answers, the opened year, and that Nora hasn't finished.
    const forAlex = await boardAs(asAlex, questions.id);
    if (JSON.stringify(forAlex).includes(tag) || JSON.stringify(forAlex).includes('The first snow')) throw new Error("the API hands Alex Nora's answers before the year has opened");
    if (forAlex.view.next.others[0].done !== false || !forAlex.view.next.youAreDone) throw new Error('Alex is not told where both stand');
    // (Taken out again, so the sample year stays as it was.)
    const written = (await boardAs(asNora, questions.id)).view.next.yours.find((one) => one.answer === secret);
    await asNora('DELETE', `/v1/board-entries/${written.answerId}`);
  });

  await step('anniversary-new', async () => {
    // Started from the gallery, it asks for the day it all began: a year ago today, so its first year opens as soon as both have answered.
    const since = new Date();
    since.setFullYear(since.getFullYear() - 1);
    const sinceName = `${since.getDate()} ${since.toLocaleDateString('en-GB', { month: 'long' })} ${since.getFullYear()}`;
    const id = await startNew(/^The anniversary questions\. Does work/, async () => {
      if ((await R('button', { name: 'Start another' }).getAttribute('aria-disabled')) !== 'true') throw new Error('the anniversary questions could be started without the day it all began');
      await R('button', { name: 'The day it all began: Choose a day. Change' }).click();
      await R('button', { name: 'A year back' }).click();
      await R('button', { name: sinceName, exact: true }).click();
      await R('button', { name: `The day it all began: ${sinceName}. Change` }).waitFor();
      await shot('anniversary-start');
    });
    await R('heading', { name: 'Nothing has opened yet' }).waitFor({ timeout: 20000 });
    await T('Year one opens when you have both answered').waitFor();
    await T("Yours aren't written yet. Alex hasn't finished.").waitFor();
    await shot('anniversary-empty');
    // Nora answers all five. The year stays shut: Alex hasn't.
    await R('button', { name: 'Write mine' }).click();
    const mine = (await boardAs(asNora, id)).view.next.yours;
    for (const [index, one] of mine.entries()) await F(one.question).fill(`Nora's answer ${index + 1}, ${tag}.`);
    await R('button', { name: 'Seal my answers' }).click();
    await T("Yours are sealed. Alex hasn't finished.").waitFor({ timeout: 20000 });
    await R('heading', { name: 'Nothing has opened yet' }).waitFor();
    const shut = await boardAs(asAlex, id);
    if (shut.view.shown !== null || JSON.stringify(shut).includes(tag)) throw new Error("the API hands Alex Nora's answers before he has written his own");
    await shot('anniversary-sealed');
    // Alex answers his, apart. Now the day has come and both have answered: it opens, side by side.
    for (const [index, one] of shut.view.next.yours.entries()) await addAs(asAlex, id, 'answer', { questionId: one.questionId, text: `Alex's answer ${index + 1}, ${tag}.` });
    await page.goto(`${WEB_URL}/board/${id}`);
    await T('Year one', { exact: true }).waitFor({ timeout: 20000 });
    await L(`You: Nora's answer 1, ${tag}.`).waitFor();
    await L(`Alex: Alex's answer 1, ${tag}.`).waitFor();
    await T(/^Year two opens on \d+ \w+$/).waitFor();
    await shot('anniversary-opened');
    // A question of their own, asked from the year that is now being written.
    await more().click();
    await R('button', { name: /^Add a question\. Asked from year two on/ }).click();
    await F('The question').fill(`What did the walk-through teach us? (${tag})`);
    await R('button', { name: 'Add the question' }).click();
    await T('Everyone answers it from year two on. The years that have opened stay as they are.').waitFor({ state: 'detached', timeout: 20000 });
    await R('button', { name: 'Write mine' }).click();
    await L(`What did the walk-through teach us? (${tag})`).waitFor();
    await closeSheet();
  });

  // ------------------------------------------------------------------ Mystery date

  let dates;
  await step('mystery-date', async () => {
    dates = await sampleBoard('mystery_date');
    const coming = dates.view.next;
    if (!coming || !coming.yours || coming.revealed) throw new Error("the sample date isn't Nora's to plan any more: start from fresh sample data");
    // What an earlier run added to the plan, the clues and the jar is taken out first, and the hint put back.
    for (const part of [...coming.plan, ...coming.clues]) if ((part.title || part.text).includes('walk-through')) await asNora('DELETE', `/v1/board-entries/${part.id}`);
    for (const idea of (await asNora('GET', `/v1/boards/${dates.id}/entries?kind=idea&q=walk-through&limit=50`)).items) await asNora('DELETE', `/v1/board-entries/${idea.id}`);
    if (coming.hint !== 'Wear something warm.') await asNora('PATCH', `/v1/board-entries/${coming.id}?day=${DAY}`, { fields: { hint: 'Wear something warm.' } });
    await openSample(/^Mystery date\. Does work/, /^Date night\./, 'Fair and fun');
    await R('heading', { name: 'Date night' }).waitFor({ timeout: 20000 });
    // What Alex can see, said to the one who plans; her plan, hidden from him; and the dates there have been.
    await T(/^\w{3} \d+ \w{3} · your turn to plan$/).waitFor();
    await R('heading', { name: 'All Alex can see: “20:00. Wear something warm.”' }).waitFor();
    await T('The rest is hidden from Alex until the date begins.').waitFor();
    await T('Your plan').waitFor();
    await R('button', { name: 'Night sledging on Krvavec. Two tickets booked. Not Alex' }).waitFor();
    await R('button', { name: '€46, from the fun pot. He\'ll see “a date” in Money, not what' }).waitFor();
    await R('button', { name: 'Ines has the children until 23:30. Her guest pass is ready. Sorted' }).waitFor();
    await T(`Turns · ${dates.view.thisYear} dates this year`).waitFor();
    await L('A cooking class. Alex planned · October').waitFor();
    await L('Open-air cinema. You planned · September').waitFor();
    await shot('mystery-date');
    // Alex is handed the day, the time and the hint, how many clues are to come, and nothing of the plan.
    const forAlex = (await boardAs(asAlex, dates.id)).view.next;
    if (forAlex.title !== null || forAlex.plan.length || forAlex.clues.some((clue) => !clue.open) || JSON.stringify(forAlex).includes('sledging')) throw new Error('the API hands Alex the plan of a date that is hidden from him');
    if (forAlex.hint !== 'Wear something warm.' || forAlex.time !== '20:00') throw new Error('Alex is not handed the time and the hint');
  });

  await step('mystery-date-plan', async () => {
    const coming = dates.view.next;
    // The hint is all he gets: it is changed, he is handed the new one, and it is put back.
    await R('button', { name: 'Change the hint' }).click();
    await F('The hint').fill('Wear something warm. Really.');
    await shot('mystery-date-hint');
    await R('button', { name: 'Save', exact: true }).click();
    await R('heading', { name: 'All Alex can see: “20:00. Wear something warm. Really.”' }).waitFor({ timeout: 20000 });
    if ((await boardAs(asAlex, dates.id)).view.next.hint !== 'Wear something warm. Really.') throw new Error('Alex is not handed the new hint');
    await R('button', { name: 'Change the hint' }).click();
    await F('The hint').fill('Wear something warm.');
    await R('button', { name: 'Save', exact: true }).click();
    await R('heading', { name: 'All Alex can see: “20:00. Wear something warm.”' }).waitFor({ timeout: 20000 });
    // Stuck for an idea? The jar gives one, and another.
    await R('button', { name: 'Shake the jar' }).click();
    await T(`One of the ${dates.view.ideas} ideas in the jar.`).waitFor({ timeout: 20000 });
    await R('button', { name: 'Make it the plan' }).waitFor();
    await shot('mystery-date-jar');
    await R('button', { name: 'Shake again' }).click();
    await page.waitForTimeout(800);
    await closeSheet();
    // A line for the plan: added, marked as sorted, and taken off again.
    await R('button', { name: 'Add to the date' }).click();
    await F('What it is').fill(`A flask of tea (walk-through ${tag})`);
    await F('A note').fill('In the blue rucksack');
    await R('radio', { name: 'People' }).click();
    await shot('mystery-date-add');
    await R('button', { name: 'Add it to the plan' }).click();
    const line = R('button', { name: new RegExp(`^A flask of tea \\(walk-through ${tag}\\)\\. In the blue rucksack`) });
    await line.waitFor({ timeout: 20000 });
    await line.click();
    await R('switch', { name: 'Sorted' }).click();
    await R('button', { name: 'Save', exact: true }).click();
    await R('button', { name: `A flask of tea (walk-through ${tag}). In the blue rucksack. Sorted` }).waitFor({ timeout: 20000 });
    await R('button', { name: `A flask of tea (walk-through ${tag}). In the blue rucksack. Sorted` }).click();
    await R('button', { name: 'Take it off the plan' }).click();
    await line.waitFor({ state: 'detached', timeout: 20000 });
    // A clue that opens at once reaches Alex; the ones whose moment hasn't come don't.
    await R('button', { name: 'Add to the date' }).click();
    await R('radio', { name: 'A clue' }).click();
    await F('The clue').fill(`A walk-through clue, ${tag}.`);
    await R('button', { name: 'Add the clue' }).click();
    const clue = R('button', { name: new RegExp(`^A walk-through clue, ${tag}\\.\\. Open$`) });
    await clue.waitFor({ timeout: 20000 });
    const clues = (await boardAs(asAlex, dates.id)).view.next.clues.map((one) => one.text);
    if (clues.length !== 1 || clues[0] !== `A walk-through clue, ${tag}.`) throw new Error(`Alex is handed these clues: ${JSON.stringify(clues)}`);
    await clue.click();
    await R('button', { name: 'Take the clue out' }).click();
    await clue.waitFor({ state: 'detached', timeout: 20000 });
    // An idea for the jar, which both see.
    await R('button', { name: 'Add to the date' }).click();
    await R('radio', { name: 'The jar' }).click();
    await F('An idea for a date').fill(`A walk-through in the park (${tag})`);
    await R('button', { name: 'Put it in the jar' }).click();
    await T('You both see the jar.').waitFor({ state: 'detached', timeout: 20000 });
    const jar = (await boardAs(asAlex, dates.id)).view.ideas;
    if (jar !== dates.view.ideas + 1) throw new Error('the idea did not reach the jar');
    for (const idea of (await asNora('GET', `/v1/boards/${dates.id}/entries?kind=idea&q=walk-through&limit=50`)).items) await asNora('DELETE', `/v1/board-entries/${idea.id}`);
    // Revealing it is asked about first, and not done here: the sample date stays a mystery.
    await more().click();
    await R('button', { name: /^Reveal it now\. Shows Alex the whole plan/ }).click();
    await T("Alex sees what it is and the whole plan at once. It can't be hidden again.").waitFor();
    await shot('mystery-date-reveal');
    await R('button', { name: 'Keep it', exact: true }).click();
    void coming;
  });

  // ------------------------------------------------------------------ Both said yes

  let decks;
  let ownDecks;
  await step('both-yes', async () => {
    decks = await sampleBoard('both_yes');
    await openSample(/^Both said yes\. Does work/, /^Both said yes\. \d+ matches/, 'Fair and fun');
    await R('heading', { name: 'Both said yes' }).waitFor({ timeout: 20000 });
    // The deck that is open, its next idea, what both said yes to, and the other decks.
    const open = (await boardAs(asNora, decks.id)).view.deck;
    for (const tab of ['Dinner', 'Film', 'Holiday', 'Names']) await R('radio', { name: tab, exact: true }).waitFor();
    if (!open.card) throw new Error('the sample deck has no idea left for Nora: start from fresh sample data');
    await R('heading', { name: open.card.text }).waitFor();
    await T(`${open.number} of ${open.of} · Alex can't see your answers`).waitFor();
    await T('You both said yes to Thai').waitFor();
    await T('What only one of you wanted stays secret.').waitFor();
    await R('button', { name: /^Friday's film\. You've done \d+ of 10$/ }).waitFor();
    await R('button', { name: "Summer 2027. Alex has finished. You haven't." }).waitFor();
    await R('button', { name: /^Names\. \d+ seen · \d+ you both like$/ }).waitFor();
    await shot('both-yes');
    // A yes, in private: the next idea comes, and Alex is handed nothing about it.
    await R('button', { name: `Yes to ${open.card.text}` }).click();
    if (open.number < open.of) await T(`${open.number + 1} of ${open.of} · Alex can't see your answers`).waitFor({ timeout: 20000 });
    else await R('heading', { name: "You're through Dinner" }).waitFor({ timeout: 20000 });
    const forAlex = await boardAs(asAlex, decks.id, open.id);
    if (forAlex.view.deck.matches.some((idea) => idea.id === open.card.id)) throw new Error('one yes made a match');
    // (Taken back, so the sample deck stays where it was.)
    await actAs(asNora, decks.id, 'say', { ideaId: open.card.id, yes: null });
    // Another deck opens from its row; one kept behind the phone's lock stays shut where there is no lock.
    await R('button', { name: /^Friday's film\./ }).click();
    await T(/^\d+ of 10 · Alex can't see your answers$/).waitFor({ timeout: 20000 });
    await R('radio', { name: 'Names', exact: true }).click();
    await R('heading', { name: "Names is kept behind the phone's lock" }).waitFor({ timeout: 20000 });
    await shot('both-yes-locked');
  });

  await step('both-yes-two-people', async () => {
    // A board of their own: a deck, two ideas. Nora says yes to one and no to the other; Alex says yes to both.
    ownDecks = await startNew(/^Both said yes\. Does work/, null, 'Fair and fun');
    await R('heading', { name: 'Nothing to decide yet' }).waitFor({ timeout: 20000 });
    await shot('both-yes-empty');
    await R('button', { name: 'Start a deck' }).click();
    await F('What you are deciding').fill(`Breakfast (${tag})`);
    await F('A short word for its tab').fill('Breakfast');
    await shot('both-yes-add-deck');
    await R('button', { name: 'Start the deck' }).click();
    await R('heading', { name: `Nothing in Breakfast (${tag}) yet` }).waitFor({ timeout: 20000 });
    for (const idea of ['Pancakes', 'Porridge']) {
      await R('button', { name: 'Add an idea or a deck' }).click();
      await R('radio', { name: 'To Breakfast', checked: true }).waitFor();
      await F('The idea').fill(idea);
      await R('button', { name: 'Add the idea' }).click();
      await L('The idea').waitFor({ state: 'detached', timeout: 20000 });
    }
    await R('heading', { name: 'Pancakes' }).waitFor({ timeout: 20000 });
    await T("1 of 2 · Alex can't see your answers").waitFor();
    await R('button', { name: 'Yes to Pancakes' }).click();
    await R('heading', { name: 'Porridge' }).waitFor({ timeout: 20000 });
    await R('button', { name: 'No to Porridge' }).click();
    await R('heading', { name: `You're through Breakfast (${tag})` }).waitFor({ timeout: 20000 });
    await T('All 2 ideas answered. Only the matches show.').waitFor();
    // Before Alex has answered there is no match, and he is handed nothing of what she said.
    const before = await boardAs(asAlex, ownDecks);
    if (before.view.deck.matches.length || before.view.decks[0].matches) throw new Error('there is a match before Alex has answered');
    if (before.view.deck.card.yours !== null) throw new Error("Alex is handed an answer that isn't his");
    for (const idea of (await asAlex('GET', `/v1/boards/${ownDecks}/entries?kind=idea&limit=50`)).items) await actAs(asAlex, ownDecks, 'say', { ideaId: idea.id, yes: true });
    // Only what both said yes to shows, for both.
    await page.goto(`${WEB_URL}/board/${ownDecks}`);
    await T('You both said yes to Pancakes').waitFor({ timeout: 20000 });
    if (await page.getByText(/said yes to .*Porridge/).count()) throw new Error('an idea only one of them wanted shows as a match');
    const after = await boardAs(asAlex, ownDecks);
    if (after.view.deck.matches.map((idea) => idea.text).join() !== 'Pancakes') throw new Error('Alex is handed more than the match');
    await shot('both-yes-match');
  });

  // ------------------------------------------------------------------ The fair share

  let share;
  let ownShare;
  await step('fair-share', async () => {
    share = await sampleBoard('fair_share');
    const view = share.view;
    await openSample(/^The fair share\. Does work/, /^Fair share\./, 'Fair and fun');
    await R('heading', { name: 'Fair share' }).waitFor({ timeout: 20000 });
    // The month as one bar, each side's jobs with their hours, and the one swap that would bring it close.
    await T(view.monthName, { exact: true }).waitFor();
    await L(`You ${view.people[0].percent} percent, Alex ${view.people[1].percent} percent`).waitFor();
    await T(`You · ${view.people[0].hours} hours`).waitFor();
    await T(`Alex · ${view.people[1].hours} hours`).waitFor();
    for (const job of ['Meals', 'School things', 'Laundry', 'Bedtimes', 'The car', 'Biscuit']) await T(job, { exact: true }).waitFor();
    await T('Hours are your own guesses for each job. Only the two of you ever see this.').waitFor();
    if (view.swap && !view.offered) {
      await T('One swap would bring it close').waitFor();
      await T(view.swap.line).waitFor();
      await R('button', { name: 'Suggest' }).waitFor();
    }
    await shot('fair-share');
    // The jobs, to tick what was hers and guess the hours: one hour more, and back.
    const meals = view.jobs.find((job) => job.name === 'Meals');
    await R('button', { name: `You. ${view.people[0].hours} hours. Change what you ticked` }).click();
    await T(`Your jobs in ${view.monthName}`).waitFor();
    await R('checkbox', { name: 'Meals was mine', checked: true }).waitFor();
    await R('checkbox', { name: 'The car was mine', checked: false }).waitFor();
    await shot('fair-share-tick');
    await R('button', { name: 'One hour more for Meals' }).click();
    await T(`${meals.yourHours + 1} h`, { exact: true }).waitFor({ timeout: 20000 });
    await R('button', { name: 'One hour less for Meals' }).click();
    await T(`${meals.yourHours + 1} h`, { exact: true }).waitFor({ state: 'detached', timeout: 20000 });
    await closeSheet();
    await T(`You · ${view.people[0].hours} hours`).waitFor({ timeout: 20000 });
    // Another month, from More, and back.
    const other = view.months.find((month) => month !== view.month);
    if (other) {
      const name = new Date(`${other}-15`).toLocaleDateString('en-GB', { month: 'long' });
      await more().click();
      await R('button', { name: `Show ${name}` }).click();
      await T(name, { exact: true }).waitFor({ timeout: 20000 });
      await shot('fair-share-month');
      await more().click();
      await R('button', { name: `Show ${view.monthName}` }).click();
      await T(`You · ${view.people[0].hours} hours`).waitFor({ timeout: 20000 });
    }
  });

  await step('fair-share-two-people', async () => {
    // A share of their own, from nothing: Nora ticks hers on the phone, Alex his through the API.
    ownShare = await startNew(/^The fair share\. Does work/, null, 'Fair and fun');
    await R('heading', { name: /^Nothing ticked for \w+ yet$/ }).waitFor({ timeout: 20000 });
    await shot('fair-share-empty');
    await R('button', { name: 'Tick my jobs' }).click();
    await F('Another job').fill('Cooking');
    await R('button', { name: 'Add the job' }).click();
    await R('checkbox', { name: 'Cooking was mine', checked: false }).click();
    await R('checkbox', { name: 'Cooking was mine', checked: true }).waitFor({ timeout: 20000 });
    for (const hours of [2, 3, 4, 5]) {
      await R('button', { name: 'One hour more for Cooking' }).click();
      await T(`${hours} h`, { exact: true }).waitFor({ timeout: 20000 });
    }
    await shot('fair-share-ticking');
    await closeSheet();
    const jobs = {};
    for (const name of ['Laundry', 'Bins', 'The car']) jobs[name] = (await addAs(asNora, ownShare, 'job', { name })).entryId;
    await actAs(asNora, ownShare, 'tick', { jobId: jobs.Laundry, hours: 3 });
    await actAs(asAlex, ownShare, 'tick', { jobId: jobs.Bins, hours: 1 });
    await actAs(asAlex, ownShare, 'tick', { jobId: jobs['The car'], hours: 3 });
    // Eight hours to four: one swap would bring it close, worded for whoever looks, and Nora suggests it.
    await page.goto(`${WEB_URL}/board/${ownShare}`);
    await T('You · 8 hours').waitFor({ timeout: 20000 });
    await T('Alex · 4 hours').waitFor();
    await T('One swap would bring it close').waitFor();
    const swap = (await boardAs(asNora, ownShare)).view.swap;
    await T(swap.line).waitFor();
    await R('button', { name: 'Suggest' }).click();
    await T('You suggested it. It waits for Alex.').waitFor({ timeout: 20000 });
    await shot('fair-share-suggested');
    // She can't answer her own suggestion; it is put in front of Alex, in his words.
    const forAlex = (await boardAs(asAlex, ownShare)).view.offered;
    if (!forAlex || forAlex.yours || forAlex.accepted !== null) throw new Error('the swap was not put in front of Alex');
  });

  // ------------------------------------------------------------------ Today, with friends

  await step('crew-today', async () => {
    const crew = (await asNora('GET', '/v1/circles')).find((circle) => circle.kind === 'crew');
    await switchTo('Lisbon crew');
    // The day that works is the headline; what Nora is owed has its button; the cards are lines; what is new is "From the crew".
    const { today, parts } = await checkToday(nora, crew, 'From the crew');
    if (!parts.headline) throw new Error("the crew's Today has no headline card");
    await T('From the crew').waitFor();
    const owed = today.items.find((item) => item.kind === 'split');
    if (!owed) throw new Error("the crew's Today has no line about what Nora is owed");
    await R('button', { name: `Remind. ${owed.title}` }).waitFor();
    await shot('crew-today');
    // "Remind" reminds everyone who owes her, and says so.
    const before = (await asNora('GET', `/v1/splits/${owed.thingId}`)).settle.filter((one) => one.paysYou);
    await R('button', { name: `Remind. ${owed.title}` }).click();
    await T(/ ha(s|ve) been reminded\.$/).waitFor({ timeout: 20000 });
    await shot('crew-today-reminded');
    const after = (await asNora('GET', `/v1/splits/${owed.thingId}`)).settle.filter((one) => one.paysYou);
    if (before.length === 0 || after.some((one) => !one.remindedAt)) throw new Error('not everyone who owes Nora was reminded');
    // A card that is a line opens its board; with nothing of the crew's own in the rail, the heading leads to the Library.
    const card = parts.lines[0];
    if (card) {
      await R('button', { name: [card.figure, card.title, card.line].filter(Boolean).join('. ') }).click();
      await page.waitForURL(/\/board\/[0-9a-f-]{36}/, { timeout: 20000 });
      await R('button', { name: 'Back', exact: true }).click();
    }
    if (parts.rail.length === 0 && today.fresh.length) {
      await R('button', { name: 'From the crew. See all' }).click();
      await R('tab', { name: 'Library', selected: true }).waitFor({ timeout: 20000 });
      await R('tab', { name: 'Today' }).click();
    }
  });

  await step('crew-templates', async () => {
    await checkGallery('crew');
    await shot('crew-templates');
    // (The family is Nora's first circle again for whoever walks next.)
    await switchTo('The Linds');
    await ctx.signOut();
  });

  // ------------------------------------------------------------------ the other half

  await step('as-alex', async () => {
    await ctx.signIn('alex@example.com');
    await switchTo('Nora and Alex');
    // His Today: the date he gets a hint of, the note that waits for him, and what he owes, to settle.
    const { today, parts } = await checkToday(alex, two, 'The two of you');
    if (parts.headline && /sledging/i.test(JSON.stringify(today))) throw new Error("Alex's Today names what the date is");
    const owes = today.items.find((item) => item.kind === 'split');
    if (owes) {
      await R('button', { name: `Settle. ${owes.title}` }).click();
      await T(`Have you paid Nora ${owes.lead}?`).waitFor();
      await R('button', { name: 'Not yet' }).click();
    }
    await shot('us-today-other');
    // The date: the day, the time and the hint, and that clues are to come. Not a word of the plan.
    await page.goto(`${WEB_URL}/board/${dates.id}`);
    await R('heading', { name: 'Date night' }).waitFor({ timeout: 20000 });
    await T(/^\w{3} \d+ \w{3} · Nora is planning$/).waitFor();
    await R('heading', { name: '“20:00. Wear something warm.”' }).waitFor();
    await T("That is all you get until you're there.").waitFor();
    await T(/^(One more clue|\w+ more clues) to come$/).waitFor();
    if ((await page.getByText(/sledging|fun pot|Ines/).count()) || (await page.getByText('Your plan').count())) throw new Error('Alex sees the plan of a date that is hidden from him');
    if (await page.getByRole('button', { name: 'Change the hint' }).count()) throw new Error("Alex can change a date that isn't his to plan");
    await L('A cooking class. You planned · October').waitFor();
    await shot('mystery-date-other');
    // He can put an idea in the jar, and nothing on the plan.
    await R('button', { name: 'Add an idea to the jar' }).click();
    await T('For whoever plans next. You both see the jar.').waitFor();
    if (await page.getByRole('radio', { name: 'The plan' }).count()) throw new Error('Alex is offered the plan of a date that is hidden from him');
    await closeSheet();
  });

  await step('as-alex-notes-and-questions', async () => {
    // Tucked notes: his own that is hiding for Nora, and nothing of hers for him.
    await page.goto(`${WEB_URL}/board/${notes.id}`);
    await R('heading', { name: 'Tucked notes' }).waitFor({ timeout: 20000 });
    await T('Tucked away for Nora').waitFor();
    if (await page.getByText(/Your coffee this morning/).count()) throw new Error("Alex sees Nora's note before it has turned up");
    await T(/^You · Nora found it /).first().waitFor();
    await shot('tucked-other');
    // The anniversary questions: his are sealed, and Nora hasn't finished. Her unopened answers are nowhere.
    await page.goto(`${WEB_URL}/board/${questions.id}`);
    await T('Year twelve').waitFor({ timeout: 20000 });
    await T("Yours are sealed. Nora hasn't finished.").waitFor();
    await R('button', { name: 'Change mine' }).click();
    await T("Nora can't read yours until the year opens, and you can't read theirs. Until then you can change yours; once it has opened, every answer stays as it is.").waitFor();
    if (await page.getByText(/The first snow/).count()) throw new Error("Alex sees Nora's answers before the year has opened");
    await shot('anniversary-other');
    await closeSheet();
  });

  await step('as-alex-yes-and-share', async () => {
    // Both said yes: the one match, and nothing about the idea only he wanted.
    await page.goto(`${WEB_URL}/board/${ownDecks}`);
    await T('You both said yes to Pancakes').waitFor({ timeout: 20000 });
    await R('heading', { name: `You're through Breakfast (${tag})` }).waitFor();
    if (await page.getByText(/said yes to .*Porridge/).count()) throw new Error('an idea only one of them wanted shows as a match');
    await shot('both-yes-other');
    // The fair share: the swap Nora suggested is his to answer, in his words. He says yes.
    await page.goto(`${WEB_URL}/board/${ownShare}`);
    await T('Nora suggests a swap').waitFor({ timeout: 20000 });
    await T('You · 4 hours').waitFor();
    await T((await boardAs(asAlex, ownShare)).view.offered.line).waitFor();
    await shot('fair-share-other');
    await R('button', { name: 'Yes to the swap' }).click();
    await T('The swap is agreed').waitFor({ timeout: 20000 });
    if ((await boardAs(asNora, ownShare)).view.offered.accepted !== true) throw new Error('Nora is not told the swap was agreed');
    await shot('fair-share-agreed');
    // The boards this walk-through started go with it.
    for (const id of made) await asNora('DELETE', `/v1/things/${id}`).catch(() => undefined);
    const first = (await asAlex('GET', '/v1/circles'))[0];
    await switchTo(first.name);
    await ctx.signOut();
  });

  // ------------------------------------------------------------------ Today, in a shared flat

  await step('flat-today', async () => {
    await ctx.signIn('kai@example.com');
    const kai = await tokenOf('kai@example.com');
    const circles = await ctx.api(kai, 'GET', '/v1/circles');
    const flat = circles.find((circle) => circle.kind === 'flat');
    await switchTo(flat.name);
    // The kitty is the headline; the day's things come first, then the cards with their figures and buttons.
    const { parts } = await checkToday(kai, flat, 'New in the flat');
    if (!parts.headline || parts.headline.look !== 'kitty') throw new Error("the flat's Today doesn't open on the kitty");
    await R('button', { name: /^(Fri|Now)\. My sister's staying, Friday to Sunday\./ }).waitFor();
    await R('checkbox', { name: 'Bins out' }).waitFor();
    await shot('flat-today');
    // A button on a card opens the board it is about: answering and paying are done there.
    for (const card of parts.lines.filter((one) => one.action)) {
      await R('button', { name: `${card.action}. ${card.title}` }).click();
      await page.waitForURL(new RegExp(`/board/${card.thingId}`), { timeout: 20000 });
      await R('button', { name: 'Back', exact: true }).click();
      await R('button', { name: `${card.action}. ${card.title}` }).waitFor({ timeout: 20000 });
    }
    await R('button', { name: `${parts.headline.title}. ${parts.headline.line}` }).click();
    await page.waitForURL(new RegExp(`/board/${parts.headline.thingId}`), { timeout: 20000 });
    await R('button', { name: 'Back', exact: true }).click();
  });

  await step('flat-templates', async () => {
    await checkGallery('flat');
    await shot('flat-templates');
    const first = (await ctx.api(await tokenOf('kai@example.com'), 'GET', '/v1/circles'))[0];
    await switchTo(first.name);
    await ctx.signOut();
  });
};
