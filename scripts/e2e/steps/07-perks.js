// Milestone 7, Fair and fun: Whose turn?, the piggy bank, secret missions, the Saturday jar, Sleeps until…,
// Where is it? and habit charts. Each is opened as the sample data has it (the picture that is compared with
// its drawing), and then started afresh from the gallery, where every control is used on a board of this
// run's own. Where a template keeps something from someone it is walked as two people: Sam joins Nora's
// family through the API, gets a secret mission of their own and never Nora's, and can't find a thing Nora
// put away for Alex alone.
//
// It can be run again and again on the same data: what an earlier run left is taken away through the API
// first, the sample boards are only read (or changed and changed back), and what this run makes is deleted.
const path = require('path');

/** How each template's sample board is told from one a run made: by what only the sample holds. */
const SAMPLE = {
  whose_turn: (board) => board.view.turns >= 30,
  piggy_bank: (board) => board.view.child?.name === 'Mia',
  secret_missions: (board) => board.view.revealed.length >= 3,
  saturday_jar: (board) => board.view.count + board.view.done >= 20,
  sleeps: (board) => [board.view.first, ...board.view.others].some((count) => count?.title === 'Grandma Astrid comes'),
  where_is_it: (board) => board.view.count >= 4,
  habit_charts: (board) => board.view.charts.some((chart) => chart.title === 'Bed made, bag packed'),
};

