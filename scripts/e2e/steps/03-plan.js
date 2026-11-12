// Milestone 3, Plan: the calendar, events, reminders, goals, and "Type it".
//
// As Nora in The Linds, with the sample week: today's dentist visit and the bins on Today and on Plan; the
// bins ticked on Plan (the next turn is Alex's) and unticked on Today; the month, a day in it and one
// person's days; the birthday party and an answer to it; a sentence typed into "Type it" from the + sheet,
// its reading corrected and added; reminders, with one given to a second person who joins her circle and
// finds it under theirs; an event only Nora sees, which the second person can't find on Plan, in the month,
// in search or by its address until she shares it, and can't again once it is hidden from them; goals, the
// holiday fund, and money added to it. What the walk makes is taken away again at its end, so it can be
// walked twice (light and dark) on the same data.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "2026-11-14" as a date on this machine's calendar, and back. */
const dateOf = (day) => new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
/** "Sat 14 Nov": a day as the calendar writes it (this year). */
const weekdayDay = (day) => `${WEEKDAYS[dateOf(day).getDay()]} ${dateOf(day).getDate()} ${MONTHS[dateOf(day).getMonth()].slice(0, 3)}`;
/** "14 November 2026": a day as the month grid says it. */
const inCalendar = (day) => `${dateOf(day).getDate()} ${MONTHS[dateOf(day).getMonth()]} ${dateOf(day).getFullYear()}`;
const monthName = (day) => `${MONTHS[dateOf(day).getMonth()]} ${dateOf(day).getFullYear()}`;

