// Milestone 8, for friends: When can everyone? (with its page for people without the app), Secret Santa,
// Where next?, the dictionary, Predictions, the awards and a goal you walk together. Nora opens each of the
// sample boards of Lisbon crew, and starts a new one of each from the gallery to use what the sample can't
// be used for without changing it.
//
// Several of these keep something from someone, so they are walked as two people: Kai, another of the crew,
// is signed in on a second phone. What he must not find is looked for on his screen and in what the API
// hands his phone: whose name Nora drew, a vote before it closes, a prediction that is sealed or still a
// draft, an award's votes before it is decided.
//
// It can be run again and again on the same data: every board it starts is deleted at the end, and what an
// earlier run left on a sample board is taken back through the API first.
const path = require('path');

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dateOf = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const isoOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (iso, count) => {
  const date = dateOf(iso);
  date.setDate(date.getDate() + count);
  return isoOf(date);
};
/** "Sat 28 Nov": a day as the app writes it where there is little room. */
const shortDay = (iso) => `${WEEKDAYS[dateOf(iso).getDay()].slice(0, 3)} ${dateOf(iso).getDate()} ${MONTHS[dateOf(iso).getMonth()].slice(0, 3)}`;
/** "Saturday 28 November": the same day as a screen reader hears it in the calendar. */
const longDay = (iso) => `${WEEKDAYS[dateOf(iso).getDay()]} ${dateOf(iso).getDate()} ${MONTHS[dateOf(iso).getMonth()]}`;
const exactly = (text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
const startsWith = (text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

exports.run = async function run(ctx) {
  const { page, T, R, L, shot, step, tag, WEB_URL, IMG, CODE } = ctx;
  const today = isoOf(new Date());
  const tokens = {};
  let crew;
  let kai;
  /** The boards this run started: deleted at the end, whatever happened on the way. */
  const made = [];
  const as = (who) => (method, address, body) => ctx.api(tokens[who], method, address, body);
  const asNora = as('nora');
  /** Puts the sheet that is up away, the way a person does: by tapping the dimmed page above it. */
  const closeSheet = (phone) => phone.R('button', { name: 'Close', exact: true }).click({ position: { x: 24, y: 24 } });
  const more = (phone = ctx) => phone.R('button', { name: 'More', exact: true });
  const boardOf = (id, who = 'nora') => as(who)('GET', `/v1/boards/${id}?day=${today}`);
  /** The sample board of a template in Lisbon crew: the oldest one, which the sample data made. */
  const sampleBoard = async (template, title) => {
    const boards = (await asNora('GET', `/v1/circles/${crew.id}/boards?template=${template}&limit=50`)).items;
    const found = boards.filter((board) => !title || board.title === title).pop();
    return boardOf(found.id);
  };
  const gallery = async (chip) => {
    await page.goto(WEB_URL + '/templates');
    await R('heading', { name: 'Templates' }).waitFor({ timeout: 20000 });
    if (chip) await R('button', { name: chip, exact: true }).click();
  };
  /** From the gallery: a template's card, and the board of it the crew has already. */
  const openFromGallery = async (card, row, chip) => {
    await gallery(chip);
    await R('button', { name: card }).click();
    await T('In Lisbon crew already').waitFor();
    await R('button', { name: row }).click();
  };
  /** From the gallery: a template's card, what it asks before it starts, and Start. Answers the new board's id. */
  const startFromGallery = async (card, chip, setUp) => {
    await gallery(chip);
    await R('button', { name: card }).click();
    await T('This one does work for you: it keeps itself up to date as you use it.').waitFor();
    if (setUp) await setUp();
    await R('button', { name: 'Seen by Lisbon crew. Change' }).waitFor();
    const [started] = await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && /\/templates\/[a-z_]+\/start/.test(r.url())), R('button', { name: 'Start another' }).click()]);
    if (started.status() !== 201) throw new Error(`starting ${card} gave ${started.status()}`);
    const id = (await started.json()).board.id;
    made.push(id);
    await page.waitForURL(new RegExp(`/board/${id}`));
    return id;
  };
  const open = async (id, phone = ctx) => {
    await phone.page.goto(`${WEB_URL}/board/${id}`);
  };
  /** What is on a phone's screen, as words: to look for what must not be there. (The screens underneath stay in the page on the web; they are not shown, and are not read here.) */
  const wordsOn = (phone) => phone.page.evaluate(() => document.body.innerText);
  /** How many bars of votes a phone's screen draws (a spinner is a "progress bar" to a browser too, and is not one of these). */
  const votesBars = (phone) => phone.page.locator('[role="progressbar"][aria-valuemax="100"]').evaluateAll((bars) => bars.filter((bar) => bar.offsetParent !== null).length);
  /** True when a phone's screen shows a count of votes on a line of its own ("3 votes"), as a decided vote does. */
  const showsVotes = async (phone) => /(^|\n)\s*\d+ votes?\s*(\n|$)/.test(await wordsOn(phone));
  /** Throws when a phone's screen, or what the API handed it, holds something it must not. */
  const mustNotHold = (what, haystack, needle) => {
    if (String(haystack).includes(needle)) throw new Error(`${what}: “${needle}” is there and must not be`);
  };

  await step('crew', async () => {
    await ctx.signIn('nora@example.com');
    for (const who of ['nora', 'lea', 'kai', 'lena', 'ana']) tokens[who] = (await ctx.api(null, 'POST', '/local-auth/token', { email: `${who}@example.com`, code: CODE })).accessToken;
    crew = (await asNora('GET', '/v1/circles')).find((circle) => circle.name === 'Lisbon crew');
    // What an earlier run started and didn't get to delete goes first.
    for (const board of (await asNora('GET', `/v1/circles/${crew.id}/boards?limit=100`)).items) {
      if (/^(Dinner|Santa|Trip|Words|Sealed|Shelf) [a-z0-9]{5}$/.test(board.title) || board.title === 'Walk to There') await asNora('DELETE', `/v1/things/${board.id}`).catch(() => undefined);
    }
    // Lisbon crew is the circle these screens are for.
    await R('button', { name: /Change circle$/ }).click();
    await R('button', { name: /^Lisbon crew\./ }).click();
    await R('button', { name: 'Lisbon crew. Change circle' }).waitFor({ timeout: 20000 });
    // Kai, another of the five, on a second phone: a phone is opened as someone new, emptied, and signed in as him.
    kai = await ctx.second('Crew Walkthrough');
    await kai.page.evaluate(() => window.localStorage.clear());
    await kai.page.goto(WEB_URL + '/');
    await kai.T('Get started').waitFor({ timeout: 20000 });
    await kai.signIn('kai@example.com');
  });

  try {
    await findDate();
    await secretSanta();
    await whereNext();
    await dictionary();
    await predictions();
    await awards();
    await walkTogether();
  } catch (problem) {
    // What went wrong on the second phone is only to be seen there.
    if (kai) {
      await kai.page.screenshot({ path: `${ctx.out}/${ctx.scheme}-FAILED-crew-kai.png` }).catch(() => undefined);
      console.log(`ON KAI'S SCREEN: ${await kai.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(-400)).catch(() => '(could not be read)')}`);
    }
    throw problem;
  } finally {
    for (const id of made) await asNora('DELETE', `/v1/things/${id}`).catch(() => undefined);
    if (kai) await kai.close();
  }

  await step('crew-leave', async () => {
    // Back to the family, where every other part of the walk-through expects Nora to be.
    await page.goto(WEB_URL + '/');
    await R('button', { name: 'Lisbon crew. Change circle' }).click();
    await R('button', { name: /^The Linds\./ }).click();
    await R('button', { name: 'The Linds. Change circle' }).waitFor({ timeout: 20000 });
    await ctx.signOut();
  });

  // ---------- 19.3 when can everyone? ----------

  async function findDate() {
    await step('find-date', async () => {
      const dinner = await sampleBoard('find_date', 'Reunion dinner');
      const best = dinner.view.best;
      await openFromGallery(/^When can everyone\?\. Does work/, /^Reunion dinner\./);
      await R('heading', { name: 'Reunion dinner' }).waitFor({ timeout: 20000 });
      // The days with how many can, the best one ringed, who it waits for, and the button that sets it.
      await T('Tap the days you can do').waitFor();
      await R('checkbox', { name: `${longDay(best.day)}. 4 people can. The best day so far`, checked: true }).waitFor();
      if ((await page.getByRole('checkbox').count()) < dinner.view.days.length) throw new Error('not every day that is offered is drawn');
      await T('1 or 2 of you').waitFor();
      await T('4 of you').waitFor();
      await T(`${shortDay(best.day)} works for all four who answered`).waitFor();
      await T("Lea, Lena, Ana and you. Kai hasn't tapped anything yet.").waitFor();
      await T('Still to answer').waitFor();
      await T(/^Sent (today|on \w+( \w+)?) · opened, not answered$/).waitFor();
      await R('button', { name: 'Nudge Kai' }).waitFor();
      await R('button', { name: `Set it for ${shortDay(best.day)}` }).waitFor();
      await T('It goes on all five calendars. Kai can still say no.').waitFor();
      await shot('find-date');
      // Who sees it is on More, where the bar is full.
      await more().click();
      await R('button', { name: /^Who can see this/ }).waitFor();
      await R('button', { name: /^None of these days work for me/ }).waitFor();
      await closeSheet(ctx);
    });

    let dinnerId;
    const dayA = today;
    const dayB = addDays(today, 2);
    await step('find-date-new', async () => {
      // A new one asks what it is for and which days to offer; it starts with the three weeks from today.
      dinnerId = await startFromGallery(/^When can everyone\?\. Does work/, null, async () => {
        await L('What is it for?').fill(`Dinner ${tag}`);
        await R('button', { name: `First day: ${shortDay(today)}. Change` }).waitFor();
        await R('button', { name: `Last day: ${shortDay(addDays(today, 20))}. Change` }).waitFor();
        await shot('find-date-start');
      });
      await R('heading', { name: `Dinner ${tag}` }).waitFor({ timeout: 20000 });
      await T('No day yet').waitFor();
      await T("When a day works, one tap puts it on everyone's calendar.").waitFor();
      await shot('find-date-empty');
      // "None of these work" is an answer too, and a tap on a day takes it back.
      await more().click();
      await R('button', { name: /^None of these days work for me/ }).click();
      await T('You said none of these days work for you. Tap a day if that changes.').waitFor();
      await R('checkbox', { name: startsWith(`${longDay(dayA)}.`) }).click();
      await R('checkbox', { name: `${longDay(dayA)}. 1 person can. The best day so far`, checked: true }).waitFor();
      await T('You said none of these days work for you. Tap a day if that changes.').waitFor({ state: 'detached' });
      await R('checkbox', { name: startsWith(`${longDay(dayB)}.`) }).click();
      await R('checkbox', { name: `${longDay(dayB)}. 1 person can`, checked: true }).waitFor();
      await T(`${shortDay(dayA)} works for the one who answered`).waitFor();
      await T("You. Lea, Kai, Lena and Ana haven't tapped anything yet.").waitFor();
      // A tap on a day that is ticked takes it back.
      await R('checkbox', { name: startsWith(`${longDay(dayA)}.`) }).click();
      await R('checkbox', { name: `${longDay(dayA)}. Nobody yet`, checked: false }).waitFor();
      // Lea answers on her own phone: the day both can do is the best one now.
      await as('lea')('POST', `/v1/boards/${dinnerId}/act`, { verb: 'tap', body: { day: dayB } });
      await open(dinnerId);
      await T(`${shortDay(dayB)} works for both who answered`).waitFor({ timeout: 20000 });
      await T("Lea and you. Kai, Lena and Ana haven't tapped anything yet.").waitFor();
      await T('1 of you').waitFor();
      await T('2 of you').waitFor();
    });

    await step('find-date-by-link', async () => {
      // The link for people without the app: it is in the sheet, to copy or to share.
      await R('button', { name: 'Ask someone without the app' }).click();
      await T('Anyone with this link writes their name and ticks their days on a web page. They see what it is for and who is asking, and nothing else.').waitFor();
      const link = (await boardOf(dinnerId)).view.link;
      await T(link.replace(/^https?:\/\//, '')).waitFor();
      await R('button', { name: 'Copy link' }).click();
      await R('button', { name: 'Copied' }).waitFor();
      await shot('find-date-link');
      await closeSheet(ctx);

      // Marta has no app. She opens the link, and is shown what it is for and who asks: nothing of what anyone answered.
      await ctx.webPage(link, 'Tick the days you can do. There is no account to make.', 'find-date-web-page', async (web) => {
        await web.getByText(`Dinner ${tag}`).first().waitFor();
        await web.getByText('Nora is asking').waitFor();
        const seen = await web.locator('body').innerText();
        for (const hidden of ['Lea', 'Kai', 'people can', 'works for', 'answered']) mustNotHold('the page for people without the app', seen, hidden);
      });
      await ctx.webPage(link, 'Thank you. Your days are with them.', 'find-date-web-thanks', async (web) => {
        await web.getByLabel('Your name').fill(`Marta ${tag}`);
        await web.locator(`#d${dayB}`).check();
        await web.getByRole('button', { name: 'Send my days' }).click();
      });

      // Her answer arrives in the app: she counts like everyone else, and stands under her own heading.
      await open(dinnerId);
      await T('Answered by link').waitFor({ timeout: 20000 });
      await T(`Marta ${tag}`).waitFor();
      await T('Can do 1 day').waitFor();
      await R('checkbox', { name: `${longDay(dayB)}. 3 people can. The best day so far`, checked: true }).waitFor();
      await T(`${shortDay(dayB)} works for all three who answered`).waitFor();
      await T(`Lea, Marta ${tag} and you. Kai, Lena and Ana haven't tapped anything yet.`).waitFor();
      // Her calendar isn't here: it still goes on the five of the crew.
      await T('It goes on all five calendars. Kai, Lena and Ana can still say no.').waitFor();
      await shot('find-date-by-link');

      // A new link replaces the old one, which stops working at once. Her answer stays.
      await R('button', { name: 'Ask someone without the app' }).click();
      await R('button', { name: 'Make a new link' }).click();
      await T('Make a new link? The old one stops working at once. The answers that came in stay.').waitFor();
      await R('button', { name: 'Yes, make a new link' }).click();
      await T('This is the new link. The old one no longer works.').waitFor({ timeout: 20000 });
      const newLink = (await boardOf(dinnerId)).view.link;
      if (newLink === link) throw new Error('the link was not replaced');
      await closeSheet(ctx);
      await ctx.webPage(link, "This link doesn't work any more", 'find-date-web-old-link');
      await T(`Marta ${tag}`).waitFor();
    });

    await step('find-date-two-people', async () => {
      // Kai opens it on his phone. His own row asks him, and the others are told he has looked.
      await open(dinnerId, kai);
      await kai.R('heading', { name: `Dinner ${tag}` }).waitFor({ timeout: 20000 });
      await kai.T('You', { exact: true }).waitFor();
      await kai.T(`${shortDay(dayB)} works for all three who answered`).waitFor();
      // He isn't asked to nudge himself.
      if (await kai.page.getByRole('button', { name: 'Nudge Kai' }).count()) throw new Error('Kai is offered to nudge himself');
      await kai.shot('find-date-kai');
      await open(dinnerId);
      await T(/^Sent today · opened, not answered$/).waitFor({ timeout: 20000 });
      // He can do the same day.
      await kai.R('checkbox', { name: startsWith(`${longDay(dayB)}.`) }).click();
      await kai.R('checkbox', { name: `${longDay(dayB)}. 4 people can. The best day so far`, checked: true }).waitFor({ timeout: 20000 });
      await open(dinnerId);
      await T(`${shortDay(dayB)} works for all four who answered`).waitFor({ timeout: 20000 });
      await T(`Lea, Kai, Marta ${tag} and you. Lena and Ana haven't tapped anything yet.`).waitFor();
      if (await page.getByRole('button', { name: 'Nudge Kai' }).count()) throw new Error('Kai has answered and can still be nudged');
    });

    await step('find-date-set', async () => {
      // A nudge is remembered, and shows on the row.
      await R('button', { name: 'Nudge Lena' }).click();
      await T(/^Sent today · not opened yet · nudged (just now|\d+ min ago)$/).waitFor({ timeout: 20000 });
      // An answer that came by link can be taken out by anyone of the crew.
      await R('button', { name: new RegExp(`^Remove Marta ${tag}'s? answer$`) }).click();
      await T(`Marta ${tag}`).waitFor({ state: 'detached', timeout: 20000 });
      await T(`${shortDay(dayB)} works for all three who answered`).waitFor();
      // One tap puts the day on everyone's calendar.
      await R('button', { name: `Set it for ${shortDay(dayB)}` }).click();
      await T(`It's set for ${shortDay(dayB)}`).waitFor({ timeout: 20000 });
      await T(`Set for ${shortDay(dayB)}`).waitFor();
      await T('It is on all five calendars.').waitFor();
      await shot('find-date-set');
      const set = (await boardOf(dinnerId)).view;
      if (set.setFor !== dayB || !set.eventId) throw new Error('setting the day made no event');
      // The link's page says so too, to someone without the app.
      await ctx.webPage(set.link, 'It is set for', 'find-date-web-set');
      // The event it became opens from here, and it is on Kai's calendar as well.
      await R('button', { name: 'Open it in the calendar' }).click();
      await R('heading', { name: `Dinner ${tag}` }).waitFor({ timeout: 20000 });
      await page.waitForURL(new RegExp(`/event/${set.eventId}`));
      await shot('find-date-event');
      const forKai = await as('kai')('GET', `/v1/events/${set.eventId}`);
      if (forKai.title !== `Dinner ${tag}`) throw new Error("the day that was set is not on Kai's calendar");
      await R('button', { name: 'Back', exact: true }).click();
      await T(`It's set for ${shortDay(dayB)}`).waitFor({ timeout: 20000 });
      // The event is this run's alone: it is taken away again, and the board says the day is open once more.
      await asNora('DELETE', `/v1/things/${set.eventId}`);
    });
  }

  // ---------- 19.4 Secret Santa ----------

  async function secretSanta() {
    await step('secret-santa', async () => {
      // An earlier run's tick and wish are taken back, so the sample is as the drawing has it.
      const santa = await sampleBoard('secret_santa', 'Secret Santa');
      if (santa.view.yours.gotIt) await asNora('POST', `/v1/boards/${santa.id}/act`, { verb: 'got_it', body: { got: false } });
      for (const wish of santa.view.myWishes) if (wish.text.startsWith('Walk-through')) await asNora('DELETE', `/v1/board-entries/${wish.id}`);

      await openFromGallery(/^Secret Santa\. Does work/, /^Secret Santa\. Drawn on /);
      await R('heading', { name: 'Secret Santa' }).waitFor({ timeout: 20000 });
      // The card only Nora sees: the one name she drew, the budget, and that person's wishes.
      await T('Only you can see this').waitFor();
      await R('heading', { name: "You're buying for Lena." }).waitFor();
      await T('Up to €25. Lena would like a plant that is hard to kill, or anything from the ceramics stall.').waitFor();
      // What everyone may know: who is in the hat, who can't draw whom, when the presents are swapped.
      await T('Five names in the hat').waitFor();
      await T(/^Drawn on 1 \w+\. Nobody can see the whole list\.$/).waitFor();
      await T("Lea and Kai can't draw each other").waitFor();
      await T("They're a couple").waitFor();
      await T('Swapped at the reunion dinner').waitFor();
      await T(exactly(shortDay(santa.view.swapOn))).waitFor();
      // Her own wish list, which whoever drew her reads.
      await T('Your own wish list').waitFor();
      await T('Good walking socks').waitFor();
      await T('A roll of 35 mm film').waitFor();
      await T('Whoever has you can see this').waitFor();
      await L("Something you'd like").waitFor();
      await shot('secret-santa');
    });

    await step('secret-santa-yours', async () => {
      // "I've got it" is a tick nobody else is shown; pressed again, it is taken back.
      await R('button', { name: "I've got it" }).click();
      await R('button', { name: "You've got it. Take that back" }).waitFor({ timeout: 20000 });
      await shot('secret-santa-got-it');
      await R('button', { name: "You've got it. Take that back" }).click();
      await R('button', { name: "I've got it" }).waitFor({ timeout: 20000 });
      // A wish is added in the box, changed, and taken off again.
      await L("Something you'd like").fill(`Walk-through wish ${tag}`);
      await L("Something you'd like").press('Enter');
      await R('button', { name: `Walk-through wish ${tag}. Change it` }).click();
      await L('Your wish', { exact: true }).fill(`Walk-through wish ${tag}, in blue`);
      await R('button', { name: 'Save', exact: true }).click();
      await R('button', { name: `Walk-through wish ${tag}, in blue. Change it` }).click();
      await shot('secret-santa-wish');
      await R('button', { name: 'Take it off the list' }).click();
      await T(`Walk-through wish ${tag}, in blue`).waitFor({ state: 'detached', timeout: 20000 });
      // The hat is closed once the names are drawn: who is in it is all there is to see.
      await R('button', { name: 'Five names in the hat. See who is in it' }).click();
      await T('The names are drawn, so the hat is closed. Who gives to whom is shown to nobody.').waitFor();
      if (await page.getByRole('button', { name: /^Take \w+ out of the hat$/ }).count()) throw new Error('a name can be taken out of the hat after the draw');
      await shot('secret-santa-hat');
      await closeSheet(ctx);
      // The swap's row leads to what it belongs to: the dinner's own board.
      await R('button', { name: /^Swapped at the reunion dinner\./ }).click();
      await R('heading', { name: 'Reunion dinner' }).waitFor({ timeout: 20000 });
      await R('button', { name: 'Back', exact: true }).click();
      await R('heading', { name: "You're buying for Lena." }).waitFor({ timeout: 20000 });
    });

    await step('secret-santa-two-people', async () => {
      const santa = await sampleBoard('secret_santa', 'Secret Santa');
      // Kai sees his own name, and nothing of Nora's: not on his screen, and not in what the API hands his phone.
      await open(santa.id, kai);
      await kai.R('heading', { name: "You're buying for Ana." }).waitFor({ timeout: 20000 });
      await kai.T('Up to €25. Ana would like olive oil from that shop in Alfama.').waitFor();
      await kai.T('A travel mug that doesn\'t leak').waitFor();
      const seen = await wordsOn(kai);
      for (const hidden of ['buying for Lena', 'hard to kill', 'ceramics stall', 'Good walking socks', '35 mm film']) mustNotHold("Kai's screen", seen, hidden);
      await kai.shot('secret-santa-kai');
      const forKai = JSON.stringify((await boardOf(santa.id, 'kai')).view);
      for (const hidden of ['hard to kill', 'ceramics stall', 'Good walking socks', '35 mm film']) mustNotHold("what the API hands Kai's phone", forKai, hidden);
      // Each of the five is handed one name, and no two the same; nobody is handed their own.
      const drew = {};
      for (const who of ['nora', 'lea', 'kai', 'lena', 'ana']) {
        const view = (await boardOf(santa.id, who)).view;
        drew[who] = view.yours.person.name;
        if (Object.keys(view).some((key) => /pair|drawn(?!On)|gives|receiv/i.test(key) && key !== 'drawn')) throw new Error(`${who}'s phone is handed more than its own name`);
      }
      if (new Set(Object.values(drew)).size !== 5) throw new Error(`two people drew the same name: ${JSON.stringify(drew)}`);
      if (drew.nora !== 'Lena' || drew.kai !== 'Ana') throw new Error(`the sample draw changed: ${JSON.stringify(drew)}`);
    });

    await step('secret-santa-new', async () => {
      // A new one starts with everyone in the hat and nothing drawn.
      const id = await startFromGallery(/^Secret Santa\. Does work/, null, async () => {
        await T('In Lisbon crew already').waitFor();
      });
      await asNora('PATCH', `/v1/boards/${id}`, { title: `Santa ${tag}` });
      await open(id);
      await R('heading', { name: `Santa ${tag}` }).waitFor({ timeout: 20000 });
      await R('heading', { name: 'Five names in the hat.' }).waitFor();
      await T('When everyone is in, draw the names. Each person sees one name, and nobody sees the list.').waitFor();
      await T('No swap day yet').waitFor();
      await shot('secret-santa-before');
      // The budget and the swap, from More.
      await more().click();
      await R('button', { name: 'Budget and swap day' }).click();
      await L('The most a present should cost').fill('15');
      await R('button', { name: 'Swap day: Choose a day. Change' }).click();
      await R('button', { name: 'Next month' }).click();
      await R('button', { name: /^20 / }).click();
      await L('Where or when, in your words').fill('the walk-through');
      await shot('secret-santa-rules');
      await R('button', { name: 'Save', exact: true }).click();
      await T('Up to €15. When everyone is in, draw the names. Each person sees one name, and nobody sees the list.').waitFor({ timeout: 20000 });
      await T('Swapped at the walk-through').waitFor();
      // Two who can't draw each other.
      await more().click();
      await R('button', { name: "Two who can't draw each other" }).click();
      await page.getByRole('button', { name: 'Lea', exact: true }).first().click();
      await page.getByRole('button', { name: 'Kai', exact: true }).last().click();
      await L('Why (if you like)').fill('They always know');
      await shot('secret-santa-apart');
      await R('button', { name: 'Keep them apart' }).click();
      await R('button', { name: "Lea and Kai can't draw each other. They always know" }).waitFor({ timeout: 20000 });
      // Before the draw a name can be taken out of the hat and put back.
      await R('button', { name: 'Five names in the hat. See who is in it' }).click();
      await T('Everyone here draws one name and is drawn by one person.').waitFor();
      await R('button', { name: 'Take Ana out of the hat' }).click();
      await T('Put someone in').waitFor({ timeout: 20000 });
      await shot('secret-santa-hat-open');
      await R('button', { name: 'Ana', exact: true }).click();
      await R('button', { name: 'Take Ana out of the hat' }).waitFor({ timeout: 20000 });
      await closeSheet(ctx);
      await T('Five names in the hat').waitFor();

      // The draw: Nora is shown one name, and so is everyone else. Nobody draws themselves, and the two kept apart don't draw each other.
      await R('button', { name: 'Draw the names' }).click();
      await R('heading', { name: /^You're buying for (Lea|Kai|Lena|Ana)\.$/ }).waitFor({ timeout: 20000 });
      await shot('secret-santa-drawn');
      const drew = {};
      for (const who of ['nora', 'lea', 'kai', 'lena', 'ana']) drew[who] = (await boardOf(id, who)).view.yours.person.name.toLowerCase();
      if (new Set(Object.values(drew)).size !== 5 || Object.entries(drew).some(([who, name]) => who === name)) throw new Error(`the draw is not one name each: ${JSON.stringify(drew)}`);
      if (drew.lea === 'kai' || drew.kai === 'lea') throw new Error('two people who were kept apart drew each other');
      const name = drew.nora.charAt(0).toUpperCase() + drew.nora.slice(1);
      await R('heading', { name: `You're buying for ${name}.` }).waitFor();
      // Kai's phone shows his name, not hers.
      await open(id, kai);
      const his = drew.kai.charAt(0).toUpperCase() + drew.kai.slice(1);
      await kai.R('heading', { name: `You're buying for ${his}.` }).waitFor({ timeout: 20000 });
      mustNotHold("Kai's screen", await wordsOn(kai), `buying for ${name}`);
      // The draw can be undone while nobody has their present: everyone draws again.
      await more().click();
      await R('button', { name: 'Undo the draw' }).click();
      await R('heading', { name: 'Undo the draw?' }).waitFor();
      await shot('secret-santa-undo');
      await page.getByRole('button', { name: 'Undo the draw' }).last().click();
      await R('heading', { name: 'Five names in the hat.' }).waitFor({ timeout: 20000 });
    });
  }

  // ---------- 19.5 where next? ----------

  async function whereNext() {
    await step('where-next', async () => {
      const vote = await sampleBoard('where_next', 'Where next?');
      await openFromGallery(/^Where next\?\. Does work/, /^Where next\?\. Porto it is/);
      await R('heading', { name: 'Where next?' }).waitFor({ timeout: 20000 });
      // All five voted, so it is closed: each idea with its facts, its part of the votes and who voted for it.
      await T(`${vote.view.when} · 5 of 5 voted`).waitFor();
      await R('button', { name: 'Porto. 4 days · about €310 each. 3 votes, yours too. The winner' }).waitFor();
      await R('button', { name: 'The Soča valley, by bike. 3 days · about €180 each. 1 vote' }).waitFor();
      await R('button', { name: 'Sicily. 6 days · about €520 each. 1 vote' }).waitFor();
      await T('Porto it is').waitFor();
      await T('Make it a trip: a space to plan in now, a shared journey when you leave.').waitFor();
      await R('button', { name: 'Make Porto a trip' }).waitFor();
      await shot('where-next');
      // An idea, pressed: who voted for it.
      await R('button', { name: /^Porto\./ }).click();
      await T('Voted for by Nora, Lea and Ana').waitFor();
      await shot('where-next-idea');
      await closeSheet(ctx);
      // Nothing more can be added to a closed vote, and the + says so.
      await R('button', { name: 'Add an idea' }).click();
      await T('The vote is closed. Start a new one for the next round.').waitFor();
      await R('button', { name: 'OK' }).click();
    });

    let tripId;
    await step('where-next-new', async () => {
      tripId = await startFromGallery(/^Where next\?\. Does work/, null, async () => {
        await L('What is the vote called?').fill(`Trip ${tag}`);
        await L('When would it be? (if you know)').fill('Summer 2027');
      });
      await R('heading', { name: `Trip ${tag}` }).waitFor({ timeout: 20000 });
      await T('Summer 2027', { exact: true }).waitFor();
      await T('No ideas yet').waitFor();
      await shot('where-next-empty');
      // Two ideas, the first with a photo and all its facts.
      await R('button', { name: 'Add an idea' }).last().click();
      await L('Where to', { exact: true }).fill('Madeira');
      await L('Days', { exact: true }).fill('5');
      await L('Roughly, each').fill('420');
      await L('A line about it (if you like)').fill('Levadas and cake');
      const [photos] = await Promise.all([page.waitForEvent('filechooser'), R('button', { name: 'Add a photo' }).click()]);
      await photos.setFiles(path.join(IMG, 'terraces.jpg'));
      await R('button', { name: 'Choose another photo' }).waitFor();
      await shot('where-next-add');
      await R('button', { name: 'Add it to the vote' }).click();
      await R('button', { name: 'Madeira. 5 days · about €420 each' }).waitFor({ timeout: 20000 });
      await R('button', { name: 'Add an idea' }).click();
      await L('Where to', { exact: true }).fill('Bergen');
      await L('Days', { exact: true }).fill('3');
      await R('button', { name: 'Add it to the vote' }).click();
      await R('button', { name: 'Bergen. 3 days' }).waitFor({ timeout: 20000 });
      await T('0 of 5 have voted').waitFor();
      await T('Tap a place to vote. Nobody sees who voted for what until it closes.').waitFor();
      // When the trip would be, from More.
      await more().click();
      await R('button', { name: 'When, and how long to vote' }).click();
      await L('When would it be?').fill('Late summer 2027');
      await R('button', { name: 'Save', exact: true }).click();
      await T('Late summer 2027 · 0 of 5 voted').waitFor({ timeout: 20000 });
      // Nora votes: her own tick is all that is drawn of the vote.
      await R('button', { name: 'Madeira. 5 days · about €420 each' }).click();
      await T('Levadas and cake').waitFor();
      await T('Your one vote. Nobody sees it until the vote closes, and it closes when everyone has voted.').waitFor();
      await shot('where-next-vote');
      await R('button', { name: 'Vote for Madeira' }).click();
      await R('button', { name: 'Madeira. 5 days · about €420 each. Your vote' }).waitFor({ timeout: 20000 });
      await T('1 of 5 have voted').waitFor();
      await T('Nobody sees who voted for what until it closes. Waiting for Lea, Kai, Lena and Ana.').waitFor();
      if (await votesBars(ctx)) throw new Error('an open vote draws how the votes stand');
      await shot('where-next-open');
    });

    await step('where-next-two-people', async () => {
      // Kai sees that one of five has voted, and not for what: not on his screen, not in what his phone is handed.
      await open(tripId, kai);
      await kai.R('heading', { name: `Trip ${tag}` }).waitFor({ timeout: 20000 });
      await kai.T('1 of 5 have voted').waitFor();
      await kai.R('button', { name: 'Madeira. 5 days · about €420 each' }).waitFor();
      const seen = await wordsOn(kai);
      for (const hidden of ['Your vote', '1 vote', 'yours too', 'it is']) mustNotHold("Kai's screen", seen, hidden);
      if (await votesBars(kai)) throw new Error("Kai's screen draws how the votes stand before the vote closed");
      await kai.shot('where-next-kai');
      const forKai = (await boardOf(tripId, 'kai')).view;
      if (forKai.ideas.some((idea) => idea.votes !== null || idea.percent !== null || idea.voters.length || idea.yours || idea.winner) || forKai.winnerId !== null) throw new Error('the API hands an open vote\'s counts to someone else\'s phone');
      // He votes for the other one, on his phone.
      await kai.R('button', { name: 'Bergen. 3 days' }).click();
      await kai.T('Added by Nora').waitFor();
      await kai.R('button', { name: 'Vote for Bergen' }).click();
      await kai.R('button', { name: 'Bergen. 3 days. Your vote' }).waitFor({ timeout: 20000 });
      // Nora sees that two have voted, and still not for what.
      await open(tripId);
      await T('2 of 5 have voted').waitFor({ timeout: 20000 });
      await T('Nobody sees who voted for what until it closes. Waiting for Lea, Lena and Ana.').waitFor();
      const forNora = (await boardOf(tripId)).view;
      if (forNora.ideas.some((idea) => idea.votes !== null || idea.voters.length)) throw new Error('the API hands an open vote\'s counts to Nora\'s phone');
      // A vote can be moved, and taken back.
      await R('button', { name: 'Bergen. 3 days' }).click();
      await T('Your vote moves here from the place you chose before.').waitFor();
      await R('button', { name: 'Vote for Bergen' }).click();
      await R('button', { name: 'Bergen. 3 days. Your vote' }).waitFor({ timeout: 20000 });
      await R('button', { name: 'Bergen. 3 days. Your vote' }).click();
      await R('button', { name: 'Take my vote back' }).click();
      await T('1 of 5 have voted').waitFor({ timeout: 20000 });
      await R('button', { name: 'Madeira. 5 days · about €420 each' }).click();
      await R('button', { name: 'Vote for Madeira' }).click();
      await R('button', { name: 'Madeira. 5 days · about €420 each. Your vote' }).waitFor({ timeout: 20000 });
    });

    await step('where-next-closed', async () => {
      // The vote is closed early, from More, after being asked: one vote each, so the idea added first wins.
      await more().click();
      await R('button', { name: /^Close the vote now/ }).click();
      await R('heading', { name: 'Close the vote now?' }).waitFor();
      await shot('where-next-close');
      await R('button', { name: 'Close the vote', exact: true }).click();
      await T('Madeira it is').waitFor({ timeout: 20000 });
      await T('It tied, and won by being added first. Make it a trip: a space to plan in now, a shared journey when you leave.').waitFor();
      // Now everyone sees who voted for what: Nora on hers, Kai on his.
      await R('button', { name: 'Madeira. 5 days · about €420 each. 1 vote, yours too. The winner' }).waitFor();
      await R('button', { name: 'Bergen. 3 days. 1 vote' }).waitFor();
      await shot('where-next-closed');
      await open(tripId, kai);
      await kai.T('Madeira it is').waitFor({ timeout: 20000 });
      await kai.R('button', { name: 'Bergen. 3 days. 1 vote, yours too' }).waitFor();
      await kai.R('button', { name: 'Bergen. 3 days. 1 vote, yours too' }).click();
      await kai.T('Voted for by Kai').waitFor();
      await closeSheet(kai);
      // The winner becomes a trip: a folder in Notes with a page of the facts, and the way to it.
      await R('button', { name: 'Make Madeira a trip' }).click();
      await T('It has a space of its own under Trips, with a page of the facts to plan from.').waitFor({ timeout: 20000 });
      await shot('where-next-trip');
      const folder = (await boardOf(tripId)).view.tripFolderId;
      const inside = (await asNora('GET', `/v1/folders/${folder}/items`)).items.map((item) => item.thing ?? item);
      if (!inside.some((thing) => thing.title === 'Madeira: the plan')) throw new Error('the trip has no page of the facts');
      await R('button', { name: 'Open it' }).click();
      await page.waitForURL(new RegExp(`/folder/${folder}`));
      await R('heading', { name: 'Madeira' }).waitFor({ timeout: 20000 });
      await shot('where-next-folder');
      // What it made is this run's alone: it is taken away again.
      for (const thing of inside) await asNora('DELETE', `/v1/things/${thing.id}`);
      await asNora('DELETE', `/v1/things/${folder}`);
    });
  }

  // ---------- 19.6 the dictionary ----------

  async function dictionary() {
    let wordsId;
    await step('dictionary', async () => {
      // What an earlier run wrote down is taken out first.
      const sample = await sampleBoard('dictionary', 'The dictionary');
      wordsId = sample.id;
      for (const word of (await asNora('GET', `/v1/boards/${sample.id}/entries?kind=word&q=walk-through&limit=50`)).items) await asNora('DELETE', `/v1/board-entries/${word.id}`);

      await openFromGallery(/^The dictionary\. Does work/, /^The dictionary\. 31 words/);
      await R('heading', { name: 'The dictionary' }).waitFor({ timeout: 20000 });
      await T('31 words').waitFor();
      await R('button', { name: /^Seen by: Lisbon crew/ }).waitFor();
      // Each word with what kind it is, what it means, and where it came from.
      await T(/^doing a Kai\s+verb$/).waitFor();
      await T('Reaching the gate as it closes, with a pastry.').waitFor();
      await T(/^First recorded at Lisbon airport, \d+ \w+ \d{4}, by Lea$/).waitFor();
      await T(/^the Ramiro incident\s+noun$/).waitFor();
      await T('Ana · see also: “just one more plate”').waitFor();
      await T(/^second breakfast\s+noun$/).waitFor();
      await T('You · every trip since 2019').waitFor();
      await L('A new word, and what it means').waitFor();
      await shot('dictionary');
      // A word, pressed: its photo and when it was written down.
      await R('button', { name: /^doing a Kai, verb\./ }).click();
      await T(/written down (yesterday|\d+ days ago|\d+ \w+)$/).waitFor();
      await shot('dictionary-word');
      await closeSheet(ctx);
    });

    await step('dictionary-search', async () => {
      // More holds the search: it looks through every word and meaning, not only the newest.
      await more().click();
      await R('button', { name: 'Search the words' }).click();
      await L('Search the words').fill('plate');
      await T(/^just one more plate\s+noun$/).waitFor({ timeout: 20000 });
      await T(/^the Ramiro incident\s+noun$/).waitFor();
      await T(/^doing a Kai\s+verb$/).waitFor({ state: 'detached' });
      await shot('dictionary-search');
      await L('Search the words').fill('nothing like this');
      await T('Not in the dictionary').waitFor();
      await R('button', { name: 'Close search' }).last().click();
      await T(/^doing a Kai\s+verb$/).waitFor({ timeout: 20000 });
    });

    await step('dictionary-new-word', async () => {
      // A new word begins in the box: what was typed is taken apart, and the rest is asked.
      await L('A new word, and what it means').fill(`walk-through ${tag}: A word the walk-through made up.`);
      await L('A new word, and what it means').press('Enter');
      await R('heading', { name: 'A new word' }).waitFor();
      if ((await L('The word').inputValue()) !== `walk-through ${tag}` || (await L('What it means').inputValue()) !== 'A word the walk-through made up.') throw new Error('the word and its meaning were not taken apart');
      await R('button', { name: 'verb', exact: true }).click();
      await L('Where it came from (if you know)').fill('the test bench');
      await shot('dictionary-form');
      await R('button', { name: 'Put it in the dictionary' }).click();
      await T(new RegExp(`^walk-through ${tag}\\s+verb$`)).waitFor({ timeout: 20000 });
      await T('You · the test bench').waitFor();
      await T('32 words').waitFor();
      await shot('dictionary-new-word');
      // It is put right, and taken out again.
      await R('button', { name: startsWith(`walk-through ${tag}, verb.`) }).click();
      await R('button', { name: 'Change it' }).click();
      await R('heading', { name: 'Change the word' }).waitFor();
      await L('What it means').fill('A word the walk-through made up, and changed.');
      await R('button', { name: 'Save', exact: true }).click();
      await T('A word the walk-through made up, and changed.').waitFor({ timeout: 20000 });
      await R('button', { name: startsWith(`walk-through ${tag}, verb.`) }).click();
      await R('button', { name: 'Take it out' }).click();
      await T(new RegExp(`^walk-through ${tag}\\s+verb$`)).waitFor({ state: 'detached', timeout: 20000 });
      await T('31 words').waitFor({ timeout: 20000 });
      // Saying a word out loud is the phone's own dictation, and the microphone says so.
      await R('button', { name: 'Say it out loud' }).click();
      await T(/^Saying it out loud is the phone's own dictation/).waitFor();
      await R('button', { name: 'OK' }).click();
      // Kai reads the same dictionary: nothing in it is anyone's alone.
      await open(wordsId, kai);
      await kai.T(/^doing a Kai\s+verb$/).waitFor({ timeout: 20000 });
      await kai.T('Nora · every trip since 2019').waitFor();
    });

    await step('dictionary-new', async () => {
      // A new dictionary starts empty, and takes its first word.
      const id = await startFromGallery(/^The dictionary\. Does work/, null);
      await asNora('PATCH', `/v1/boards/${id}`, { title: `Words ${tag}` });
      await open(id);
      await R('heading', { name: `Words ${tag}` }).waitFor({ timeout: 20000 });
      await T('Every crew has words nobody else understands. Write the first one down, with what it means.').waitFor();
      await shot('dictionary-empty');
      await L('A new word, and what it means').fill('first word');
      await L('A new word, and what it means').press('Enter');
      // Only the word was typed: the meaning is asked before it can be put in.
      if ((await R('button', { name: 'Put it in the dictionary' }).getAttribute('aria-disabled')) !== 'true') throw new Error('a word could be put in without its meaning');
      await L('What it means').fill('The one a dictionary starts with.');
      await R('button', { name: 'Put it in the dictionary' }).click();
      await T(/^first word$/).waitFor({ timeout: 20000 });
      await T('1 word', { exact: true }).waitFor();
    });
  }

  // ---------- 19.7 predictions ----------

  async function predictions() {
    let sealedId;
    await step('predictions', async () => {
      // A draft an earlier run left is taken out, so one is still to go: about Kai.
      const sample = await sampleBoard('predictions');
      sealedId = sample.id;
      for (const item of sample.view.items) if (item.mine && item.draft) await asNora('DELETE', `/v1/board-entries/${item.id}`);

      await openFromGallery(/^Predictions\. Does work/, /^Predictions for \d{4}\. 13 sealed/);
      await R('heading', { name: sample.title }).waitFor({ timeout: 20000 });
      await T(/^Sealed until the reunion on 4 October \d{4}$/).waitFor();
      await R('button', { name: /^Seen by: Lisbon crew/ }).waitFor();
      // Who has written how many; Nora's own row last, with what is still to do.
      await R('button', { name: 'Lea has written all four. Sealed' }).waitFor();
      await T('One about each of you').waitFor();
      await R('button', { name: 'Lena has written all four. Sealed' }).waitFor();
      await R('button', { name: 'Ana has written two. Sealed' }).waitFor();
      await R('button', { name: "Kai hasn't started" }).waitFor();
      await R('button', { name: "You've written three. One to go: about Kai. See your own" }).waitFor();
      await R('button', { name: 'Write the last one' }).waitFor();
      await T('Nobody can read any of them before the day. Not even their own, once sealed.').waitFor();
      await shot('predictions');
      // Someone else's are sealed, and pressing their row says so and nothing more.
      await R('button', { name: 'Lea has written all four. Sealed' }).click();
      await T(/^Sealed until 4 October \d{4}\. Nobody can read them before then, Lea included\.$/).waitFor();
      await shot('predictions-sealed');
      await R('button', { name: 'OK' }).click();
      // Her own are envelopes too: who each is about, and not a word of what she wrote.
      await R('button', { name: /^You've written three/ }).click();
      await R('heading', { name: 'Your predictions' }).waitFor();
      await R('button', { name: /^About Lea\. Sealed on / }).waitFor();
      await R('button', { name: /^About Lena\. Sealed on / }).click();
      await T(/It opens on 4 October \d{4}, and nobody can read it before then\. You can still take it out, unread\.$/).waitFor();
      mustNotHold("Nora's screen", await wordsOn(ctx), 'moved three more times');
      await shot('predictions-yours');
      await closeSheet(ctx);
      const forNora = (await boardOf(sealedId)).view.items;
      if (forNora.length !== 13 || forNora.some((item) => item.text !== null)) throw new Error('the API hands a sealed prediction\'s words to a phone');
    });

    await step('predictions-draft', async () => {
      // The last one, kept as a draft first: only its writer sees that it exists.
      const secret = `Late to the reunion, ${tag}.`;
      await R('button', { name: 'Write the last one' }).click();
      await R('heading', { name: 'A prediction' }).waitFor();
      await L('Your prediction about Kai').fill(secret);
      await shot('predictions-write');
      await R('button', { name: 'Keep it as a draft' }).click();
      await R('button', { name: "You've written all four. One is still a draft. See your own" }).waitFor({ timeout: 20000 });
      await R('button', { name: 'Seal your draft' }).waitFor();
      await shot('predictions-draft');

      // Kai, whom it is about, is told nothing of it: for him Nora has still written three.
      await open(sealedId, kai);
      await kai.R('button', { name: 'Nora has written three. Sealed' }).waitFor({ timeout: 20000 });
      await kai.R('button', { name: "You haven't started. Four to go: about Lea, Nora, Lena and Ana. See your own" }).waitFor();
      mustNotHold("Kai's screen", await wordsOn(kai), 'Late to the reunion');
      await kai.shot('predictions-kai');
      const forKai = (await boardOf(sealedId, 'kai')).view;
      mustNotHold("what the API hands Kai's phone", JSON.stringify(forKai), 'Late to the reunion');
      if (forKai.items.length !== 13 || forKai.items.some((item) => item.text !== null || item.draft)) throw new Error("the API hands Kai a draft, or a sealed prediction's words");
      await kai.R('button', { name: 'Nora has written three. Sealed' }).click();
      await kai.T(/Nobody can read them before then, Nora included\.$/).waitFor();
      await kai.R('button', { name: 'OK' }).click();

      // The draft is hers to read and change, and to delete: the sample is as it was.
      await R('button', { name: /^You've written all four/ }).click();
      await R('button', { name: 'About Kai. Draft · only you can see it' }).click();
      await T('A draft. Only you can see it until you seal it.').waitFor();
      if ((await L('Your prediction about Kai').inputValue()) !== secret) throw new Error('the writer can\'t read their own draft');
      await L('Your prediction about Kai').fill(`${secret} Probably.`);
      await R('button', { name: 'Save the draft' }).click();
      await R('button', { name: 'About Kai. Draft · only you can see it' }).click();
      if ((await L('Your prediction about Kai').inputValue()) !== `${secret} Probably.`) throw new Error('the draft was not saved');
      await shot('predictions-draft-open');
      await R('button', { name: 'Delete the draft' }).click();
      await R('button', { name: 'Write one about Kai' }).waitFor({ timeout: 20000 });
      await closeSheet(ctx);
      await R('button', { name: "You've written three. One to go: about Kai. See your own" }).waitFor();
    });

    await step('predictions-new', async () => {
      // A new round asks for the day they open (five years on unless another is chosen) and what day that is.
      const id = await startFromGallery(/^Predictions\. Does work/, null, async () => {
        await R('button', { name: /^The day they open: \d+ \w+ \d{4}\. Change$/ }).waitFor();
        await L('What it is called').fill(`Sealed ${tag}`);
        await L('What day is that? (if you like)').fill('the walk-through');
        await shot('predictions-start');
      });
      await R('heading', { name: `Sealed ${tag}` }).waitFor({ timeout: 20000 });
      await T(/^Sealed until the walk-through on \d+ \w+ \d{4}$/).waitFor();
      await R('button', { name: "Lea hasn't started" }).waitFor();
      await R('button', { name: /^You haven't started\. Four to go: about Lea, Kai, Lena and Ana/ }).waitFor();
      // The first one, about Lena, sealed at once: from then on it is an envelope for its writer too.
      const secret = `Owns a boat called ${tag}.`;
      await R('button', { name: 'Write the first one' }).click();
      await T('Who is it about?').waitFor();
      await R('button', { name: 'Lena', exact: true }).click();
      await L('Your prediction about Lena').fill(secret);
      await R('button', { name: 'Seal it' }).click();
      await R('button', { name: "You've written one. Three to go: about Lea, Kai and Ana. See your own" }).waitFor({ timeout: 20000 });
      await R('button', { name: 'Write the next one' }).waitFor();
      await shot('predictions-new');
      const mine = (await boardOf(id)).view.items;
      if (mine.length !== 1 || mine[0].text !== null || !mine[0].sealed) throw new Error('the API hands a sealed prediction back to its writer');
      await R('button', { name: /^You've written one/ }).click();
      await R('button', { name: /^About Lena\. Sealed on / }).click();
      mustNotHold("Nora's screen", await wordsOn(ctx), 'Owns a boat');
      // Kai sees that Nora has written one, and that is all.
      await open(id, kai);
      await kai.R('button', { name: 'Nora has written one. Sealed' }).waitFor({ timeout: 20000 });
      mustNotHold("Kai's screen", await wordsOn(kai), 'Owns a boat');
      mustNotHold("what the API hands Kai's phone", JSON.stringify((await boardOf(id, 'kai')).view), 'Owns a boat');
      // Its writer can still take it out, unread.
      await R('button', { name: 'Take it out, unread' }).click();
      await T("You haven't written any yet.").waitFor({ timeout: 20000 });
      await closeSheet(ctx);
      await R('button', { name: /^You haven't started/ }).waitFor();
    });
  }

  // ---------- 19.8 the awards ----------

  async function awards() {
    let shelfId;
    await step('awards', async () => {
      const sample = await sampleBoard('awards');
      shelfId = sample.id;
      const year = sample.view.year;
      // A vote an earlier run left on an open award is taken back.
      for (const award of sample.view.awards) if (!award.decided && award.youVoted) await asNora('POST', `/v1/boards/${sample.id}/act`, { verb: 'unvote', body: { awardId: award.id } });

      await openFromGallery(/^The awards\. Does work/, new RegExp(`^The ${year} awards\\. 3 decided`));
      await R('heading', { name: `The ${year} awards` }).waitFor({ timeout: 20000 });
      // The decided ones with who won and what for; the open ones with how many have voted, and no more.
      await R('button', { name: 'Most likely to miss the flight. Decided. Kai · 4 of 5 votes, their own included' }).waitFor();
      await R('button', { name: 'Find of the year. Decided. Lena · the tiled bar in Alfama' }).waitFor();
      await R('button', { name: 'Photo of the year. Decided. Ana · the market at six in the morning' }).waitFor();
      await R('button', { name: 'Worst idea that worked. Voting. 3 of 5 have voted' }).waitFor();
      await R('button', { name: 'Best thing anyone cooked. Voting. 2 of 5 have voted' }).waitFor();
      await T("Opens on New Year's Eve").waitFor();
      await T(`With ${year - 1}, ${year - 2} and ${year - 3} beside it`).waitFor();
      await shot('awards');
      // A decided one, pressed: how many votes each nominee had.
      await R('button', { name: /^Most likely to miss the flight/ }).click();
      await T('Decided · 5 votes').waitFor();
      await L('Kai. 4 votes. Won').waitFor();
      await L('Lea. the Porto bus. 1 vote').waitFor();
      await shot('awards-decided');
      await closeSheet(ctx);
    });

    await step('awards-vote', async () => {
      // Nora's one vote for an open award; pressed again, it is taken back.
      await R('button', { name: 'Worst idea that worked. Voting. 3 of 5 have voted' }).click();
      await T('Voting · 3 of 5 have voted').waitFor();
      await T('Your one vote for this award. Nobody sees who voted for whom, and the result shows when everyone has voted.').waitFor();
      await R('radio', { name: 'Vote for Kai. booking the 6 a.m. flight', checked: false }).waitFor();
      await shot('awards-vote');
      await R('radio', { name: 'Vote for Kai. booking the 6 a.m. flight' }).click();
      await R('radio', { name: 'Vote for Kai. booking the 6 a.m. flight', checked: true }).waitFor({ timeout: 20000 });
      await T('Voting · 4 of 5 have voted').waitFor();
      if (await showsVotes(ctx)) throw new Error("Nora's screen shows how an open award's votes stand");
      await closeSheet(ctx);
      await R('button', { name: 'Worst idea that worked. Voting. 4 of 5 have voted' }).waitFor();
      await T('Voted', { exact: true }).waitFor();
      await shot('awards-voted');

      // Kai sees that four have voted, and his own vote: not Nora's, and not how the votes stand.
      await open(shelfId, kai);
      await kai.R('button', { name: 'Worst idea that worked. Voting. 4 of 5 have voted' }).click();
      await kai.R('radio', { name: 'Vote for yourself. booking the 6 a.m. flight' }).waitFor();
      if (await showsVotes(kai)) throw new Error("Kai's screen shows how an open award's votes stand");
      await kai.shot('awards-kai');
      await closeSheet(kai);
      const forKai = (await boardOf(shelfId, 'kai')).view.awards.find((award) => award.name === 'Worst idea that worked');
      if (forKai.totalVotes !== null || forKai.nominees.some((nominee) => nominee.votes !== null || nominee.winner)) throw new Error("the API hands an open award's votes to a phone");

      await R('button', { name: 'Worst idea that worked. Voting. 4 of 5 have voted' }).click();
      await R('radio', { name: 'Vote for Kai. booking the 6 a.m. flight', checked: true }).click();
      await T('Voting · 3 of 5 have voted').waitFor({ timeout: 20000 });
      await closeSheet(ctx);
      await R('button', { name: 'Worst idea that worked. Voting. 3 of 5 have voted' }).waitFor();
    });

    await step('awards-past', async () => {
      // Every year stays on the shelf: an earlier one is read in place, and back.
      const year = (await boardOf(shelfId)).view.year;
      await R('button', { name: 'Past years' }).click();
      await T('Every year stays on the shelf.').waitFor();
      await R('button', { name: `The ${year - 1} awards` }).click();
      await R('heading', { name: `The ${year - 1} awards` }).waitFor({ timeout: 20000 });
      await R('button', { name: /^Best wrong turn\. Decided\. Lena · 4 of 4 votes, their own included$/ }).waitFor({ timeout: 20000 });
      await R('button', { name: /^Most improved packer\. Decided\. You · 4 of 4 votes, your own included$/ }).waitFor();
      await T('Decided, and on the shelf').waitFor();
      await shot('awards-past');
      await R('button', { name: `Back to ${year}` }).click();
      await R('button', { name: /^Most likely to miss the flight/ }).waitFor({ timeout: 20000 });
    });

    await step('awards-new', async () => {
      // A new shelf starts empty. An award is a category the crew invents, with a picture of its own.
      const id = await startFromGallery(/^The awards\. Does work/, null);
      await asNora('PATCH', `/v1/boards/${id}`, { title: `Shelf ${tag}` });
      await open(id);
      await R('heading', { name: `Shelf ${tag}` }).waitFor({ timeout: 20000 });
      await T('No awards yet').waitFor();
      await T('Whatever is still open is decided then').waitFor();
      await shot('awards-empty');
      // There is no earlier year yet, and the button says so.
      await R('button', { name: 'Past years' }).click();
      await T('This is the first year on the shelf. Next year it stands here.').waitFor();
      await R('button', { name: 'OK' }).click();
      await R('button', { name: 'Add an award' }).first().click();
      await L('What is it for?').fill('Best walk-through');
      await R('radio', { name: 'Star' }).click();
      await shot('awards-add');
      await R('button', { name: 'Add the award' }).click();
      await R('button', { name: 'Best walk-through. Voting. 0 of 5 have voted' }).waitFor({ timeout: 20000 });
      // Two are nominated, and Nora votes.
      await R('button', { name: 'Best walk-through. Voting. 0 of 5 have voted' }).click();
      await T('Nobody is nominated yet.').waitFor();
      await R('button', { name: 'Nominate someone' }).click();
      await R('button', { name: 'Lea', exact: true }).click();
      await L('What for? (if you like)').fill('reading every step');
      await shot('awards-nominate');
      await R('button', { name: 'Nominate', exact: true }).click();
      await R('radio', { name: 'Vote for Lea. reading every step' }).waitFor({ timeout: 20000 });
      await R('button', { name: 'Nominate someone' }).click();
      await R('button', { name: 'Kai', exact: true }).click();
      await R('button', { name: 'Nominate', exact: true }).click();
      await R('radio', { name: 'Vote for Kai' }).waitFor({ timeout: 20000 });
      await R('radio', { name: 'Vote for Lea. reading every step' }).click();
      await R('radio', { name: 'Vote for Lea. reading every step', checked: true }).waitFor({ timeout: 20000 });
      await closeSheet(ctx);

      // Kai votes for himself on his phone. He sees that two have voted, and not that Nora chose Lea.
      await open(id, kai);
      await kai.R('button', { name: 'Best walk-through. Voting. 1 of 5 have voted' }).click();
      await kai.R('radio', { name: 'Vote for Lea. reading every step', checked: false }).waitFor();
      await kai.R('radio', { name: 'Vote for yourself' }).click();
      await kai.R('radio', { name: 'Vote for yourself', checked: true }).waitFor({ timeout: 20000 });
      await kai.T('Voting · 2 of 5 have voted').waitFor();
      const before = (await boardOf(id, 'kai')).view.awards[0];
      if (before.totalVotes !== null || before.nominees.some((nominee) => nominee.votes !== null)) throw new Error("the API hands an open award's votes to Kai's phone");
      await closeSheet(kai);

      // Decided early, after being asked: one vote each, so both win, and now everyone sees the votes.
      await open(id);
      await R('button', { name: 'Best walk-through. Voting. 2 of 5 have voted' }).click();
      await R('button', { name: 'Decide it now' }).click();
      await T("Decide it now, with the votes there are? It can't be opened again.").waitFor();
      await R('button', { name: 'Yes, decide it' }).click();
      await T('Decided · 2 votes').waitFor({ timeout: 20000 });
      await L('Lea. reading every step. 1 vote. Won').waitFor();
      await L('Kai. 1 vote. Won').waitFor();
      await shot('awards-decided-new');
      await closeSheet(ctx);
      await R('button', { name: 'Best walk-through. Decided. Lea and Kai · tied on 1 vote each' }).waitFor();
      await open(id, kai);
      await kai.R('button', { name: 'Best walk-through. Decided. Lea and You · tied on 1 vote each' }).waitFor({ timeout: 20000 });
    });
  }

  // ---------- 19.9 a goal you walk together ----------

  async function walkTogether() {
    await step('walk-together', async () => {
      // What an earlier run walked or placed is taken out first.
      const sample = await sampleBoard('walk_together', 'Walk to Lisbon');
      for (const walk of sample.view.yours) if (walk.day === today && walk.amount === 3000) await asNora('DELETE', `/v1/board-entries/${walk.id}`);
      for (const stop of sample.view.stops) if (stop.name.startsWith('Walk-through')) await asNora('DELETE', `/v1/board-entries/${stop.id}`);

      await openFromGallery(/^A goal you walk together\. Does work/, /^Walk to Lisbon\. 1,240 of 2,100 km/, 'Fair and fun');
      await R('heading', { name: 'Walk to Lisbon' }).waitFor({ timeout: 20000 });
      // The walk as a line: where it starts and ends, how far the crew has come, and the places along the way.
      await T('Lisbon crew · 2,100 km together').waitFor();
      await L('The walk from Ljubljana to Lisbon: 1,240 km of 2,100 km, 59% of the way').waitFor();
      await T('Start', { exact: true }).waitFor();
      await T('1,240 km', { exact: true }).waitFor();
      for (const place of ['Ljubljana', 'Milan', 'Lyon', 'Madrid']) await T(place, { exact: true }).waitFor();
      // This week for each of the five, the one who walked most first.
      await R('heading', { name: 'This week: 152 km' }).waitFor();
      await L('Lea: 44 km this week, 324 km in all').waitFor();
      await L('Lena: 38 km this week, 288 km in all').waitFor();
      await L('You: 31 km this week, 261 km in all').waitFor();
      await L('Ana: 27 km this week, 227 km in all').waitFor();
      await L('Kai: 12 km this week, 140 km in all').waitFor();
      await shot('walk-together');
    });

    await step('walk-together-add', async () => {
      // What Nora walked today is one number; the week, the total and the marker move with it.
      await R('button', { name: 'Add what you walked' }).click();
      await T('Only a number. Nothing is read from the phone, and no route is kept.').waitFor();
      await T('Your walks of the last month').waitFor();
      await L('Kilometres', { exact: true }).fill('3');
      await shot('walk-together-add');
      await R('button', { name: 'Add it', exact: true }).click();
      await R('heading', { name: 'This week: 155 km' }).waitFor({ timeout: 20000 });
      await T('1,243 km', { exact: true }).waitFor();
      await L('You: 34 km this week, 264 km in all').waitFor();
      await shot('walk-together-added');
      // Kai sees the same total on his phone, with his own row called "You".
      const walk = await sampleBoard('walk_together', 'Walk to Lisbon');
      await open(walk.id, kai);
      await kai.R('heading', { name: 'This week: 155 km' }).waitFor({ timeout: 20000 });
      await kai.L('Nora: 34 km this week, 264 km in all').waitFor();
      await kai.L('You: 12 km this week, 140 km in all').waitFor();
      // A number that was wrong is taken out again, from her own walks.
      await R('button', { name: 'Add what you walked' }).click();
      await R('button', { name: /^Take out 3 km on / }).click();
      await R('heading', { name: 'This week: 152 km' }).waitFor({ timeout: 20000 });
      await closeSheet(ctx);
      await T('1,240 km', { exact: true }).waitFor();
      // A place along the way is added from More, marked on the line, and taken off again.
      await more().click();
      await R('button', { name: 'Places along the way' }).click();
      await T('490 km · reached').waitFor();
      await L('The place', { exact: true }).fill('Walk-through');
      await L('How many kilometres from the start').fill('1900');
      await R('button', { name: 'Add the place' }).click();
      await R('button', { name: 'Take Walk-through off the way' }).waitFor({ timeout: 20000 });
      await shot('walk-together-places');
      await closeSheet(ctx);
      await T('Walk-through', { exact: true }).waitFor();
      await shot('walk-together-place');
      await more().click();
      await R('button', { name: 'Places along the way' }).click();
      await R('button', { name: 'Take Walk-through off the way' }).click();
      await R('button', { name: 'Take Walk-through off the way' }).waitFor({ state: 'detached', timeout: 20000 });
      await closeSheet(ctx);
      // More holds what every board has, in the map's own bar.
      await more().click();
      await R('button', { name: /^Who can see this/ }).waitFor();
      await R('button', { name: 'Your walks of the last month' }).waitFor();
      await closeSheet(ctx);
    });

    await step('walk-together-new', async () => {
      // A new walk asks where from and to, what is counted, and how far it is: Start waits for the distance.
      await startFromGallery(/^A goal you walk together\. Does work/, 'Fair and fun', async () => {
        await L('From', { exact: true }).fill('Here');
        await L('To', { exact: true }).fill('There');
        if ((await R('button', { name: 'Start another' }).getAttribute('aria-disabled')) !== 'true') throw new Error('a walk could be started without how far it is');
        await L('How far is it, in kilometres?').fill('10');
        await shot('walk-together-start');
      });
      await R('heading', { name: 'Walk to There' }).waitFor({ timeout: 20000 });
      await T('Lisbon crew · 10 km together').waitFor();
      await T('0 km', { exact: true }).first().waitFor();
      await R('heading', { name: 'This week: 0 km' }).waitFor();
      await shot('walk-together-new');
      // Yesterday's walk, with a half in it; then the rest, and the crew has arrived.
      const yesterday = addDays(today, -1);
      await R('button', { name: 'Add what you walked' }).click();
      await L('Kilometres', { exact: true }).fill('4,5');
      await R('button', { name: 'Which day: Today. Change' }).click();
      // (On the first of a month yesterday is a page back in the calendar.)
      if (dateOf(today).getDate() === 1) await R('button', { name: 'Previous month' }).click();
      await R('button', { name: startsWith(`${dateOf(yesterday).getDate()} ${MONTHS[dateOf(yesterday).getMonth()]} `) }).click();
      await R('button', { name: 'Which day: Yesterday. Change' }).or(R('button', { name: `Which day: ${shortDay(yesterday)}. Change` })).first().waitFor();
      await R('button', { name: 'Add it', exact: true }).click();
      await T('4.5 km', { exact: true }).first().waitFor({ timeout: 20000 });
      await R('button', { name: 'Add what you walked' }).click();
      await L('Kilometres', { exact: true }).fill('5.5');
      await R('button', { name: 'Add it', exact: true }).click();
      await T('You made it').waitFor({ timeout: 20000 });
      await shot('walk-together-reached');
      await R('button', { name: 'Back', exact: true }).click();
    });
  }
};
