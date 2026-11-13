// Milestone 10, with Journey, as two people where something stays private. Nora, with the sample data:
// "Your apps" from holding the You tab and from the row on You; Journey on Today (someone away with a heart
// that stays at home, On this day, and a goodnight that waits for bedtime, on a phone whose clock is set)
// and the settings behind them; a goodnight, loved, played and answered with a picked video; keeping a
// journey from the link Journey's recap would open, with its progress; the book it became, the list of kept
// journeys, and a page that is no book; telling a moment as a journey: the draft, changed, the screen that
// stands before it leaves home, and sending it; a trip start to finish, and a folder that is made a trip
// and becomes a journey; and the Library's ways into all of it. Sam, a second new person who joins her
// circle, can't open Nora's draft. What the privacy screen leaves out is counted in what arrives in Journey.
// What the walk makes it takes away again, except what was sent to the stand-in for Journey: that is the point.
const path = require('path');
const { VIEWPORT } = require('../lib');

/** A sheet is closed by pressing the dimmed page above it. */
const ABOVE_THE_SHEET = { x: 195, y: 40 };
/** The clip a browser picks where a phone would record one. */
const CLIP = path.join(__dirname, '../../../apps/api/src/main/resources/seed/clip.mp4');
const newId = () => require('crypto').randomUUID();