exports.run = async function run(ctx) {
  const { page, T, R, L, shot, step, tag, WEB_URL, CODE } = ctx;
  const today = iso(new Date());
  const SENTENCE = 'Haircut for Leo Saturday at 10, remind me an hour before';
  const JOB = `Water the plants ${tag}`;
  const SURPRISE = `Surprise ${tag}`;
  let nora;
  let linds;
  let sam;
  /** What the walk made, to take away at its end: things by id. */
  const made = [];

  /** A day as the month grid and the strip of seven name it: today says so. */
  const gridDay = (day) => (day === today ? `${inCalendar(day)}, today` : inCalendar(day));
  const stripDay = (day) => (day === today ? `${weekdayDay(day)}, today` : weekdayDay(day));
  const api = (method, address, body) => ctx.api(nora, method, address, body);
  /** The lines of one day of the plan, as the API gives them to Nora. */
  const dayOf = async (day) => (await api('GET', `/v1/circles/${linds.id}/plan?day=${day}&days=1`)).days[0].entries;
  /**
   * Puts The Linds back as the sample data has them: the bins unticked, and nothing left of what this walk
   * makes (also from a walk that stopped half way).
   */
  const tidy = async () => {
    for (const id of made.splice(0)) await api('DELETE', `/v1/things/${id}`).catch(() => undefined);
    const open = await api('GET', `/v1/circles/${linds.id}/reminders?day=${today}`);
    const done = (await api('GET', `/v1/circles/${linds.id}/reminders/done`)).items.map((tick) => ({ id: tick.reminderId, title: tick.title }));
    const reminders = [...open.yours.flatMap((group) => group.reminders), ...open.asked, ...open.places];
    const bins = reminders.find((reminder) => reminder.title === 'Take the bins out');
    if (bins && bins.done && bins.tickedDueOn) await api('PUT', `/v1/reminders/${bins.id}/done`, { done: false, dueOn: bins.tickedDueOn, day: today });
    for (const reminder of [...reminders, ...done]) if (reminder.title.startsWith('Water the plants ')) await api('DELETE', `/v1/things/${reminder.id}`).catch(() => undefined);
    for (const words of ['Surprise', 'Haircut']) {
      const events = (await api('GET', `/v1/circles/${linds.id}/search?q=${words}`)).hits.map((hit) => hit.thing).filter((thing) => thing.kind === 'event');
      for (const thing of events) {
        const typed = thing.title === 'Haircut · Leo' && (await api('GET', `/v1/events/${thing.id}`)).time === '11:00';
        if (thing.title.startsWith('Surprise ') || typed) await api('DELETE', `/v1/things/${thing.id}`).catch(() => undefined);
      }
    }
    const circle = await api('GET', `/v1/circles/${linds.id}`);
    for (const member of circle.members) if (member.name === 'Sam Planner') await api('DELETE', `/v1/members/${member.id}`).catch(() => undefined);
  };
  /** Leaves the screen with this heading, and waits until it has gone: the next press is for the screen underneath. */
  const back = async (heading) => {
    await R('button', { name: 'Back' }).click();
    await R('heading', { name: heading, exact: true }).waitFor({ state: 'detached' });
  };
  /** Opens Home on Plan and waits for the day's list. */
  const openPlan = async () => {
    await R('tab', { name: 'Home' }).click();
    await R('tab', { name: 'Plan' }).click();
    await R('button', { name: `${weekdayDay(today)}, today` }).waitFor();
  };

  await step('plan-sign-in', async () => {
    // (Walked by itself, with ONLY=03-plan, nothing has opened the app yet.)
    if (!page.url().startsWith(WEB_URL)) await page.goto(`${WEB_URL}/`);
    await T('Get started').waitFor({ timeout: 20000 });
    await ctx.signIn('nora@example.com');
    nora = (await ctx.api(null, 'POST', '/local-auth/token', { email: 'nora@example.com', code: CODE })).accessToken;
    linds = (await api('GET', '/v1/circles')).find((circle) => circle.name === 'The Linds');
    await tidy();
    await page.reload();
    await R('button', { name: 'The Linds. Change circle' }).waitFor({ timeout: 20000 });
  });

  await step('home', async () => {
    // Today, as far as Plan fills it: the dentist visit with its time and faces, the bins with a tick.
    await R('tab', { name: 'Today', selected: true }).waitFor();
    await R('button', { name: /^15:30\. Dentist · Mia\./ }).waitFor();
    await R('checkbox', { name: 'Take the bins out', exact: true, checked: false }).waitFor();
    await T('Tonight · your turn').waitFor();
    await shot('home');
  });

  await step('plan', async () => {
    await openPlan();
    // The doors to the month, the reminders and the goals; the week with today filled; the day's lines.
    for (const door of ['Month', 'Reminders', 'Goals']) await R('button', { name: door, exact: true }).waitFor();
    await R('heading', { name: `Today. ${weekdayDay(today)}` }).waitFor();
    await R('button', { name: /^15:30\. Dentist · Mia\. Trubarjeva 12$/ }).waitFor();
    await T('16:15').waitFor();
    await R('checkbox', { name: `Take the bins out, ${weekdayDay(today)}`, checked: false }).waitFor();
    await T('Tue and Fri · your turn, then Alex').waitFor();
    await shot('plan');
  });

  await step('plan-tick', async () => {
    // Ticking the bins: the tick shows at once, the line says when it was done, and the next turn is Alex's.
    const [ticked] = await Promise.all([page.waitForResponse((r) => r.request().method() === 'PUT' && /\/v1\/reminders\/[^/]+\/done$/.test(r.url())), R('checkbox', { name: `Take the bins out, ${weekdayDay(today)}` }).click()]);
    if (!ticked.ok()) throw new Error(`ticking the bins gave ${ticked.status()}`);
    await R('checkbox', { name: `Take the bins out, ${weekdayDay(today)}`, checked: true }).waitFor();
    await R('button', { name: /^19:00\. Take the bins out\. Done at / }).waitFor();
    await R('button', { name: /^19:00\. Take the bins out\. Tue and Fri · Alex's turn, then you$/ }).waitFor();
    await shot('plan-ticked');
    // Today has it ticked too. Taking the tick away there puts it back on both.
    // (Today's tick is named by its title alone; Plan's carries the day, so each is asked for by its whole name.)
    await R('tab', { name: 'Today' }).click();
    await R('tab', { name: 'Today', selected: true }).waitFor();
    await R('checkbox', { name: 'Take the bins out', exact: true, checked: true }).waitFor();
    await R('checkbox', { name: 'Take the bins out', exact: true }).click();
    await R('checkbox', { name: 'Take the bins out', exact: true, checked: false }).waitFor();
    await T('Tonight · your turn').waitFor();
    // (Ticking didn't open the reminder: this is still Today.)
    await R('tab', { name: 'Today', selected: true }).waitFor();
    await R('tab', { name: 'Plan' }).click();
    await R('checkbox', { name: `Take the bins out, ${weekdayDay(today)}`, checked: false }).waitFor();
    await R('button', { name: /^19:00\. Take the bins out\. Done at / }).waitFor({ state: 'detached' });
  });

  // The haircut the sample week has on its Saturday, and the birthday party: where they are is the API's to say.
  let saturday;
  let party;
  await step('month', async () => {
    saturday = (await api('POST', `/v1/circles/${linds.id}/read`, { text: SENTENCE, day: today, timeZone: 'UTC' })).items[0].day;
    party = (await api('GET', `/v1/circles/${linds.id}/search?q=birthday%20party`)).hits.map((hit) => hit.thing).find((thing) => thing.kind === 'event');
    party = await api('GET', `/v1/events/${party.id}`);
    await R('button', { name: 'Month', exact: true }).click();
    await R('heading', { name: monthName(today) }).waitFor();
    await R('button', { name: `${inCalendar(today)}, today`, pressed: true }).waitFor();
    await R('button', { name: 'Everyone', pressed: true }).waitFor();
    // A day in it: its list shows under the grid.
    if (saturday.slice(0, 7) !== today.slice(0, 7)) await R('button', { name: 'Next month' }).click();
    await R('button', { name: gridDay(saturday), exact: true }).click();
    await R('button', { name: gridDay(saturday), pressed: true }).waitFor();
    await R('heading', { name: weekdayDay(saturday) }).waitFor();
    await R('button', { name: /^10:00\. Haircut · Leo\. Reminds you an hour before$/ }).waitFor();
    await shot('month');
    // Only one person's days: Leo keeps his haircut, Alex has nothing of his own on that day's list.
    await R('button', { name: 'Leo', exact: true }).click();
    await R('button', { name: 'Leo', pressed: true }).waitFor();
    await R('button', { name: /^10:00\. Haircut · Leo\./ }).waitFor();
    await R('button', { name: 'Alex', exact: true }).click();
    await R('button', { name: /^10:00\. Haircut · Leo\./ }).waitFor({ state: 'detached' });
    await shot('month-one-person');
    await R('button', { name: 'Everyone', exact: true }).click();
    await R('button', { name: /^10:00\. Haircut · Leo\./ }).waitFor();
  });

  await step('event', async () => {
    // The birthday party, from its day in the month.
    for (let month = saturday.slice(0, 7); month < party.day.slice(0, 7); ) {
      await R('button', { name: 'Next month' }).click();
      const next = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1);
      month = iso(next).slice(0, 7);
    }
    await R('heading', { name: monthName(party.day) }).waitFor();
    await R('button', { name: gridDay(party.day), exact: true }).click();
    await R('button', { name: /^14:00\. Mia's 10th birthday party\./ }).click();
    await R('heading', { name: "Mia's 10th birthday party" }).waitFor();
    await T(`${weekdayDay(party.day)} · 14:00 to 17:00`).waitFor();
    await T('At home').waitFor();
    await R('button', { name: 'Seen by: Not Mia. Change who can see this' }).waitFor();
    await R('radio', { name: 'Going', checked: true }).waitFor();
    await T('For this event').waitFor();
    await R('button', { name: /^Party prep\. 4 of 9 done/ }).waitFor();
    await T('Photos taken there land in it').waitFor();
    await shot('event');
    // Her own answer: it is saved, and the count follows.
    const before = await R('button', { name: /See who is coming$/ }).getAttribute('aria-label');
    await R('radio', { name: 'Maybe' }).click();
    await R('radio', { name: 'Maybe', checked: true }).waitFor();
    await T('1 maybe', { exact: false }).waitFor();
    await R('radio', { name: 'Going' }).click();
    await R('radio', { name: 'Going', checked: true }).waitFor();
    await R('button', { name: before }).waitFor();
    // Who is coming, and what each of them answered.
    await R('button', { name: /See who is coming$/ }).click();
    await R('heading', { name: "Who's coming" }).waitFor();
    await R('button', { name: 'You: Going. Change' }).waitFor();
    await R('button', { name: 'Alex: Going. Change' }).waitFor();
    await R('button', { name: /: Hasn't answered\. Change$/ }).waitFor();
    await shot('event-guests');
    await page.keyboard.press('Escape');
    await R('heading', { name: "Who's coming" }).waitFor({ state: 'detached' });
    // The three dots: change it, who is coming, a picture, delete.
    await R('button', { name: 'More' }).click();
    await R('button', { name: 'Change', exact: true }).click();
    await R('heading', { name: 'Change the event' }).waitFor();
    await R('button', { name: `When. ${weekdayDay(party.day)} · 14:00 to 17:00` }).waitFor();
    await shot('event-change');
    await page.keyboard.press('Escape');
    await R('heading', { name: 'Change the event' }).waitFor({ state: 'detached' });
    await back("Mia's 10th birthday party");
    await back(monthName(party.day));
    await R('tab', { name: 'Plan', selected: true }).waitFor();
  });

  await step('quick-add', async () => {
    // "Type it", from the + sheet's line: the sentence is read while it is typed, and shown piece by piece.
    await R('button', { name: 'Add something' }).click();
    await T('Type it: “Haircut for Leo, Saturday 10”').waitFor();
    await shot('plus');
    await R('button', { name: 'Type what to add' }).click();
    await R('heading', { name: 'New', exact: true }).waitFor();
    await T(/^Write it the way you'd say it\./).waitFor();
    if ((await R('button', { name: 'Add', exact: true }).getAttribute('aria-disabled')) !== 'true') throw new Error('Add did not wait for something to add');
    await L('What to add').pressSequentially(SENTENCE, { delay: 15 });
    await R('button', { name: 'Read as: An event. Change' }).waitFor();
    await R('button', { name: `${weekdayDay(saturday)} · 10:00 to 10:30. Change` }).waitFor();
    await R('button', { name: 'For Leo. Change' }).waitFor();
    await R('button', { name: 'Remind you · 1 hour before. Change' }).waitFor();
    await R('button', { name: /^Barber Miha, .*\. Change$/ }).waitFor();
    await shot('quick-add');
    // Correcting a piece: the time is 11, not 10.
    await R('button', { name: `${weekdayDay(saturday)} · 10:00 to 10:30. Change` }).click();
    await R('heading', { name: 'When', exact: true }).waitFor();
    await L('Starts', { exact: true }).fill('11');
    await T('Read as 11:00').waitFor();
    await L('Ends', { exact: true }).fill('');
    await shot('quick-add-when');
    await R('button', { name: 'Done', exact: true }).click();
    await R('button', { name: `${weekdayDay(saturday)} · 11:00 to 11:30. Change` }).waitFor();
    // The other pieces can be corrected the same way; here they are looked at and left as they were read.
    await R('button', { name: 'Remind you · 1 hour before. Change' }).click();
    await R('radio', { name: '1 hour before', checked: true }).waitFor();
    await R('radio', { name: 'No reminder' }).waitFor();
    await page.keyboard.press('Escape');
    await R('button', { name: 'For Leo. Change' }).click();
    await R('radio', { name: 'Leo', checked: true }).waitFor();
    await page.keyboard.press('Escape');
    await R('radio', { name: 'Leo' }).waitFor({ state: 'detached' });
    await shot('quick-add-corrected');
    const [added] = await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/v1/events')), R('button', { name: 'Add', exact: true }).click()]);
    if (!added.ok()) throw new Error(`adding the event gave ${added.status()}`);
    made.push((await added.json()).id);
    // It is on Saturday, at 11, for Leo, with the place of the last one.
    await R('tab', { name: 'Plan', selected: true }).waitFor();
    await R('button', { name: stripDay(saturday), exact: true }).click();
    await R('heading', { name: new RegExp(`${weekdayDay(saturday)}$`) }).waitFor();
    await R('button', { name: /^11:00\. Haircut · Leo\./ }).waitFor();
    await shot('plan-saturday');
    await R('button', { name: /^11:00\. Haircut · Leo\./ }).click();
    await T(`${weekdayDay(saturday)} · 11:00 to 11:30`).waitFor();
    await T('Barber Miha').waitFor();
    await T('Reminds you 1 hour before').waitFor();
    await shot('event-typed');
    await back('Haircut · Leo');
  });

  await step('reminders', async () => {
    await openPlan();
    await R('button', { name: 'Reminders', exact: true }).click();
    await R('heading', { name: 'Reminders' }).waitFor();
    // Yours by day, what you asked of someone (not done with a Nudge, done with a mark), and the ones
    // that wait for a place, with what a browser can't do about those.
    await R('tab', { name: /^Yours/ }).waitFor();
    await R('checkbox', { name: `Take the bins out, ${weekdayDay(today)}`, checked: false }).waitFor();
    await T('19:00 · Tue and Fri · takes turns').waitFor();
    await T('You asked someone').waitFor();
    await R('button', { name: 'Nudge Alex about Book the car service' }).waitFor();
    await T('Done at 7:40 · 1 star').waitFor();
    await T('When someone is there').waitFor();
    await T("When you're near the post office").waitFor();
    await T(/^In the phone app, the phone watches for these places/).waitFor();
    await shot('reminders');
    await R('tab', { name: /^You asked/ }).click();
    await T('When someone is there').waitFor({ state: 'detached' });
    await T('Book the car service').waitFor();
    await R('tab', { name: 'Done' }).click();
    await R('checkbox', { name: 'Feed Biscuit, done. Take the tick off', checked: true }).waitFor();
    await shot('reminders-done');
    await R('tab', { name: /^Yours/ }).click();
    // A reminder, opened: when, how often, whose turn it is.
    await R('button', { name: /^Take the bins out\. 19:00/ }).click();
    await R('heading', { name: 'Take the bins out' }).waitFor();
    await T('Your turn, then Alex · They take turns').waitFor();
    await shot('reminder');
    await back('Take the bins out');
    await R('heading', { name: 'Reminders' }).waitFor();
  });

  await step('second-person', async () => {
    // A second, new person joins her circle by the link Nora gives out.
    sam = await ctx.second('Sam Planner');
    const code = (await api('GET', `/v1/circles/${linds.id}`)).joinUrl.split('/').pop();
    await sam.page.goto(`${WEB_URL}/join/${code}`);
    await sam.R('heading', { name: 'Join The Linds?' }).waitFor({ timeout: 20000 });
    await sam.R('button', { name: 'Join', exact: true }).click();
    await sam.R('button', { name: 'The Linds. Change circle' }).waitFor({ timeout: 20000 });
    // What the family shares is theirs to see: the week on Plan, with Nora's turn at the bins.
    await sam.R('tab', { name: 'Plan' }).click();
    await sam.R('button', { name: `${weekdayDay(today)}, today` }).waitFor();
    await sam.T("Tue and Fri · Nora's turn, then Alex").waitFor();
    // Nora's phone learns of them the next time it asks who is in the circle.
    await page.goto(`${WEB_URL}/plan/reminders`);
    await R('heading', { name: 'Reminders' }).waitFor({ timeout: 20000 });
  });

  await step('reminder-for-someone', async () => {
    // A new reminder, given to the second person.
    await R('button', { name: 'New reminder' }).click();
    await R('heading', { name: 'New reminder' }).waitFor();
    await R('button', { name: 'When. Some time' }).waitFor();
    await L('What has to be done?').fill(JOB);
    await R('button', { name: 'Give it to. Nobody: it is yours' }).click();
    await R('checkbox', { name: 'Sam', exact: true }).click();
    await R('button', { name: 'Done', exact: true }).click();
    await R('button', { name: 'Give it to. Sam' }).waitFor();
    await shot('new-reminder');
    const [created] = await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/v1/reminders')), R('button', { name: 'Add', exact: true }).click()]);
    if (!created.ok()) throw new Error(`making the reminder gave ${created.status()}`);
    made.push((await created.json()).id);
    // Nora sees it under what she asked of someone, and can nudge.
    await R('heading', { name: 'Reminders' }).waitFor();
    await R('button', { name: `Nudge Sam about ${JOB}` }).click();
    await T('A gentle nudge is on its way to Sam.').waitFor();
    await shot('reminders-asked');
    // The second person finds it under theirs, and ticks it.
    await sam.R('button', { name: 'Reminders', exact: true }).click();
    await sam.R('heading', { name: 'Reminders' }).waitFor();
    await sam.T('Some time', { exact: true }).waitFor();
    await sam.R('checkbox', { name: `${JOB}, Some time`, checked: false }).waitFor();
    await sam.shot('reminders-theirs');
    await sam.R('checkbox', { name: `${JOB}, Some time` }).click();
    await sam.R('checkbox', { name: `${JOB}, Some time` }).waitFor({ state: 'detached' });
    await sam.R('tab', { name: 'Done' }).click();
    await sam.R('checkbox', { name: `${JOB}, done. Take the tick off`, checked: true }).waitFor();
    // And Nora sees that it is done.
    await page.goto(`${WEB_URL}/plan/reminders`);
    await R('heading', { name: 'Reminders' }).waitFor({ timeout: 20000 });
    await R('button', { name: new RegExp(`^${JOB}\\. Done at `) }).waitFor();
    await R('button', { name: `Nudge Sam about ${JOB}` }).waitFor({ state: 'detached' });
  });

  /**
   * Whether the second person finds the surprise: on Plan, in the month, in search, by its address. A phone
   * shows what it read last until the API has answered again, so each look waits for that fresh answer.
   */
  let surprise;
  const answered = (part) => sam.page.waitForResponse((r) => r.request().method() === 'GET' && r.url().includes(`/v1/circles/${linds.id}/${part}`) && r.ok());
  const samFinds = async () => {
    await Promise.all([answered('plan?'), sam.page.goto(`${WEB_URL}/?place=plan`)]);
    await sam.R('button', { name: stripDay(today) }).waitFor({ timeout: 20000 });
    await sam.page.waitForTimeout(600);
    const onPlan = (await sam.page.getByText(SURPRISE).count()) > 0;
    await Promise.all([answered('plan?'), sam.R('button', { name: 'Month', exact: true }).click()]);
    await sam.R('button', { name: gridDay(today), pressed: true }).waitFor();
    await sam.page.waitForTimeout(600);
    // (Plan is still in the page underneath the month: only what the month itself lists counts.)
    const inMonth = (await sam.page.getByText(SURPRISE).count()) > (onPlan ? 1 : 0);
    await sam.R('button', { name: 'Back' }).click();
    await sam.R('heading', { name: monthName(today) }).waitFor({ state: 'detached' });
    await sam.R('button', { name: 'Find a date or a job' }).click();
    await sam.L('Search The Linds').fill(SURPRISE);
    await sam.R('button', { name: new RegExp(`^${SURPRISE}\\.`) }).or(sam.T(`Nothing found for “${SURPRISE}”`)).last().waitFor();
    const inSearch = (await sam.page.getByRole('button', { name: new RegExp(`^${SURPRISE}\\.`) }).count()) > 0;
    await sam.page.goto(`${WEB_URL}/event/${surprise}`);
    await sam.R('heading', { name: SURPRISE }).or(sam.R('heading', { name: "This isn't available" })).last().waitFor({ timeout: 20000 });
    const byAddress = (await sam.page.getByRole('heading', { name: SURPRISE }).count()) > 0;
    return { onPlan, inMonth, inSearch, byAddress };
  };
  const all = (found, value) => Object.values(found).every((one) => one === value);

  await step('private-event', async () => {
    // An event made from the month's +, for today. In a family it starts as Nora's alone.
    await page.goto(`${WEB_URL}/plan/month`);
    await R('heading', { name: monthName(today) }).waitFor({ timeout: 20000 });
    await R('button', { name: 'New event' }).click();
    await R('heading', { name: 'New event' }).waitFor();
    await R('button', { name: `When. ${weekdayDay(today)} · All day` }).waitFor();
    await R('button', { name: 'Seen by Only you. Change' }).waitFor();
    await L('What is it?').fill(SURPRISE);
    await R('button', { name: `When. ${weekdayDay(today)} · All day` }).click();
    await L('Starts', { exact: true }).fill('20:15');
    await L('Ends', { exact: true }).fill('21');
    await R('button', { name: 'Done', exact: true }).click();
    await R('button', { name: `When. ${weekdayDay(today)} · 20:15 to 21:00` }).waitFor();
    await shot('new-event');
    await R('button', { name: 'Add', exact: true }).click();
    await R('heading', { name: SURPRISE }).waitFor();
    await R('button', { name: 'Seen by: Only you. Change who can see this' }).waitFor();
    surprise = page.url().split('/').pop();
    made.push(surprise);
    await shot('event-private');
    // The second person can't find it anywhere.
    ctx.expectNotFound = true;
    const hidden = await samFinds();
    if (!all(hidden, false)) throw new Error(`Sam found an event only Nora may see: ${JSON.stringify(hidden)}`);
    await sam.shot('event-not-theirs');
  });

  await step('shared-event', async () => {
    // Nora shares it with everyone, from the chip on the event.
    await R('button', { name: 'Seen by: Only you. Change who can see this' }).click();
    await T('Who can see this?').waitFor();
    await R('radio', { name: /^Everyone in The Linds/ }).click();
    await R('button', { name: 'Done', exact: true }).click();
    await R('button', { name: 'Seen by: The Linds. Change who can see this' }).waitFor();
    const shared = await samFinds();
    if (!all(shared, true)) throw new Error(`Sam didn't find an event that was shared with everyone: ${JSON.stringify(shared)}`);
    await sam.T(`${weekdayDay(today)} · 20:15 to 21:00`).waitFor();
    await sam.shot('event-shared');
    // Then she hides it from them (a child has no sign-in, so the second person stands in for Mia):
    // it is gone for them again, everywhere.
    await R('button', { name: 'Seen by: The Linds. Change who can see this' }).click();
    await R('button', { name: /^Sam: / }).click();
    await R('button', { name: 'Hide it from Sam' }).click();
    await shot('event-hide');
    await R('button', { name: 'Done', exact: true }).click();
    await R('button', { name: 'Seen by: Not Sam. Change who can see this' }).waitFor();
    const again = await samFinds();
    if (!all(again, false)) throw new Error(`Sam found an event that is hidden from them: ${JSON.stringify(again)}`);
    ctx.expectNotFound = false;
    await back(SURPRISE);
  });

  await step('goals', async () => {
    await page.goto(`${WEB_URL}/?place=plan`);
    await R('button', { name: 'Goals', exact: true }).click();
    await R('heading', { name: 'Goals' }).waitFor({ timeout: 20000 });
    // The first one large, with its ring; the others two to a row.
    await R('button', { name: /^Norway 2027\. 70%\. €5,600 of €8,000/ }).waitFor();
    await T('saved', { exact: true }).waitFor();
    // (All four of the family chip in; with the second person in the circle that is "four", not "all four".)
    await T(/[Ff]our chip in$/).waitFor();
    for (const goal of ['Read 20 books', 'Family 10K', 'Pay off the car', "Mia's skates fund"]) await R('button', { name: new RegExp(`^${goal}\\.`) }).waitFor();
    await shot('goals');
  });

  await step('goal', async () => {
    await R('button', { name: /^Norway 2027\./ }).click();
    await R('heading', { name: 'Norway 2027' }).waitFor();
    // The ring, the numbers, and the API's own sentences on the pace.
    await T('€5,600 of €8,000').waitFor();
    await T(/^On track: €\d+ a week gets there$/).waitFor();
    await T('Saved each month').waitFor();
    await T('Alex added €150').waitFor();
    await T('Reads “Saved” in Norway budget').waitFor();
    await T('€2,400 to go').waitFor();
    await shot('goal');
    // Add money: the ring, what is left and the list follow.
    await R('button', { name: 'Add money' }).click();
    await L('How much, in euros').fill('25');
    await L('A few words').fill('birthday money');
    await shot('goal-add-money');
    await R('button', { name: 'Add', exact: true }).click();
    await T('Nora added €25').waitFor();
    await T('€5,625 of €8,000').waitFor();
    await T('€2,375 to go').waitFor();
    await shot('goal-added');
    // Where its number is read from can't be opened yet, and says why.
    await R('button', { name: /^Reads “Saved” in Norway budget/ }).click();
    await T(/^Sheets arrive with Money\./).waitFor();
    // Taking it back puts the goal where it was.
    await R('button', { name: /^Nora added €25\..*Take it back$/ }).click();
    await R('button', { name: 'Take it back', exact: true }).click();
    await T('€2,400 to go').waitFor();
    await T('Nora added €25').waitFor({ state: 'detached' });
    // A goal that is counted by hand has "Add one" instead.
    await back('Norway 2027');
    await R('button', { name: /^Read 20 books\./ }).click();
    await T('13 of 20', { exact: true }).waitFor();
    await R('button', { name: 'Add one' }).waitFor();
    await shot('goal-counted');
    await back('Read 20 books');
    // A new goal: the form, looked at and closed.
    await R('button', { name: 'New goal' }).click();
    await R('heading', { name: 'New goal' }).waitFor();
    await R('radio', { name: 'Money', checked: true }).waitFor();
    await shot('new-goal');
    await R('button', { name: 'Close' }).click();
    await R('heading', { name: 'Goals' }).waitFor();
    await back('Goals');
  });

  await step('plan-tidy', async () => {
    // What the walk made goes again, and the second person with it, so The Linds are as they were.
    await tidy();
    await sam.close();
    if ((await dayOf(today)).some((entry) => entry.title === SURPRISE)) throw new Error('the surprise is still on the plan');
    await page.goto(`${WEB_URL}/`);
    await R('button', { name: 'The Linds. Change circle' }).waitFor({ timeout: 20000 });
    await ctx.signOut();
  });
};