/** Money to the cent, as the piggy bank writes it. */
const eur = (cents) => `€${(Math.abs(cents) / 100).toFixed(2)}`;
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.run = async function run(ctx) {
  const { page, T, R, L, shot, step, tag, WEB_URL, IMG, CODE } = ctx;
  let nora;
  let linds;
  let sam;
  /** The boards this run started, to be deleted at its end. */
  const made = [];
  const asNora = (method, address, body) => ctx.api(nora, method, address, body);
  /** Puts the sheet that is up away, the way a person does: by tapping the dimmed page above it. */
  const closeSheet = (phone) => phone.R('button', { name: 'Close', exact: true }).click({ position: { x: 24, y: 24 } });
  const more = () => R('button', { name: 'More', exact: true });
  /** A photo, by what a screen reader says for it: in a browser that is the picture's own `alt`. */
  const photo = (label) => page.getByAltText(label).last();
  const idInAddress = () => page.url().match(/\/board\/([0-9a-f-]{36})/)[1];
  const today = new Date();
  const weekday = today.toLocaleDateString('en-GB', { weekday: 'long' });

  /** The sample board of a template in The Linds, as Nora sees it today. What an earlier run left beside it is deleted. */
  const sampleBoard = async (template) => {
    const boards = (await asNora('GET', `/v1/circles/${linds.id}/boards?template=${template}&limit=50`)).items;
    let sample;
    for (const card of boards) {
      const whole = await asNora('GET', `/v1/boards/${card.id}`);
      if (!sample && SAMPLE[template](whole)) sample = whole;
      else if (whole.mine) await asNora('DELETE', `/v1/things/${card.id}`);
    }
    if (!sample) throw new Error(`the sample board of ${template} is not in The Linds`);
    return sample;
  };
  /** The gallery, on the shelf these seven stand on. */
  const gallery = async () => {
    await page.goto(WEB_URL + '/templates');
    await R('button', { name: 'Fair and fun', exact: true }).click();
  };
  /** From the gallery: a template's card, and the board of it the circle has already. */
  const openFromGallery = async (card, row) => {
    await gallery();
    await R('button', { name: card }).click();
    await T('In The Linds already').waitFor();
    await R('button', { name: row }).click();
  };
  /**
   * From the gallery: a template's card and Start. `before` answers what the template asks first; `shared`
   * starts it as seen by the whole family. Ends on the new board and returns its id.
   */
  const startFromGallery = async (card, { before, shared } = {}) => {
    await gallery();
    await R('button', { name: card }).click();
    await T('This one does work for you: it keeps itself up to date as you use it.').waitFor();
    if (before) await before();
    if (shared) {
      await R('button', { name: 'Seen by Only you. Change' }).click();
      await R('button', { name: 'Seen by The Linds. Change' }).waitFor();
    }
    const [started] = await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && /\/templates\/\w+\/start/.test(r.url())), R('button', { name: 'Start another' }).click()]);
    if (started.status() !== 201) throw new Error(`starting ${card} gave ${started.status()}`);
    await page.waitForURL(/\/board\/[0-9a-f-]{36}/);
    made.push(idInAddress());
    return idInAddress();
  };

  // ---------- 16.1 Whose turn? ----------

  await step('whose-turn', async () => {
    await ctx.signIn('nora@example.com');
    nora = (await ctx.api(null, 'POST', '/local-auth/token', { email: 'nora@example.com', code: CODE })).accessToken;
    linds = (await asNora('GET', '/v1/circles')).find((circle) => circle.name === 'The Linds');
    const sample = await sampleBoard('whose_turn');

    await openFromGallery(/^Whose turn\?\. Does work/, /^Whose turn\?\. /);
    await R('heading', { name: 'Whose turn?' }).waitFor({ timeout: 20000 });
    // What is on tonight stands on top, with whose turn it is and the API's own line about last time.
    const tonight = sample.view.things.find((thing) => thing.tonight);
    if (tonight) {
      await T(`Tonight is ${tonight.name}`).waitFor();
      await T(`${tonight.next.name} ${tonight.does}`).waitFor();
      await T(tonight.line).first().waitFor();
      await R('button', { name: 'Done, pass it on' }).waitFor();
    }
    // The rest keep count, each with whose turn it is at its end.
    for (const thing of sample.view.things.filter((one) => one !== tonight)) await R('button', { name: new RegExp(`^${escaped(thing.name)}\\. ${thing.next.name}'s turn`) }).waitFor();
    await T('Proof, for arguments').waitFor();
    await T(/^\d+ turns kept since \w+( \d{4})?, each with its date\.$/).waitFor();
    await shot('whose-turn');

    // The proof: every turn of a month with its date, and the months before it.
    await R('button', { name: /^Proof, for arguments\. / }).click();
    const month = (date) => date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    await R('heading', { name: month(today) }).waitFor();
    await T(/ · The front seat$/).first().waitFor({ timeout: 20000 });
    await shot('whose-turn-proof');
    await R('button', { name: 'A month back' }).click();
    await R('heading', { name: month(new Date(today.getFullYear(), today.getMonth() - 1, 1)) }).waitFor();
    await T(/ · First in the bath$/).first().waitFor({ timeout: 20000 });
    await closeSheet(ctx);
    await R('heading', { name: 'Proof, for arguments' }).waitFor({ state: 'detached' });
  });

  await step('whose-turn-new', async () => {
    // A list of this run's own: something to take turns at, on tonight, between the two children.
    await startFromGallery(/^Whose turn\?\. Does work/);
    await R('heading', { name: 'Nothing to take turns at yet' }).waitFor({ timeout: 20000 });
    await R('button', { name: 'Add something to take turns at' }).click();
    if ((await R('button', { name: 'Start keeping count' }).getAttribute('aria-disabled')) !== 'true') throw new Error('something without a name could be added');
    await L('What you take turns at').fill('The last pancake');
    await L('What the one whose turn it is does').fill('gets the last pancake');
    await R('radio', { name: 'Trophy' }).click();
    await R('checkbox', { name: 'Mia', exact: true }).click();
    await T('Taking turns needs two people. Choose one more, or everyone.').waitFor();
    await R('checkbox', { name: 'Leo', exact: true }).click();
    await R('switch', { name: "It's on tonight" }).click();
    await shot('whose-turn-add');
    await R('button', { name: 'Start keeping count' }).click();
    await T('Tonight is The last pancake').waitFor({ timeout: 20000 });
    await T('Mia gets the last pancake').waitFor();
    await shot('whose-turn-new');

    // Done, pass it on: the turn is kept, tonight is over, and it is Leo's turn.
    await R('button', { name: 'Done, pass it on' }).click();
    await R('button', { name: /^The last pancake\. Leo's turn/ }).waitFor({ timeout: 20000 });
    await T('Tonight is The last pancake').waitFor({ state: 'detached' });
    await T('1 turn kept since', { exact: false }).waitFor();

    // Leo's turn was taken by Leo, with a few words: the list's line says so, and it is Mia's turn.
    await R('button', { name: /^The last pancake\. Leo's turn/ }).click();
    await T('Who took the turn?').waitFor();
    await L('A few words, if you like').fill('had two already');
    await shot('whose-turn-thing');
    await R('button', { name: 'Done, pass it on' }).click();
    await R('button', { name: "The last pancake. Mia's turn. Leo had two already" }).waitFor({ timeout: 20000 });

    // Taken back, it is Leo's turn again.
    await R('button', { name: /^The last pancake\. Mia's turn/ }).click();
    await R('button', { name: /^Take back Leo's turn of / }).click();
    await R('button', { name: /^The last pancake\. Leo's turn/ }).waitFor({ timeout: 20000 });

    // On tonight after all, and then off the list: asked about first.
    await R('button', { name: /^The last pancake\. Leo's turn/ }).click();
    await R('button', { name: "It's on tonight" }).click();
    await T('Leo gets the last pancake').waitFor({ timeout: 20000 });
    await R('button', { name: /^Leo gets the last pancake/ }).click();
    await R('button', { name: 'Not tonight after all' }).waitFor();
    await R('button', { name: 'Stop keeping count of it' }).click();
    await R('heading', { name: 'Stop keeping count of “The last pancake”?' }).waitFor();
    await R('button', { name: 'Stop keeping count of it' }).click();
    await R('heading', { name: 'Nothing to take turns at yet' }).waitFor({ timeout: 20000 });

    // The list itself goes the way every board does: More, Delete, asked about first.
    await more().click();
    await R('button', { name: /^Who can see this/ }).waitFor();
    await R('button', { name: 'Delete', exact: true }).click();
    await R('heading', { name: 'Delete “Whose turn?”?' }).waitFor();
    await R('button', { name: 'Delete it' }).click();
    await R('tab', { name: 'Home' }).waitFor({ timeout: 20000 });
    made.pop();
  });

  // ---------- 16.2 The piggy bank ----------

  await step('piggy', async () => {
    const sample = await sampleBoard('piggy_bank');
    const jar = (name) => sample.view.jars.find((one) => one.jar === name);

    await openFromGallery(/^The piggy bank\. Does work/, /^Mia's piggy bank\. /);
    await R('heading', { name: "Mia's piggy bank" }).waitFor({ timeout: 20000 });
    // The count to the cent, and that it is no bank account; the three jars; what the bank pays.
    await R('heading', { name: `${eur(sample.view.totalCents)}. Kept count of here. Not a bank account.` }).waitFor();
    await R('button', { name: `Spend: ${eur(jar('spend').cents)}, ${jar('spend').fill}% full. Pay in, take out or move` }).waitFor();
    await R('button', { name: `Save: ${eur(jar('save').cents)}, ${jar('save').fill}% full. Pay in, take out or move` }).waitFor();
    await R('button', { name: `Give: ${eur(jar('give').cents)}, ${jar('give').fill}% full. Pay in, take out or move` }).waitFor();
    await T('The Bank of Mum and Dad pays 5% a month').waitFor();
    await T(/^On what is in Save\. €\d+\.\d\d arrived on 1 \w+\.$/).waitFor();
    // What happened lately: stars, money from Grandma with her initials, and what was bought.
    await T('Lately').waitFor();
    await R('button', { name: /^10 stars from the chore wheel\. .+ · into Save\. \+€2\.00$/ }).waitFor();
    await R('button', { name: 'From Grandma Astrid. For a good school report. +€5.00' }).waitFor();
    await L('Astrid Lind').waitFor();
    await R('button', { name: 'Stickers. Her own choice, out of Spend. −€3.50' }).waitFor();
    await T(`${sample.view.fund.name}: ${sample.view.fund.percent}%`).waitFor();
    await T(`${sample.view.fund.starsToGo} stars to go`).waitFor();
    await R('button', { name: 'Pay in', exact: true }).waitFor();
    await shot('piggy');

    // Everything that ever happened, the bank's interest too.
    await more().click();
    await R('button', { name: 'Everything that happened' }).click();
    await T('Interest, 5%').waitFor({ timeout: 20000 });
    await T('Moved to Spend').waitFor();
    await T('Pocket money, to start').waitFor();
    await shot('piggy-all');
    await closeSheet(ctx);
    await T('Pocket money, to start').waitFor({ state: 'detached' });
    // A line of money, opened: who wrote it down.
    await R('button', { name: /^From Grandma Astrid\./ }).click();
    await T(/^Written down by Nora, /).waitFor();
    await R('button', { name: 'Take it back' }).waitFor();
    await closeSheet(ctx);
    await T(/^Written down by Nora, /).waitFor({ state: 'detached' });
  });

  await step('piggy-new', async () => {
    // A piggy bank of this run's own, for Leo: the template asks whose it is first.
    await startFromGallery(/^The piggy bank\. Does work/, {
      before: async () => {
        await T('Whose piggy bank is it?').waitFor();
        if ((await R('button', { name: 'Start another' }).getAttribute('aria-disabled')) !== 'true') throw new Error('a piggy bank could be started for nobody');
        await R('button', { name: 'Leo', exact: true }).click();
      },
    });
    await R('heading', { name: "Leo's piggy bank" }).waitFor({ timeout: 20000 });
    await R('heading', { name: '€0.00. Kept count of here. Not a bank account.' }).waitFor();
    await T('Nothing has happened here yet. Pay in the first pocket money and the count starts.').waitFor();
    await T("Leo's pocket money").waitFor();

    // The bank's rules: 10% a month, a star is worth €0.50, and Save is for a bike.
    await more().click();
    await R('button', { name: "The bank's rules" }).click();
    await L('Interest on Save, in percent a month').fill('10');
    await L('What one star is worth').fill('0.50');
    await L('What Save is for').fill('Bike fund');
    await L('How many stars it takes').fill('20');
    await shot('piggy-rules');
    await R('button', { name: 'Keep the rules' }).click();
    await T('The Bank of Mum and Dad pays 10% a month').waitFor({ timeout: 20000 });
    await T('Bike fund: 0%').waitFor();
    await T('20 stars to go').waitFor();

    // Four stars into Save: the stars set the amount, and the fund fills.
    await R('button', { name: 'Pay in', exact: true }).click();
    await R('radio', { name: 'Save', checked: true }).waitFor();
    await L('Stars it stands for').fill('4');
    await L('Where it came from').fill('4 stars for the garden');
    await shot('piggy-pay-in');
    await R('button', { name: 'Pay it in' }).click();
    await R('heading', { name: '€2.00. Kept count of here. Not a bank account.' }).waitFor({ timeout: 20000 });
    await R('button', { name: /^4 stars for the garden\. Today · into Save\. \+€2\.00$/ }).waitFor();
    await T('Bike fund: 20%').waitFor();
    await T('16 stars to go').waitFor();

    // Pocket money into Spend, by pressing its jar; some of it out again; some of Save moved to Give.
    await R('button', { name: /^Spend: €0\.00/ }).click();
    await R('radio', { name: 'Spend', checked: true }).waitFor();
    await L('How much').fill('5');
    await L('Where it came from').fill('Pocket money');
    await R('button', { name: 'Pay it in' }).click();
    await R('button', { name: /^Spend: €5\.00/ }).waitFor({ timeout: 20000 });
    await R('button', { name: /^Spend: €5\.00/ }).click();
    await R('radio', { name: 'Take out' }).click();
    await L('How much').fill('1,50');
    await L('What it was for').fill('Sweets');
    await L('A few words, if you like').fill('At the fair');
    await R('button', { name: 'Take it out' }).click();
    await R('button', { name: 'Sweets. At the fair, out of Spend. −€1.50' }).waitFor({ timeout: 20000 });
    await R('button', { name: /^Save: €2\.00/ }).click();
    await R('radio', { name: 'Move', exact: true }).click();
    await R('radio', { name: 'Give' }).click();
    await L('How much').fill('1');
    await R('button', { name: 'Move it' }).click();
    await R('button', { name: /^Give: €1\.00/ }).waitFor({ timeout: 20000 });
    await R('button', { name: /^Moved to Give\. Today · from Save to Give\. €1\.00$/ }).waitFor();
    await R('heading', { name: '€5.50. Kept count of here. Not a bank account.' }).waitFor();
    await shot('piggy-new');

    // What was bought is taken back: the money is in Spend again.
    await R('button', { name: /^Sweets\./ }).click();
    await R('button', { name: 'Take it back' }).click();
    await R('button', { name: /^Spend: €5\.00/ }).waitFor({ timeout: 20000 });
    await R('heading', { name: '€7.00. Kept count of here. Not a bank account.' }).waitFor();
  });

  // ---------- 16.3 Secret missions ----------

  let missionsId;
  await step('missions', async () => {
    const sample = await sampleBoard('secret_missions');
    const [own, ...read] = sample.view.yours;

    await openFromGallery(/^Secret missions\. Does work/, /^Secret missions\. Week \d+/);
    await R('heading', { name: 'Secret missions' }).waitFor({ timeout: 20000 });
    // Nora's own mission, which nobody else is shown, and the one of a child she reads it to.
    await T(`Week ${sample.view.week} · only you can see this`).waitFor();
    await R('heading', { name: own.text }).waitFor();
    await T(`Everyone has one this week. Yours is for ${own.target.name}.`).waitFor();
    for (const mission of read) {
      await T(`Week ${sample.view.week} · ${mission.doer.name}'s, for you to read out`).waitFor();
      await R('heading', { name: mission.text }).waitFor();
    }
    // Last week's, revealed on Sunday: who did what for whom, the line under it, a heart, a photo.
    await T('Last week, revealed on Sunday').waitFor();
    await R('button', { name: 'Alex for you: made your coffee three mornings running. You guessed by Wednesday' }).waitFor();
    await R('button', { name: 'Mia for Leo: let him win at cards, twice. Leo had no idea' }).waitFor();
    await R('button', { name: "Leo for Alex: hid a drawing in Dad's bag. Found in Reine, on day 3" }).waitFor();
    await photo("Leo's photo of it").waitFor();
    await R('button', { name: "You for Biscuit: one very long walk. Biscuit can't read, but knew" }).waitFor();
    await R('checkbox', { name: 'A heart for this', checked: true }).waitFor();
    await shot('missions');

    // The heart is Nora's to take back and give again: it was done for her.
    await R('checkbox', { name: 'A heart for this' }).click();
    await R('checkbox', { name: 'A heart for this', checked: false }).waitFor({ timeout: 20000 });
    await R('checkbox', { name: 'A heart for this' }).click();
    await R('checkbox', { name: 'A heart for this', checked: true }).waitFor({ timeout: 20000 });

    // A revealed mission, opened: what it was, and its photo.
    await R('button', { name: /^Leo for Alex: / }).click();
    await R('heading', { name: 'Leo for Alex' }).waitFor();
    await T('The mission was: Hide a small drawing where Dad will look.').waitFor();
    await shot('missions-revealed');
    await closeSheet(ctx);
    await R('heading', { name: 'Leo for Alex' }).waitFor({ state: 'detached' });

    // The week before that, and back.
    await more().click();
    await R('button', { name: 'The week before' }).click();
    await T(/^\d+ .+, revealed$/).waitFor({ timeout: 20000 });
    await T('Nothing was revealed that week.').waitFor();
    await more().click();
    await R('button', { name: 'Back to the last week revealed' }).click();
    await T('Last week, revealed on Sunday').waitFor({ timeout: 20000 });
  });

  await step('missions-two-people', async () => {
    // Sam joins Nora's family through the API (the join link is in the circle for its owner), on a second phone.
    sam = await ctx.second('Sam Demo');
    const code = (await asNora('GET', `/v1/circles/${linds.id}`)).joinUrl.split('/').pop();
    await ctx.api(sam.token, 'PUT', `/v1/join/${code}`);
    // Sam's phone still thinks Sam is in no circle: the invitation's own address opens the circle there.
    await sam.page.goto(`${WEB_URL}/join/${code}`);
    await sam.R('button', { name: 'Open The Linds' }).click();
    await sam.R('button', { name: 'The Linds. Change circle' }).waitFor({ timeout: 20000 });

    // Missions of this run's own, shared with the family, so Sam is dealt one too.
    missionsId = await startFromGallery(/^Secret missions\. Does work/, { shared: true });
    await R('heading', { name: 'Secret missions' }).waitFor({ timeout: 20000 });
    await T(/^Week \d+ · only you can see this$/).waitFor();
    const mine = async () => (await asNora('GET', `/v1/boards/${missionsId}`)).view.yours.find((mission) => mission.yours);
    const first = await mine();
    await R('heading', { name: first.text }).waitFor();
    // Nora's own card stands first; under it may be those of the children she reads theirs to.
    const done = () => page.getByRole('button', { name: 'Done', exact: true }).first();

    // A different one, for the same person.
    await page.getByRole('button', { name: 'A different one' }).first().click();
    await R('heading', { name: first.text }).waitFor({ state: 'detached', timeout: 20000 });
    const second = await mine();
    if (second.text === first.text || second.target.memberId !== first.target.memberId) throw new Error('"A different one" did not deal a different mission for the same person');
    await R('heading', { name: second.text }).waitFor();

    // Done, in her own words; taken back; and done again.
    const did = `did the thing nobody saw (${tag})`;
    await done().click();
    await R('heading', { name: 'What did you do?' }).waitFor();
    await L('What you did').fill(did);
    await shot('missions-tell');
    await R('button', { name: 'Done', exact: true }).click();
    await T('Done. Everyone reads about it on Sunday.').waitFor({ timeout: 20000 });
    await shot('missions-done');
    await R('button', { name: 'Not done after all' }).click();
    await T('Done. Everyone reads about it on Sunday.').waitFor({ state: 'detached', timeout: 20000 });
    await done().click();
    await R('heading', { name: 'What did you do?' }).waitFor();
    await R('button', { name: 'Done', exact: true }).click();
    await T('Done. Everyone reads about it on Sunday.').waitFor({ timeout: 20000 });

    // Sam has a mission of their own, and nothing of Nora's: not her mission, not for whom, not that it is done.
    await sam.page.goto(`${WEB_URL}/board/${missionsId}`);
    await sam.R('heading', { name: 'Secret missions' }).waitFor({ timeout: 20000 });
    await sam.T(/^Week \d+ · only you can see this$/).waitFor();
    const theirs = await ctx.api(sam.token, 'GET', `/v1/boards/${missionsId}`);
    if (!theirs.view.yours.some((mission) => mission.yours)) throw new Error('Sam was dealt no mission');
    if (theirs.view.yours.some((mission) => mission.doer.name === 'Nora') || JSON.stringify(theirs).includes(tag)) throw new Error("the API hands Nora's secret mission to Sam");
    if (theirs.view.revealed.length) throw new Error('a mission was revealed before Sunday');
    if (await sam.page.getByText(second.text).count()) throw new Error("Sam sees Nora's mission");
    if (await sam.page.getByText(tag, { exact: false }).count()) throw new Error('Sam sees what Nora did before Sunday');
    await sam.T('What gets done this week shows up here on Sunday, for everyone to read.').waitFor();
    await sam.shot('missions-other-person');
  });

  // ---------- 16.4 The Saturday jar ----------

  await step('saturday-jar', async () => {
    let sample = await sampleBoard('saturday_jar');
    await openFromGallery(/^The Saturday jar\. Does work/, /^The Saturday jar\. \d+ ideas? in the jar/);
    await R('heading', { name: 'The Saturday jar' }).waitFor({ timeout: 20000 });
    await T('A free day. What shall we do?').waitFor();
    if (!sample.view.pulled) {
      // The sample's slip was pulled on the day the data was added: on a later day the jar is shaken first.
      await T('Not shaken today').waitFor();
      await R('button', { name: 'Shake the jar' }).click();
      await R('heading', { name: 'What fits today?' }).waitFor();
      await R('button', { name: 'Shake the jar' }).click();
      await R('button', { name: 'Shake again' }).waitFor({ timeout: 20000 });
      sample = await asNora('GET', `/v1/boards/${sample.id}`);
    }
    // The slip that was pulled: the idea, who put it in, and what is worth knowing about it.
    const pulled = sample.view.pulled;
    await R('heading', { name: pulled.text }).waitFor();
    await T(new RegExp(`^${pulled.by.name} put this one in`)).waitFor();
    if (pulled.text.startsWith('A picnic')) for (const fact of ['Free', '2 hours', 'Outdoors']) await T(fact, { exact: true }).first().waitFor();
    await R('button', { name: 'Shake again' }).waitFor();
    await R('button', { name: "Let's do it" }).waitFor();
    // What is in the jar, narrowed by the API's own four filters.
    await T(`In the jar · ${sample.view.count} ideas`).waitFor();
    await R('button', { name: 'Build a den in the living room. Leo · at home · free' }).waitFor({ timeout: 20000 });
    await R('button', { name: 'The big slides at the pool. Alex · half a day · about €60' }).waitFor();
    await R('button', { name: 'Pancakes for dinner. Mia · at home · 30 minutes' }).waitFor();
    await shot('saturday-jar');
    await R('button', { name: 'At home', exact: true }).click();
    await R('button', { name: /^The big slides at the pool/ }).waitFor({ state: 'detached', timeout: 20000 });
    await R('button', { name: /^Pancakes for dinner/ }).waitFor();
    await R('button', { name: 'Free', exact: true }).click();
    await R('button', { name: /^Build a den in the living room/ }).waitFor({ timeout: 20000 });
    await R('button', { name: /^The big slides at the pool/ }).waitFor({ state: 'detached' });
    await R('button', { name: 'Rainy day' }).click();
    await R('button', { name: /^The big slides at the pool/ }).waitFor({ timeout: 20000 });
    await R('button', { name: /^Football in the park/ }).waitFor({ state: 'detached' });
    await shot('saturday-jar-rainy');
    await R('button', { name: 'Fits today' }).click();
    // An idea, opened: who put it in, and saying yes to this one.
    await R('button', { name: /^Pancakes for dinner/ }).click();
    await R('heading', { name: 'Pancakes for dinner' }).waitFor();
    await R('button', { name: "Let's do this one" }).waitFor();
    await R('button', { name: 'Take it out of the jar' }).waitFor();
    await closeSheet(ctx);
    await R('heading', { name: 'Pancakes for dinner' }).waitFor({ state: 'detached' });
  });

  await step('saturday-jar-new', async () => {
    // A jar of this run's own: empty, then two ideas, then shaken.
    const jarId = await startFromGallery(/^The Saturday jar\. Does work/);
    await R('heading', { name: 'The jar is empty' }).waitFor({ timeout: 20000 });
    const fort = `A blanket fort ${tag}`;
    await R('button', { name: 'Drop an idea in' }).click();
    await L('The idea').fill(fort);
    await R('radio', { name: 'Tent' }).click();
    await R('radio', { name: 'At home' }).click();
    await R('button', { name: '30 minutes' }).click();
    await shot('saturday-jar-add');
    await R('button', { name: 'Drop it in' }).click();
    await T('In the jar · 1 idea').waitFor({ timeout: 20000 });
    await T('Not shaken today').waitFor();
    await R('button', { name: `${fort}. Nora · at home · 30 minutes` }).waitFor();
    // A second one, a child's, that costs something: dropped in for him on Nora's phone.
    await R('button', { name: 'Drop an idea in' }).click();
    await L('The idea').fill('The roller rink');
    await R('radio', { name: 'Indoors' }).click();
    await R('button', { name: '2 hours' }).click();
    await L('About what it costs').fill('32');
    await R('button', { name: 'Leo', exact: true }).click();
    await R('button', { name: 'Drop it in' }).click();
    await T('In the jar · 2 ideas').waitFor({ timeout: 20000 });
    await R('button', { name: 'The roller rink. Leo · 2 hours · about €32' }).waitFor();

    // Shaken for something free: only the fort fits.
    await R('button', { name: 'Shake the jar' }).click();
    await R('heading', { name: 'What fits today?' }).waitFor();
    await R('radio', { name: 'Free' }).click();
    await shot('saturday-jar-ask');
    await R('button', { name: 'Shake the jar' }).click();
    await R('heading', { name: fort }).waitFor({ timeout: 20000 });
    await T('Nora put this one in this month').waitFor();
    for (const fact of ['Free', '30 minutes', 'At home']) await T(fact, { exact: true }).first().waitFor();
    await shot('saturday-jar-new');
    // Asked for anything, and shaken again: the other slip comes out, since there is another.
    await more().click();
    await R('button', { name: 'Ask for something else' }).click();
    await R('radio', { name: 'Free', checked: true }).waitFor();
    await R('radio', { name: 'Any' }).click();
    await R('button', { name: 'Shake the jar' }).click();
    await R('heading', { name: 'The roller rink' }).waitFor({ timeout: 20000 });
    await T('About €32', { exact: true }).waitFor();
    await R('button', { name: 'Shake again' }).click();
    await R('heading', { name: fort }).waitFor({ timeout: 20000 });

    // The rink is taken out; the fort is said yes to, and lands on the calendar with an album.
    await R('button', { name: /^The roller rink\./ }).click();
    await R('button', { name: 'Take it out of the jar' }).click();
    await T('In the jar · 1 idea').waitFor({ timeout: 20000 });
    await R('button', { name: "Let's do it" }).click();
    await T('Today · on the calendar, with an album for the photos').first().waitFor({ timeout: 20000 });
    await T('You said yes to').waitFor();
    await T('In the jar · 0 ideas').waitFor();
    await shot('saturday-jar-yes');
    const yes = (await asNora('GET', `/v1/boards/${jarId}`)).view.pulled;
    if (!yes.done || !yes.eventId || !yes.albumId) throw new Error('saying yes made no event and album');
    await R('button', { name: 'See it in the calendar' }).click();
    await page.waitForURL(new RegExp(`/event/${yes.eventId}`));
    await T(fort).first().waitFor({ timeout: 20000 });
    await shot('saturday-jar-event');
    // The event and the album go with this run.
    await asNora('DELETE', `/v1/things/${yes.eventId}`);
    await asNora('DELETE', `/v1/things/${yes.albumId}`);
  });

  // ---------- 16.5 Sleeps until… ----------

  await step('sleeps', async () => {
    const sample = await sampleBoard('sleeps');
    const first = sample.view.first;
    // A link an earlier run tore off and didn't put back goes back on first.
    if (first.tornTonight) await asNora('POST', `/v1/boards/${sample.id}/act`, { verb: 'tear', body: { entryId: first.id, torn: false } });

    await openFromGallery(/^Sleeps until…\. Does work/, /^Sleeps until…\. \d+ sleeps? until/);
    await R('heading', { name: 'Sleeps until…' }).waitFor({ timeout: 20000 });
    // The nearest day, counted in sleeps, with its chain and whose link is tonight.
    await T(String(first.sleeps), { exact: true }).waitFor();
    await T(`sleeps until ${first.title}`).waitFor();
    await T(new RegExp(`^${first.tearer.name} tears one off at bedtime\\. Tonight's is the \\w+ one\\.$`)).waitFor();
    await T('Also counting').waitFor();
    for (const count of sample.view.others) await R('button', { name: new RegExp(`^${escaped(count.title)}\\. ${count.sleeps} sleeps\\. `) }).waitFor();
    await T('On the Home Screen too').waitFor();
    await shot('sleeps');

    // Tonight's link comes off, and goes back on.
    await R('button', { name: "Tear off tonight's link" }).click();
    await T("Tonight's link is off. Sleep well.").waitFor({ timeout: 20000 });
    await shot('sleeps-torn');
    await R('button', { name: "Put tonight's link back" }).click();
    await T(/Tonight's is the \w+ one\.$/).waitFor({ timeout: 20000 });
    // The widget needs the phone app, and the note says so.
    await R('button', { name: /^On the Home Screen too\./ }).click();
    await T(/^The widget comes with the phone app's Home Screen widgets/).waitFor();
    await shot('sleeps-widget');
    await R('button', { name: 'OK', exact: true }).click();
    await T(/^The widget comes with the phone app's Home Screen widgets/).waitFor({ state: 'detached' });
    // A countdown, opened.
    await R('button', { name: /^Christmas morning\./ }).click();
    await R('heading', { name: /^\d+ sleeps until Christmas morning$/ }).waitFor();
    await T(/ · every year$/).waitFor();
    await closeSheet(ctx);
    await R('heading', { name: /^\d+ sleeps until Christmas morning$/ }).waitFor({ state: 'detached' });
  });

  await step('sleeps-new', async () => {
    await startFromGallery(/^Sleeps until…\. Does work/);
    await R('heading', { name: 'Nothing to count down to yet' }).waitFor({ timeout: 20000 });
    const play = `the school play ${tag}`;
    await R('button', { name: 'Count down to something' }).click();
    if ((await R('button', { name: 'Start the chain' }).getAttribute('aria-disabled')) !== 'true') throw new Error('a countdown could be started without a day');
    await L('Sleeps until…').fill(play);
    await R('button', { name: /^The day: Choose a day/ }).click();
    await R('button', { name: 'Next month' }).click();
    await R('button', { name: /^15 / }).click();
    await R('button', { name: /^The day: \w+ 15 / }).waitFor();
    await R('radio', { name: 'Party' }).click();
    await R('button', { name: 'Mia', exact: true }).click();
    await shot('sleeps-add');
    await R('button', { name: 'Start the chain' }).click();
    await T(`sleeps until ${play}`).waitFor({ timeout: 20000 });
    await T(/^Mia tears one off at bedtime\. Tonight's is the \w+ one\.$/).waitFor();
    // A second, further away and every year, counts under it; then it is taken off again.
    await R('button', { name: 'Count down to something' }).click();
    await L('Sleeps until…').fill('the summer holidays');
    await R('button', { name: /^The day: Choose a day/ }).click();
    await R('button', { name: 'A year on' }).click();
    await R('button', { name: /^15 / }).click();
    await R('checkbox', { name: 'It comes round every year' }).click();
    await R('button', { name: 'Start the chain' }).click();
    await T('Also counting').waitFor({ timeout: 20000 });
    await R('button', { name: /^the summer holidays\. \d+ sleeps\. / }).waitFor();
    await shot('sleeps-new');
    await R('button', { name: "Tear off tonight's link" }).click();
    await T("Tonight's link is off. Sleep well.").waitFor({ timeout: 20000 });
    await R('button', { name: /^the summer holidays\./ }).click();
    await R('button', { name: 'Stop counting down to it' }).click();
    await R('button', { name: /^the summer holidays\./ }).waitFor({ state: 'detached', timeout: 20000 });
    await T('Also counting').waitFor({ state: 'detached' });
  });

  // ---------- 16.6 Where is it? ----------

  await step('where', async () => {
    const sample = await sampleBoard('where_is_it');
    await openFromGallery(/^Where is it\?\. Does work/, /^Where is it\?\. \d+ things put away/);
    // At rest: the board's own bar, the box to ask in, and everything that is put away.
    await R('heading', { name: 'Where is it?' }).waitFor({ timeout: 20000 });
    await more().waitFor();
    await T('Things put away').waitFor();
    for (const item of sample.view.items) await R('button', { name: new RegExp(`^${escaped(item.name)}\\. `) }).waitFor();
    await R('button', { name: /^Leo's swimming bag\. Last seen on the hall hook · Mia, / }).waitFor();
    // Who each thing is kept to: the key and the passports to Alex and Nora, the rest to the family.
    if ((await page.getByLabel('Seen by: Alex and you').count()) !== 2) throw new Error('the things kept to Alex and Nora are not marked');
    if ((await page.getByLabel('Seen by: The Linds').count()) !== 3) throw new Error('the things for everyone are not marked');
    await shot('where-rest');

    // The question, asked: the box is the bar now, and the answer stands on top.
    await L("Where's the…?").fill("where's the tent");
    await T('Found', { exact: true }).waitFor({ timeout: 20000 });
    await T('Attic, blue crate 3').waitFor();
    await T(/^Tent, pegs and both mats\. Alex put them there on \d+ \w+( \d{4})?\.$/).waitFor();
    await photo('A photo of where Tent is').waitFor();
    await T('Other things put away').waitFor();
    await R('button', { name: 'Cancel', exact: true }).waitFor();
    await R('heading', { name: 'Where is it?' }).waitFor({ state: 'detached' });
    await T('Putting something away?').waitFor();
    await shot('where');
    // What answered, opened: its photo, and saying where it was last seen.
    await R('button', { name: /^Tent\. Found: Attic, blue crate 3/ }).click();
    await R('heading', { name: 'Tent', exact: true }).waitFor();
    await R('button', { name: 'Say where you saw it' }).waitFor();
    await shot('where-item');
    await closeSheet(ctx);
    await R('heading', { name: 'Tent', exact: true }).waitFor({ state: 'detached' });
    // A question nothing answers, the cross, and Cancel.
    await L("Where's the…?").fill('the hamster wheel');
    await T('Nothing put away answers “the hamster wheel”').waitFor({ timeout: 20000 });
    await R('button', { name: 'Clear the question' }).click();
    await T('Nothing put away answers “the hamster wheel”').waitFor({ state: 'detached' });
    await L("Where's the…?").fill('passports');
    await T('Bedroom, grey folder').waitFor({ timeout: 20000 });
    await T('Found', { exact: true }).waitFor();
    await R('button', { name: 'Cancel', exact: true }).click();
    await R('heading', { name: 'Where is it?' }).waitFor();
    await T('Things put away').waitFor();

    // The circle's own search answers the question too, with the place.
    await page.goto(WEB_URL + '/search');
    await L('Search The Linds').fill("where's the tent");
    await T(/Attic, blue crate 3/).waitFor({ timeout: 20000 });
    await shot('where-search');
    await R('button', { name: /^Where is it\?/ }).click();
    await page.waitForURL(new RegExp(`/board/${sample.id}`));
    await R('heading', { name: 'Where is it?' }).waitFor({ timeout: 20000 });
  });

  await step('where-two-people', async () => {
    // A list of this run's own, shared with the family: a sledge for everyone, and a present kept to Alex and Nora.
    const listId = await startFromGallery(/^Where is it\?\. Does work/, { shared: true });
    await R('heading', { name: 'Nothing is put away yet' }).waitFor({ timeout: 20000 });
    const sledge = `Sledge ${tag}`;
    const present = `Birthday present ${tag}`;
    await R('button', { name: 'Add', exact: true }).click();
    await R('heading', { name: 'Put something away' }).waitFor();
    await L('What it is').fill(sledge);
    await L('Where it is').fill('Cellar, behind the bikes');
    await L('What else to know').fill('The rope is in the box');
    await R('radio', { name: 'Tools' }).click();
    // A picked file stands in for the camera.
    const [photos] = await Promise.all([page.waitForEvent('filechooser'), R('button', { name: 'Add a photo of the place' }).click()]);
    await photos.setFiles(path.join(IMG, 'hallway.jpg'));
    await photo('The photo you chose').waitFor();
    await shot('where-add');
    await R('button', { name: 'Put it on the list' }).click();
    await R('button', { name: `${sledge}. Cellar, behind the bikes` }).waitFor({ timeout: 20000 });
    await R('button', { name: 'Add', exact: true }).click();
    await L('What it is').fill(present);
    await L('Where it is').fill('Top of the wardrobe');
    await R('checkbox', { name: 'Everyone who sees the list', checked: true }).waitFor();
    await R('checkbox', { name: 'Alex', exact: true }).click();
    await R('button', { name: 'Put it on the list' }).click();
    await R('button', { name: `${present}. Top of the wardrobe` }).waitFor({ timeout: 20000 });
    await L('Seen by: Alex and you').waitFor();
    await L('Seen by: The Linds').waitFor();
    await shot('where-new');

    // Sam sees the sledge and not the present: not in the list, not by asking, not from the API.
    await sam.page.goto(`${WEB_URL}/board/${listId}`);
    await sam.R('heading', { name: 'Where is it?' }).waitFor({ timeout: 20000 });
    await sam.R('button', { name: `${sledge}. Cellar, behind the bikes` }).waitFor();
    const theirs = await ctx.api(sam.token, 'GET', `/v1/boards/${listId}?show=${encodeURIComponent('where is the birthday present')}`);
    if (theirs.view.count !== 1 || theirs.view.found || JSON.stringify(theirs).includes('wardrobe')) throw new Error('the API hands Sam a thing that is kept to Alex and Nora');
    if (await sam.page.getByText('Birthday present', { exact: false }).count()) throw new Error('Sam sees the present that is kept to Alex and Nora');
    await sam.L("Where's the…?").fill('birthday present');
    await sam.T('Nothing put away answers “birthday present”').waitFor({ timeout: 20000 });
    await sam.shot('where-other-person');
    // ...and Sam says where the sledge was last seen, which Nora then reads.
    await sam.L("Where's the…?").fill('sledge');
    await sam.T('Found', { exact: true }).waitFor({ timeout: 20000 });
    await sam.R('button', { name: new RegExp(`^${escaped(sledge)}\\. Found: `) }).click();
    await sam.L('Seen it somewhere else? Say where').fill('in the hallway');
    await sam.R('button', { name: 'Say where you saw it' }).click();
    await sam.T(/Last seen in the hallway · Sam, \d+:\d\d$/).first().waitFor({ timeout: 20000 });
    await page.goto(`${WEB_URL}/board/${listId}`);
    await R('button', { name: new RegExp(`^${escaped(sledge)}\\. Last seen in the hallway · Sam, \\d+:\\d\\d$`) }).waitFor({ timeout: 20000 });
    await shot('where-seen');

    // Given a new place, where it was last seen is forgotten; the present is taken off the list.
    await R('button', { name: new RegExp(`^${escaped(sledge)}\\. `) }).click();
    await L('It lives somewhere new').fill('Attic, by the window');
    await R('button', { name: 'Give it its new place' }).click();
    await R('button', { name: `${sledge}. Attic, by the window` }).waitFor({ timeout: 20000 });
    await R('button', { name: new RegExp(`^${escaped(present)}\\. `) }).click();
    await R('button', { name: 'Take it off the list' }).click();
    await R('button', { name: new RegExp(`^${escaped(present)}\\. `) }).waitFor({ state: 'detached', timeout: 20000 });
  });

  // ---------- 16.7 Habit charts ----------

  await step('habits', async () => {
    const sample = await sampleBoard('habit_charts');
    const [leo, mia] = sample.view.charts;
    await openFromGallery(/^Habit charts\. Does work/, /^Habit charts\. \d+ charts/);
    await R('heading', { name: 'Habit charts' }).waitFor({ timeout: 20000 });
    // A child's chart is a card: whose it is, the API's line, the stars, and the week in cells.
    await R('button', { name: `Bed made, bag packed. Leo · ${leo.line}. ${leo.stars} stars` }).waitFor();
    await R('button', { name: `Reading, 20 minutes. Mia · ${mia.line}. ${mia.stars} stars` }).waitFor();
    for (const row of leo.rows) for (const cell of row.cells) if (cell.done) await R('checkbox', { name: `${row.label}, ${new Date(cell.day + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}`, checked: true }).waitFor();
    // The grown-ups' own are rows with one tick for today.
    await T('The grown-ups').waitFor();
    await R('button', { name: /^Phones off the table at dinner\. Everyone · / }).waitFor();
    await R('button', { name: /^One evening a week with no screens\. You and Alex · / }).waitFor();
    await T('A missed day is a gap, not a failure').waitFor();
    await T('Nothing resets. The chart just carries on.').waitFor();
    await shot('habits');

    // A cell is ticked and the star is earned; taken back, it is gone again. (Whichever way it stood, it ends as it began.)
    const reading = () => R('checkbox', { name: `Reading, 20 minutes, ${weekday}` });
    const was = (await reading().getAttribute('aria-checked')) === 'true';
    await reading().click();
    await R('checkbox', { name: `Reading, 20 minutes, ${weekday}`, checked: !was }).waitFor({ timeout: 20000 });
    await R('button', { name: new RegExp(`^Reading, 20 minutes\\. .+\\. ${mia.stars + (was ? -1 : 1)} stars$`) }).waitFor();
    await shot('habits-ticked');
    await reading().click();
    await R('checkbox', { name: `Reading, 20 minutes, ${weekday}`, checked: was }).waitFor({ timeout: 20000 });
    await R('button', { name: new RegExp(`^Reading, 20 minutes\\. .+\\. ${mia.stars} stars$`) }).waitFor();
    // A grown-up's tick for today, the same way.
    const phones = () => R('checkbox', { name: 'Phones off the table at dinner, today' });
    const off = (await phones().getAttribute('aria-checked')) === 'true';
    await phones().click();
    await R('checkbox', { name: 'Phones off the table at dinner, today', checked: !off }).waitFor({ timeout: 20000 });
    await phones().click();
    await R('checkbox', { name: 'Phones off the table at dinner, today', checked: off }).waitFor({ timeout: 20000 });

    // A chart, opened: its week to tick in. Then last week, and back.
    await R('button', { name: /^Phones off the table at dinner\. Everyone · / }).click();
    await R('heading', { name: 'Phones off the table at dinner' }).waitFor();
    await R('checkbox', { name: 'Phones off the table at dinner, Monday' }).waitFor();
    await R('button', { name: 'Take the chart down' }).waitFor();
    await shot('habits-chart');
    await closeSheet(ctx);
    await R('heading', { name: 'Phones off the table at dinner' }).waitFor({ state: 'detached' });
    await more().click();
    await R('button', { name: 'Last week' }).click();
    await T(/^\d+( \w+)? to \d+ \w+$/).waitFor({ timeout: 20000 });
    await shot('habits-last-week');
    await more().click();
    await R('button', { name: 'Back to this week' }).click();
    await T(/^\d+( \w+)? to \d+ \w+$/).waitFor({ state: 'detached', timeout: 20000 });
  });

  await step('habits-new', async () => {
    await startFromGallery(/^Habit charts\. Does work/);
    await R('heading', { name: 'No charts yet' }).waitFor({ timeout: 20000 });
    const teeth = `Teeth ${tag}`;
    await R('button', { name: 'Add a chart' }).click();
    await L('What it is called').fill(teeth);
    await R('radio', { name: 'Bath' }).click();
    await R('checkbox', { name: 'Everyone', checked: true }).waitFor();
    await R('checkbox', { name: 'Mia', exact: true }).click();
    await R('radio', { name: 'Morning and evening' }).click();
    // Every day but the one furthest from today, so today is always one of its days.
    const dayOff = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3).toLocaleDateString('en-GB', { weekday: 'long' });
    await R('checkbox', { name: dayOff }).click();
    await shot('habits-add');
    await R('button', { name: 'Start the chart' }).click();
    // One child's chart earns stars: it is a card with her picture, two rows, and no star yet.
    await R('button', { name: new RegExp(`^${escaped(teeth)}\\. Mia · 0 of \\d+ so far this week\\. 0 stars$`) }).waitFor({ timeout: 20000 });
    await R('checkbox', { name: `Morning, ${weekday}`, checked: false }).click();
    await R('checkbox', { name: `Morning, ${weekday}`, checked: true }).waitFor({ timeout: 20000 });
    await R('button', { name: new RegExp(`^${escaped(teeth)}\\. Mia · 1 of \\d+ so far this week\\. 1 star$`) }).waitFor();
    if ((await R('checkbox', { name: `Morning, ${dayOff}` }).getAttribute('aria-disabled')) !== 'true') throw new Error("a chart can be ticked on a day it isn't on");
    await shot('habits-new');
    // Taken down: the board is empty again.
    await R('button', { name: new RegExp(`^${escaped(teeth)}\\. `) }).click();
    await T('The stars earned on it stay earned.').waitFor();
    await R('button', { name: 'Take the chart down' }).click();
    await R('heading', { name: 'No charts yet' }).waitFor({ timeout: 20000 });
  });

  await step('perks-end', async () => {
    // What this run started goes with it; Sam's phone is put away and the account deleted.
    for (const id of made) await asNora('DELETE', `/v1/things/${id}`).catch(() => undefined);
    await sam.close();
    await page.goto(WEB_URL + '/');
    await R('tab', { name: 'Home' }).waitFor({ timeout: 20000 });
    await ctx.signOut();
  });
};