exports.run = async function run(ctx) {
  const { page, T, R, L, shot, step, tag, WEB_URL, CODE } = ctx;
  /** A sheet slides up with the dimmed page above it: once it has arrived, pressing there closes it. */
  const closeSheet = async (on = page) => {
    await on.waitForTimeout(500);
    await on.mouse.click(ABOVE_THE_SHEET.x, ABOVE_THE_SHEET.y);
    await on.waitForTimeout(500);
  };

  // Nora's token for the API: to find the sample things by name, and to tidy up after the walk.
  const nora = (await ctx.api(null, 'POST', '/local-auth/token', { email: 'nora@example.com', code: CODE })).accessToken;
  const linds = (await ctx.api(nora, 'GET', '/v1/circles')).find((circle) => circle.name === 'The Linds');
  const iceland = (await ctx.api(nora, 'GET', '/v1/journey/journeys')).items.find((journey) => journey.title === 'Iceland ring road');
  const icelandKept = (await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/journey/kept`)).items.find((kept) => kept.title === 'Iceland ring road');
  const trips = (await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/notes`)).spaces.find((space) => space.title === 'Trips');
  const norway = (await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/trips`)).find((trip) => trip.title === 'Norway 2027');
  const goodnights = async () => (await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/goodnights`)).items;
  const fromAlex = (await goodnights()).find((night) => !night.replyTo && night.from && night.from.name === 'Alex');
  if (!iceland || !icelandKept || !trips || !norway || !fromAlex) throw new Error('the sample data for Journey is not there: start the API on a fresh database');
  const gone = (id) => ctx.api(nora, 'DELETE', `/v1/things/${id}`).catch(() => undefined);

  /** Takes away what a walk made or changed: folders it made into trips, goodnights sent back, Nora's own hearts, and the home settings. */
  const tidy = async () => {
    for (const folder of (await ctx.api(nora, 'GET', `/v1/folders/${trips.id}/items?limit=100`)).items) if (/^Piran weekend [a-z0-9]{5}$/.test(folder.title)) await gone(folder.id);
    for (const night of await goodnights()) if (night.replyTo && night.mine) await gone(night.id);
    await ctx.api(nora, 'DELETE', `/v1/goodnights/${fromAlex.id}/love`).catch(() => undefined);
    const away = (await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/journey/at-home?day=${fromAlex.forDay}`)).away[0];
    if (away) await ctx.api(nora, 'DELETE', `/v1/circles/${linds.id}/journey/entries/${away.latest.entryId}/love`).catch(() => undefined);
    await ctx.api(nora, 'PUT', `/v1/circles/${linds.id}/journey/settings`, { homeLat: home.homeLat, homeLng: home.homeLng, bedtime: home.bedtime, timeZone: home.timeZone });
  };
  const home = await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/journey/settings`);
  await tidy();

  await ctx.signIn('nora@example.com');
  let sam = null;
  let evening = null;
  try {
    await step('app-switch', async () => {
      // Holding the You tab offers the other app, already signed in.
      await R('tab', { name: 'You' }).click({ delay: 800 });
      await R('heading', { name: 'Your apps' }).waitFor();
      await T('Signed in as Nora Lind in both.').waitFor();
      await L('Homeport. What you keep · The Linds. You are here').waitFor();
      await T('What you tell · 58 following').waitFor();
      for (const fact of ['Journey photos keep their originals', 'Your people carry over', 'Invite Alex to a journey in one tap', 'One Sunday summary']) await T(fact).waitFor();
      await shot('app-switch');
      // Opening the other app needs both on a phone: in a browser it says so.
      await R('button', { name: 'Journey. What you tell · 58 following. Open' }).click();
      await T('Journey opens from here when both apps are on your phone. A browser has no app to hop to.').waitFor();
      await shot('app-switch-in-a-browser');
      await closeSheet();
      // The same sheet from You: the swap button, and the row that says what the account has in Journey.
      await R('tab', { name: 'You' }).click();
      await T('One account with Journey').waitFor();
      await T(/^\d+ journeys · 58 following$/).waitFor();
      await shot('you-with-journey');
      await R('button', { name: /^One account with Journey\. \d+ journeys · 58 following$/ }).click();
      await R('heading', { name: 'Your apps' }).waitFor();
      await closeSheet();
      await R('button', { name: 'Switch to Journey' }).click();
      await R('heading', { name: 'Your apps' }).waitFor();
      await closeSheet();
      await R('tab', { name: 'Home' }).click();
    });

    await step('on-journey', async () => {
      // A second phone of Nora's whose clock is set: the day the sample goodnight is for, first at midday, then after bedtime.
      const at = (time) => new Date(`${fromAlex.forDay}T${time}:00`);
      const context = await ctx.browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: ctx.scheme });
      evening = await context.newPage();
      evening.on('pageerror', (e) => ctx.errors.push('pageerror: ' + e.message));
      evening.on('response', (r) => {
        if (r.status() >= 400 && r.url().startsWith(ctx.API_URL)) ctx.errors.push(`http ${r.status()} ${r.request().method()} ${r.url()}`);
      });
      await evening.clock.install({ time: at('12:00') });
      const eT = (...a) => evening.getByText(...a).last();
      const eR = (...a) => evening.getByRole(...a).last();
      const eL = (...a) => evening.getByLabel(...a).last();
      await evening.goto(WEB_URL + '/');
      await eT('Get started').waitFor({ timeout: 30000 });
      await eR('button', { name: 'I already have an account' }).click();
      await eR('button', { name: 'Continue with email' }).click();
      await eL('Email', { exact: true }).fill('nora@example.com');
      await eR('button', { name: 'Send code' }).click();
      await eT('Check your email').waitFor();
      await eL('6-digit code').fill(CODE);
      await evening.getByRole('tab', { name: 'Home' }).last().waitFor({ timeout: 20000 });

      // At midday: Alex is away and posting, a day from a kept journey comes back, and the goodnight is not shown yet.
      await eT('Alex is on a journey').waitFor({ timeout: 20000 });
      await eT('Lofoten by bike · Day 6 of 9').waitFor();
      await eT('2 new', { exact: true }).waitFor();
      await eT('Day 6 · Reine').waitFor();
      await eT('Ferry day, and finally a rest').waitFor();
      await eT('Mia loved it').waitFor();
      await eT('On this day').waitFor();
      await eR('button', { name: 'Sunrise over Bromo. 2 years ago. Day 22 · kept journey' }).waitFor();
      if (await evening.getByText('Goodnight from Alex').count()) throw new Error('the goodnight shows on Today before bedtime');
      await evening.waitForTimeout(900);
      await evening.screenshot({ path: `${ctx.out}/${ctx.scheme}-03a-on-journey-before-bedtime.png` });

      // After bedtime it is waiting, by itself: the clock is looked at again every half minute.
      await evening.clock.setSystemTime(at('20:30'));
      await evening.clock.runFor(31000);
      await eT('Goodnight from Alex').waitFor({ timeout: 20000 });
      await eT('For bedtime at 20:00 · Reine, Norway').waitFor();
      await evening.waitForTimeout(900);
      await evening.screenshot({ path: `${ctx.out}/${ctx.scheme}-03b-on-journey.png` });
      console.log('shot', 'on-journey', evening.url());

      // A heart that stays at home. In a home with children it can be theirs, so the sheet asks whose.
      await eR('button', { name: 'Mia loved it. Change' }).click();
      await eR('heading', { name: 'A heart from' }).waitFor();
      await eT('It stays at home: Journey is not told.').waitFor();
      await evening.waitForTimeout(900);
      await evening.screenshot({ path: `${ctx.out}/${ctx.scheme}-03c-on-journey-hearts.png` });
      await eR('switch', { name: 'You', exact: true }).click();
      await closeSheet(evening);
      await eR('button', { name: 'You and Mia loved it. Change' }).waitFor();
      // The way to it in Journey says why it can't be taken in a browser.
      await eR('button', { name: 'Open in Journey', exact: true }).click();
      await eT('Journey opens from here when both apps are on your phone. A browser has no app to hop to.').waitFor();
      // A day of a kept journey opens its book.
      await eR('button', { name: 'Sunrise over Bromo. 2 years ago. Day 22 · kept journey' }).click();
      await eR('heading', { name: 'Java and Bali by train' }).waitFor({ timeout: 20000 });
      await eT('Kept from Journey').waitFor();
      await evening.goBack();
      // The goodnight's own card opens it.
      await eR('button', { name: 'Play. Goodnight from Alex' }).click();
      await eR('heading', { name: 'Goodnight, you two' }).waitFor({ timeout: 20000 });
      await evening.context().close();
      evening = null;
    });

    await step('journey-at-home', async () => {
      // What stands behind the cards: who is away, where home is, when bedtime is.
      await page.goto(WEB_URL + '/journey/at-home');
      await R('heading', { name: 'Journey at home' }).waitFor({ timeout: 20000 });
      await R('button', { name: 'Alex. Lofoten by bike · Day 6 of 9. Open in Journey' }).waitFor();
      await R('button', { name: 'Bedtime. 20:00. A goodnight waits on Today until then' }).waitFor();
      await R('button', { name: /^Goodnight, you two\. Alex · / }).waitFor();
      await shot('journey-at-home');
      // Bedtime, half an hour earlier.
      await R('button', { name: 'Bedtime. 20:00. A goodnight waits on Today until then' }).click();
      await R('heading', { name: 'When is bedtime?' }).waitFor();
      await shot('journey-bedtime');
      await R('button', { name: '19:30', exact: true }).click();
      await R('button', { name: 'Bedtime. 19:30. A goodnight waits on Today until then' }).waitFor();
      // Where home is: one of the places photos were taken.
      await R('button', { name: /^Where home is\. Set\./ }).click();
      await R('heading', { name: 'Where is home?' }).waitFor();
      await T('Choose one of the places your photos were taken. A photo taken within 150 metres of it counts as taken at home.').waitFor();
      await shot('journey-where-home-is');
      await R('button', { name: /^Lake Bled\. Slovenia · \d+ photos$/ }).click();
      // The sheet closes once it is saved.
      await page.getByRole('heading', { name: 'Where is home?' }).waitFor({ state: 'detached', timeout: 20000 });
      await R('button', { name: /^Where home is\. Set\./ }).waitFor();
      const moved = await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/journey/settings`);
      if (moved.bedtime !== '19:30' || Math.abs(moved.homeLat - home.homeLat) < 0.01) throw new Error('bedtime or where home is was not saved');
      // Forgetting it: then nothing can be told apart as taken at home.
      await R('button', { name: /^Where home is\. Set\./ }).click();
      await R('button', { name: 'Forget where home is' }).click();
      await R('button', { name: /^Where home is\. Not said yet\./ }).waitFor();
      // The clock home keeps: this phone's.
      await R('button', { name: /^The clock home keeps\./ }).click();
      await R('heading', { name: 'The clock home keeps' }).waitFor();
      await R('button', { name: /^Use this phone's clock: / }).click();
      await page.getByRole('heading', { name: 'The clock home keeps' }).waitFor({ state: 'detached', timeout: 20000 });
      await tidy();
    });

    await step('goodnight', async () => {
      await page.goto(`${WEB_URL}/goodnight/${fromAlex.id}`);
      await R('heading', { name: 'Goodnight, you two' }).waitFor({ timeout: 20000 });
      await T('Alex', { exact: true }).waitFor();
      await T('Day 6 · Reine, Norway').waitFor();
      await T('0:48 · tap to play').waitFor();
      await T('Only for The Linds').waitFor();
      await T("Recorded at 19:10 in Reine, Norway, for bedtime at home. It isn't part of the journey other people see.").waitFor();
      await R('button', { name: 'Leo loved it. Change' }).waitFor();
      await shot('goodnight');
      // Playing it opens the clip itself.
      const [clip] = await Promise.all([page.context().waitForEvent('page'), R('button', { name: 'Play the goodnight' }).click()]);
      if (!/\/media\/videos\/.+\.mp4$/.test(clip.url())) throw new Error(`playing the goodnight opened ${clip.url()}`);
      await clip.close();
      // A heart: Leo's is there; Nora adds her own.
      await R('button', { name: 'Leo loved it. Change' }).click();
      await R('heading', { name: 'A heart from' }).waitFor();
      await shot('goodnight-hearts');
      await R('switch', { name: 'You', exact: true }).click();
      await closeSheet();
      await R('button', { name: 'You and Leo loved it. Change' }).waitFor();
      await T('2 loved it', { exact: true }).waitFor();
      // Sending one back. Recording is a phone's work; a browser picks a video file.
      await R('button', { name: 'Send one back' }).click();
      await R('heading', { name: 'Send one back' }).waitFor();
      await T('A short clip for bedtime where they are. It goes to The Linds only, never to Journey.').waitFor();
      await shot('goodnight-send-back');
      await R('button', { name: /^Record one now/ }).click();
      await T('Recording needs the camera of a phone. In a browser, choose a video file instead.').waitFor();
      await R('button', { name: 'Send one back' }).click();
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), R('button', { name: /^Choose a video/ }).click()]);
      await chooser.setFiles(CLIP);
      await T('Sent. It waits for them at home.').waitFor({ timeout: 30000 });
      await R('button', { name: '1 sent back' }).waitFor();
      await shot('goodnight-sent-back');
      // The one that was sent: it answers Alex's, and its sender can delete it.
      await R('button', { name: '1 sent back' }).click();
      await R('heading', { name: 'Goodnight, Alex' }).waitFor({ timeout: 20000 });
      await R('button', { name: 'It answers another goodnight' }).waitFor();
      await T('Only for The Linds').waitFor();
      await shot('goodnight-back');
      const sent = (await goodnights()).find((night) => night.replyTo === fromAlex.id && night.mine);
      if (!sent || sent.chip.audience !== 'circle') throw new Error('the goodnight that was sent back is not there, or not for the circle');
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Delete this goodnight' }).click();
      await R('heading', { name: 'Delete this goodnight?' }).waitFor();
      await R('button', { name: 'Delete it' }).click();
      await R('heading', { name: 'Goodnight, you two' }).waitFor({ timeout: 20000 });
    });

    await step('keep-options', async () => {
      // The list of your own journeys, to choose one to bring home.
      await page.goto(WEB_URL + '/journey/keep');
      await R('heading', { name: 'Keep a journey' }).waitFor({ timeout: 20000 });
      await T('These are sample journeys: this Homeport runs with a stand-in for Journey.').waitFor();
      await R('button', { name: 'Iceland ring road. 14 days · 62 entries. Finished. Kept' }).waitFor();
      await T('Keep every journey I finish').waitFor();
      await shot('keep-list');
      // The link "Keep in Homeport" on Journey's recap opens: it lands on what to keep, for that journey.
      await page.goto(`${WEB_URL}/keep?journey=${iceland.id}`);
      await R('heading', { name: 'Keep this journey' }).waitFor({ timeout: 20000 });
      if (!page.url().includes(`/journey/keep/${iceland.id}`)) throw new Error(`the keep link landed on ${page.url()}`);
      await T('Iceland ring road').waitFor();
      await T('14 days · 62 entries · with Alex').waitFor();
      await T(/^214 photos, 9 clips · \d+ already in your Library$/).waitFor();
      for (const [name, on] of [['The story, as a book', 'true'], ['The originals', 'true'], ['The route', 'true'], ['Comments and likes', 'false']]) {
        if ((await R('switch', { name, exact: true }).getAttribute('aria-checked')) !== on) throw new Error(`"${name}" does not start ${on === 'true' ? 'on' : 'off'}`);
      }
      await R('button', { name: 'Seen by The Linds. Change' }).waitFor();
      await shot('keep-options');
      // A switch turns; where it is kept is one of the circle's spaces.
      await R('switch', { name: 'The route', exact: true }).click();
      if ((await R('switch', { name: 'The route', exact: true }).getAttribute('aria-checked')) !== 'false') throw new Error('the route switch did not turn off');
      await R('switch', { name: 'The route', exact: true }).click();
      await R('button', { name: 'Keep it in: Trips. Change' }).click();
      await R('heading', { name: 'Keep it in' }).waitFor();
      await shot('keep-in');
      await R('button', { name: 'Trips', exact: true }).click();
      await R('button', { name: 'Keep it in: Trips. Change' }).waitFor();
      // It was kept before, so keeping it brings home what is new. It says how far it is, then what came home.
      await T('You kept this journey before. Keeping it again brings home what was added since.').waitFor();
      await R('button', { name: 'Bring home what is new' }).click();
      await T('Bringing it home').waitFor();
      await R('heading', { name: "It's home" }).waitFor({ timeout: 60000 });
      await R('button', { name: 'Open the book' }).waitFor({ timeout: 20000 });
      await shot('keep-done');
      await R('button', { name: 'Open the book' }).click();
      await R('heading', { name: 'Iceland ring road' }).waitFor({ timeout: 20000 });
    });

    await step('journey-book', async () => {
      // The page a kept journey became, laid out by itself.
      await T('Kept from Journey').waitFor();
      await T('A journey by Nora and Alex').waitFor();
      for (const number of ['14 days', '62 entries', '214 photos']) await L(number, { exact: true }).waitFor();
      await R('heading', { name: 'Day 1', exact: true }).waitFor();
      await T('Reykjavík · Wed 1 Apr').waitFor();
      await T('Picked up the van, got lost twice before leaving the car park, and ate hot dogs by the harbour in the rain.').waitFor();
      await T('+4', { exact: true }).waitFor();
      await T('Still live in Journey').waitFor();
      await T('Public · 58 people followed it').waitFor();
      await shot('journey-book');
      // Where it is still live opens in Journey, on a phone.
      await R('button', { name: 'Open in Journey' }).click();
      await T('Journey opens from here when both apps are on your phone. A browser has no app to hop to.').waitFor();
      // Who can see it: the one sheet every thing has.
      await R('button', { name: 'Who can see it' }).click();
      await R('heading', { name: 'Who can see this?' }).waitFor();
      await closeSheet();
      // A photo leads to the album the rest are in.
      await R('button', { name: '4 more in the album' }).click();
      await R('heading', { name: 'Iceland ring road' }).waitFor({ timeout: 20000 });
      await page.waitForURL(/\/album\//);
      await page.goBack();
      await T('Kept from Journey').waitFor({ timeout: 20000 });
      // The same page, the way Notes shows it: to write in it.
      await R('button', { name: 'More', exact: true }).click();
      await shot('journey-book-menu');
      await R('button', { name: /^Open as a page in Notes/ }).click();
      await L('Title', { exact: true }).waitFor({ timeout: 20000 });
      await T('Day 1 · Reykjavík · Wed 1 Apr 2026').waitFor();
      await shot('journey-book-as-a-page');
      await page.goBack();
      await T('Kept from Journey').waitFor({ timeout: 20000 });
      // The journeys kept in the circle.
      await page.goto(WEB_URL + '/journey/kept');
      await R('heading', { name: 'Kept from Journey' }).waitFor({ timeout: 20000 });
      await R('button', { name: /^Iceland ring road\. A journey by Nora and Alex\. \d+ photos · kept / }).waitFor();
      await R('button', { name: /^Java and Bali by train\. A journey by Nora\./ }).waitFor();
      await shot('kept-journeys');
      await R('button', { name: /^Java and Bali by train\. A journey by Nora\./ }).click();
      await R('heading', { name: 'Java and Bali by train' }).waitFor({ timeout: 20000 });
      await T('Kept from Journey').waitFor();
    });

    await step('tell-journey', async () => {
      // From a moment in the Library: the app drafts a journey, sorted into days. Nothing is posted.
      await page.goto(WEB_URL + '/?place=library');
      await R('button', { name: /^Saturday at Lake Bled\./ }).click();
      await R('heading', { name: 'Saturday at Lake Bled' }).waitFor({ timeout: 20000 });
      await R('button', { name: 'Journey', exact: true }).click();
      await R('heading', { name: 'Tell it as a journey' }).waitFor({ timeout: 20000 });
      await page.waitForURL(/\/journey\/tell\/[0-9a-f-]{36}$/, { timeout: 20000 });
      await T('Saturday at Lake Bled', { exact: true }).waitFor();
      await T('Sorted into 1 day').waitFor();
      await T('Move anything between days, or drop it. This is still a draft.').waitFor();
      await R('button', { name: 'Day 1. Sat 7 Nov · Saturday at Lake Bled · 48 photos, 3 clips. Change' }).waitFor();
      await T('+47', { exact: true }).waitFor();
      await shot('tell-journey');
      // Its title, changed.
      await L('Title', { exact: true }).fill(`A weekend at Lake Bled ${tag}`);
      await L('Title', { exact: true }).press('Enter');
      // A day: its first line, and a photo left out and put back.
      await R('button', { name: 'Day 1. Sat 7 Nov · Saturday at Lake Bled · 48 photos, 3 clips. Change' }).click();
      await R('heading', { name: 'Day 1', exact: true }).waitFor();
      await L('What the day was', { exact: true }).fill('on the water');
      await L('What the day was', { exact: true }).press('Enter');
      await page.getByRole('button', { name: 'Photo', exact: true }).first().click();
      await shot('tell-day');
      await R('button', { name: 'Leave it out' }).click();
      await R('button', { name: 'Photo, left out' }).waitFor();
      await closeSheet();
      await R('button', { name: 'Day 1. Sat 7 Nov · on the water · 47 photos, 3 clips. Change' }).waitFor();
      await R('button', { name: 'Day 1. Sat 7 Nov · on the water · 47 photos, 3 clips. Change' }).click();
      await R('button', { name: 'Photo, left out' }).click();
      await R('button', { name: 'Put it back' }).click();
      await closeSheet();
      await R('button', { name: 'Day 1. Sat 7 Nov · on the water · 48 photos, 3 clips. Change' }).waitFor();
      await shot('tell-journey-changed');
    });

    const draftId = page.url().split('?')[0].split('/').pop();

    await step('a-draft-is-its-writers-alone', async () => {
      // A second new person joins the family, and can't open Nora's draft: not on its screen, not through the API.
      sam = await ctx.second('Sam Road');
      await sam.page.goto(`${WEB_URL}/join/${linds.joinUrl.split('/').pop()}`);
      await sam.R('heading', { name: 'Join The Linds?' }).waitFor({ timeout: 20000 });
      await sam.R('button', { name: 'Join', exact: true }).click();
      await sam.R('button', { name: 'The Linds. Change circle' }).waitFor({ timeout: 20000 });
      ctx.expectNotFound = true;
      await sam.page.goto(`${WEB_URL}/journey/tell/${draftId}`);
      await sam.R('heading', { name: "This isn't available" }).waitFor({ timeout: 20000 });
      await sam.shot('tell-journey-as-sam');
      for (const address of [`/v1/journey/drafts/${draftId}`, `/v1/journey/drafts/${draftId}/check`]) {
        const seen = await ctx.api(sam.token, 'GET', address).then(() => true, () => false);
        if (seen) throw new Error(`Sam could read Nora's draft at ${address}`);
      }
      const sent = await ctx.api(sam.token, 'POST', `/v1/journey/drafts/${draftId}/post`, { clientId: newId() }).then(() => true, () => false);
      if (sent) throw new Error("Sam could send Nora's draft");
      await sam.page.waitForTimeout(400);
      ctx.expectNotFound = false;
      // The goodnight was for the circle, so Sam sees it.
      await sam.page.goto(`${WEB_URL}/goodnight/${fromAlex.id}`);
      await sam.R('heading', { name: 'Goodnight, you two' }).waitFor({ timeout: 20000 });
      // Sam puts the phone away and leaves, so the family is as it was (a trip names its other adults).
      await sam.close();
      sam = null;
    });

    await step('tell-privacy', async () => {
      await R('button', { name: "Next: check what's shown" }).click();
      await R('heading', { name: 'Before it leaves home' }).waitFor({ timeout: 20000 });
      await T('These were private. Here is what a journey would show.').waitFor();
      // The three switches start on; what can never go can't be switched.
      for (const name of [/^Leave out /, 'Show the town, not the spot', 'Skip photos taken at home']) {
        if ((await R('switch', { name }).getAttribute('aria-checked')) !== 'true') throw new Error(`"${name}" does not start on`);
      }
      await T(/^\d+ of 51 are tagged with a child$/).waitFor();
      await T('“Lake Bled”, not the exact spot you stood on').waitFor();
      await T('Never go to Journey').waitFor();
      if ((await R('radio', { name: 'Private' }).getAttribute('aria-checked')) !== 'true') throw new Error('the journey does not start as Private');
      await T('Nothing has left Homeport yet.').waitFor();
      const before = await ctx.api(nora, 'GET', `/v1/journey/drafts/${draftId}/check`);
      if (before.photosGoing + before.clipsGoing >= 51) throw new Error('nothing is left out although the switches are on');
      await R('button', { name: `Create the journey · ${before.photosGoing + before.clipsGoing} in all` }).waitFor();
      await shot('tell-privacy');
      // With the children's switch off, everything would go; on again, they stay.
      await R('switch', { name: /^Leave out / }).click();
      await R('button', { name: 'Create the journey · 51 in all' }).waitFor();
      await R('switch', { name: /^Leave out / }).click();
      await R('button', { name: `Create the journey · ${before.photosGoing + before.clipsGoing} in all` }).waitFor();
      // What it starts as in Journey.
      await R('radio', { name: 'Unlisted' }).click();
      await T('Anyone who has its link can read it. It is not listed anywhere.').waitFor();
      await R('radio', { name: 'Private' }).click();
      await T('Only you can read it there, until you change that in Journey.').waitFor();
      // One by one: a photo a switch left out goes after all, and is left to the switch again.
      await R('button', { name: new RegExp(`^${before.photosGoing} photos, ${before.clipsGoing} clips would go\\.`) }).click();
      await R('heading', { name: 'What goes, one by one' }).waitFor();
      await shot('tell-privacy-one-by-one');
      await page.getByRole('switch', { name: 'Stays home: A child' }).first().click();
      await closeSheet();
      await R('button', { name: `Create the journey · ${before.photosGoing + before.clipsGoing + 1} in all` }).waitFor();
      await R('button', { name: /would go\./ }).click();
      await page.getByRole('switch', { name: 'Stays home: Sent after all' }).or(page.getByRole('switch', { name: 'Goes' })).first().click();
      await closeSheet();
      await R('button', { name: `Create the journey · ${before.photosGoing + before.clipsGoing} in all` }).waitFor();
      // Sending it: how far it is, then that it is there.
      const mineBefore = (await ctx.api(nora, 'GET', '/v1/journey/journeys')).items.length;
      await R('button', { name: `Create the journey · ${before.photosGoing + before.clipsGoing} in all` }).click();
      await R('heading', { name: "It's in Journey" }).waitFor({ timeout: 90000 });
      await T('It starts as Private. Carry on writing it there.').waitFor();
      await shot('tell-sent');
      // What the screen left out never left: Journey holds exactly what was let through, as a private journey.
      const mine = (await ctx.api(nora, 'GET', '/v1/journey/journeys')).items;
      const told = mine.find((journey) => journey.title === `A weekend at Lake Bled ${tag}`);
      if (mine.length !== mineBefore + 1 || !told) throw new Error('the journey did not arrive in Journey');
      if (told.photos !== before.photosGoing || told.clips !== before.clipsGoing || told.visibility !== 'private') throw new Error(`Journey holds ${told.photos} photos and ${told.clips} clips as ${told.visibility}; the screen let ${before.photosGoing} and ${before.clipsGoing} through, as private`);
      await R('button', { name: 'Open in Journey' }).click();
      await T('Journey opens from here when both apps are on your phone. A browser has no app to hop to.').waitFor();
      await R('button', { name: 'Done', exact: true }).click();
      await R('heading', { name: 'Saturday at Lake Bled' }).waitFor({ timeout: 20000 });
    });

    await step('tell-from-a-selection', async () => {
      // From what is picked on the select screen: only that is in the draft. Closing a draft throws it away.
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Select photos' }).click();
      const tiles = page.getByRole('button', { name: /Not selected$/ });
      await tiles.first().waitFor({ timeout: 20000 });
      await tiles.nth(0).click();
      await tiles.nth(0).click();
      await R('heading', { name: '2 selected' }).waitFor();
      await R('button', { name: 'Journey', exact: true }).click();
      await R('heading', { name: 'Tell it as a journey' }).waitFor({ timeout: 20000 });
      await R('button', { name: /^Day 1\. Sat 7 Nov · .* · 2 (photos|clips)|^Day 1\. Sat 7 Nov · .* · 1 photo, 1 clip/ }).waitFor({ timeout: 20000 });
      await shot('tell-from-selection');
      const picked = page.url().split('?')[0].split('/').pop();
      await R('button', { name: 'Close', exact: true }).click();
      await R('heading', { name: 'Throw this draft away?' }).waitFor();
      await shot('tell-leave');
      await R('button', { name: 'Throw it away' }).click();
      await R('heading', { name: '2 selected' }).waitFor({ timeout: 20000 });
      const still = await ctx.api(nora, 'GET', `/v1/journey/drafts/${picked}`).then(() => true, () => false);
      if (still) throw new Error('the draft that was thrown away is still there');
    });

    await step('trip-space', async () => {
      // A folder of Notes that is a trip: one space, three stages.
      await page.goto(WEB_URL + '/?place=notes');
      await R('button', { name: /^Trips\. \d+ folders · \d+ pages?$/ }).click();
      await R('heading', { name: 'Trips' }).waitFor({ timeout: 20000 });
      // A folder opens in place; one that is a trip opens on its own page.
      await R('button', { name: /^Norway 2027/ }).click();
      await T('A trip in Trips').waitFor({ timeout: 20000 });
      await R('heading', { name: 'Norway 2027' }).waitFor();
      for (const stage of ['Plan: now', 'Go: 3 to 17 Apr', 'Keep: after']) await L(stage, { exact: true }).waitFor();
      await T('Getting ready').waitFor();
      for (const row of ['Day by day. 14 days sketched · Bergen to Tromsø', /^Packing, per person\. 22 of 61 /, /^Norway budget\. €2,500 of €7,640/, "Passports. Mia's needs renewing first"]) await R('button', { name: row }).waitFor();
      await T('On 3 April this becomes a journey').waitFor();
      await T('Title, dates, route and Alex as co-author are set up for you. Post from the road; the originals come back here.').waitFor();
      await T('Afterwards: the trip book').waitFor();
      await shot('trip-space');
      // What Journey would be told, and what stays here.
      await R('button', { name: 'See the draft' }).click();
      await R('heading', { name: 'The draft' }).waitFor();
      await T('3 to 17 Apr', { exact: true }).waitFor();
      await T(/^Bergen, Flåm, .*Tromsø · Stays here: Journey is told the title and the dates$/).waitFor();
      await R('button', { name: 'Start it now' }).waitFor();
      await shot('trip-draft');
      await closeSheet();
      // What is filed in it opens as what it is: a page of the trip is a page of Notes, not a book.
      await R('button', { name: 'Day by day. 14 days sketched · Bergen to Tromsø' }).click();
      await L('Title', { exact: true }).waitFor({ timeout: 20000 });
      if (await page.getByText('Kept from Journey').count()) throw new Error('an ordinary page is drawn as a book');
      await page.goBack();
      await R('heading', { name: 'Norway 2027' }).waitFor({ timeout: 20000 });
      // The same folder, the way Notes shows it.
      await R('button', { name: 'More', exact: true }).click();
      await shot('trip-menu');
      await R('button', { name: /^Open as a folder/ }).click();
      await T('New in Norway 2027').waitFor({ timeout: 20000 });
      await page.goBack();
      await T('A trip in Trips').waitFor({ timeout: 20000 });
    });

    await step('a-folder-becomes-a-trip', async () => {
      // A folder that is given dates is a trip from then on. This one starts today, so it can become a journey.
      const folder = await ctx.api(nora, 'POST', '/v1/folders', { clientId: newId(), circleId: linds.id, parentId: trips.id, title: `Piran weekend ${tag}`, audience: 'circle' });
      await page.goto(`${WEB_URL}/folder/${folder.id}`);
      await R('heading', { name: `Piran weekend ${tag}` }).waitFor({ timeout: 20000 });
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Make it a trip' }).click();
      await R('heading', { name: 'When is the trip?' }).waitFor();
      await T('A folder with dates is a trip: planned here, told in Journey, and kept as a book afterwards.').waitFor();
      await shot('trip-dates');
      await R('button', { name: 'Make it a trip' }).click();
      await T('A trip in Trips').waitFor({ timeout: 20000 });
      for (const stage of ['Plan: done', 'Go: now', 'Keep: after']) await L(stage, { exact: true }).waitFor();
      await T('Today this can become a journey').waitFor();
      // On day one: start the journey. It happens once.
      await R('button', { name: 'See the draft' }).click();
      await R('heading', { name: 'The draft' }).waitFor();
      await R('button', { name: 'Start the journey' }).click();
      await T('Being told in Journey').waitFor({ timeout: 20000 });
      await T(`Piran weekend ${tag}`, { exact: false }).waitFor();
      await shot('trip-go');
      const started = (await ctx.api(nora, 'GET', '/v1/journey/journeys')).items.find((journey) => journey.title === `Piran weekend ${tag}`);
      if (!started || started.visibility !== 'private') throw new Error('the trip did not become a private journey in Journey');
      await R('button', { name: 'Open in Journey' }).click();
      await T('Journey opens from here when both apps are on your phone. A browser has no app to hop to.').waitFor();
      // It stops being a trip; the folder stays.
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Stop being a trip' }).click();
      await R('heading', { name: `Stop “Piran weekend ${tag}” being a trip?` }).waitFor();
      await R('button', { name: 'Stop being a trip' }).click();
      await T(`New in Piran weekend ${tag}`).waitFor({ timeout: 20000 });
      await gone(folder.id);
    });

    await step('from-the-library', async () => {
      // The albums that came home from Journey, and what is kept from it.
      await page.goto(WEB_URL + '/library/albums');
      await R('tab', { name: /^From Journey, \d+$/ }).click();
      await R('button', { name: /^Iceland ring road\. \d+ originals · kept in April$/ }).waitFor({ timeout: 20000 });
      await shot('albums-from-journey');
      // An album tells as a journey too: its menu leads to the draft. It is thrown away again.
      await R('button', { name: /^Iceland ring road\. \d+ originals · kept in April$/ }).click();
      await R('heading', { name: 'Iceland ring road' }).waitFor({ timeout: 20000 });
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Tell it as a journey' }).click();
      await T('From the album').waitFor({ timeout: 20000 });
      await R('button', { name: 'Close', exact: true }).click();
      await R('button', { name: 'Throw it away' }).click();
      await page.waitForURL(/\/album\//, { timeout: 20000 });
      await page.goto(WEB_URL + '/settings/storage');
      await R('button', { name: /^Kept from Journey\. \d+ · \d+ matched to photos you already had$/ }).waitFor({ timeout: 20000 });
      await shot('storage-kept-from-journey');
      await R('button', { name: /^Kept from Journey\. / }).click();
      await R('heading', { name: 'Kept from Journey' }).waitFor({ timeout: 20000 });
      await page.goto(WEB_URL + '/');
      await R('tab', { name: 'Home' }).waitFor({ timeout: 20000 });
    });
  } finally {
    ctx.expectNotFound = false;
    if (evening) await evening.context().close().catch(() => undefined);
    if (sam) await sam.close().catch(() => undefined);
    await tidy().catch(() => undefined);
  }

  await ctx.signOut();
};
