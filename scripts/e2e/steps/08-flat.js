// Milestone 8, for housemates: the kitty (and its chips on Today), a fairer split, heads-up, heard in the
// kitchen, the guest book with its page at the door, and everyone who's lived here. The flat is Trubarjeva
// 9, seen on Kai's phone. Nobody is in charge in a flat, so the three things that depend on the others are
// walked as two people, with Lea on a second phone and Lena through the API: a split counts only when
// everyone agreed, a heads-up is answered by each person, and a guest's line waits until a flatmate lets it in.
//
// It can be run again and again on the same data: what an earlier run left is taken back through the API
// first, and every step takes back what it changed in the sample boards or works on a board it started itself.
const path = require('path');
const { randomUUID } = require('crypto');
const { VIEWPORT } = require('../lib');

exports.run = async function run(ctx) {
  const { page, T, R, L, shot, step, tag, API_URL, WEB_URL, IMG, CODE } = ctx;
  let kai;
  let leaToken;
  let lenaToken;
  let flat;
  let lea;
  const as = (token) => (method, address, body) => ctx.api(token, method, address, body);
  const asKai = (method, address, body) => ctx.api(kai, method, address, body);
  const act = (token, boardId, verb, body) => ctx.api(token, 'POST', `/v1/boards/${boardId}/act`, { verb, body });
  /** Puts the sheet that is up away, the way a person does: by tapping the dimmed page above it. */
  const closeSheet = (phone) => phone.R('button', { name: 'Close', exact: true }).click({ position: { x: 24, y: 24 } });
  const more = () => R('button', { name: 'More', exact: true });
  const idInAddress = (address) => address.match(/\/board\/([0-9a-f-]{36})/)[1];
  const boardsOf = async (template) => (await asKai('GET', `/v1/circles/${flat.id}/boards?template=${template}&limit=50`)).items;
  const whole = (id, token = kai) => ctx.api(token, 'GET', `/v1/boards/${id}`);
  /**
   * The sample board of a template (the one the API started the flat with), by what only it has. Any other
   * board of that template was started by an earlier run that didn't finish: it is deleted.
   */
  const sampleBoard = async (template, isSample) => {
    let sample;
    for (const card of await boardsOf(template)) {
      const board = await whole(card.id);
      if (!sample && isSample(board)) sample = board;
      else await asKai('DELETE', `/v1/things/${card.id}`);
    }
    if (!sample) throw new Error(`the flat has no sample board for ${template}`);
    return sample;
  };
  /**
   * A flat's gallery opens on its own fifteen, the three keepsakes among them. The kitty, a fairer split and
   * Heads-up stand on the "Fair and fun" shelf.
   */
  const onShelf = async (card) => {
    await R('heading', { name: 'Templates' }).waitFor({ timeout: 20000 });
    if (/kitty|fairer split|Heads-up/.test(String(card))) await R('button', { name: 'Fair and fun', exact: true }).click();
  };
  /** From the gallery: a template's card, and the board of it the flat has already. */
  const openFromGallery = async (card, row) => {
    await page.goto(WEB_URL + '/templates');
    await onShelf(card);
    await R('button', { name: card }).click();
    await T('In Trubarjeva 9 already').waitFor();
    await R('button', { name: row }).click();
  };
  /** From the gallery: a template's card, and another board of it, started now. Answers the new board's id. */
  const startAnother = async (card, heading) => {
    await page.goto(WEB_URL + '/templates');
    await onShelf(card);
    await R('button', { name: card }).click();
    await T('In Trubarjeva 9 already').waitFor();
    await R('button', { name: 'Start another' }).click();
    await page.waitForURL(/\/board\/[0-9a-f-]{36}/, { timeout: 20000 });
    await R('heading', { name: heading }).waitFor({ timeout: 20000 });
    return idInAddress(page.url());
  };
  /** The circle Kai's phone shows: the flat for these steps, and the one it was on before again at the end. */
  const switchTo = async (name, line) => {
    await R('tab', { name: 'Home' }).click();
    if (await page.getByRole('button', { name: `${name}. Change circle` }).count()) return;
    await R('button', { name: /Change circle$/ }).click();
    await R('button', { name: line }).click();
    await R('button', { name: `${name}. Change circle` }).waitFor({ timeout: 20000 });
  };
  /**
   * Lea's phone: a second browser, signed in as the sample person she is (not a new person: a fourth
   * flatmate would change what "everyone agreed" means). Her boards are opened by their address.
   */
  const phoneOf = async (email, who) => {
    const context = await ctx.browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: ctx.scheme, permissions: ['clipboard-read', 'clipboard-write'] });
    const theirs = await context.newPage();
    theirs.on('pageerror', (e) => ctx.errors.push(`pageerror (${who}): ${e.message}`));
    theirs.on('console', (m) => (m.type() === 'error' ? ctx.errors.push(`console (${who}): ${m.text().slice(0, 300)}`) : undefined));
    theirs.on('response', (r) => (r.status() >= 400 && r.url().startsWith(API_URL) ? ctx.errors.push(`http ${r.status()} ${r.request().method()} ${r.url()} (${who})`) : undefined));
    const phone = { page: theirs, T: (...a) => theirs.getByText(...a).last(), R: (...a) => theirs.getByRole(...a).last(), L: (...a) => theirs.getByLabel(...a).last() };
    await theirs.goto(WEB_URL + '/');
    await phone.T('Get started').waitFor({ timeout: 30000 });
    await phone.R('button', { name: 'I already have an account' }).click();
    await phone.R('button', { name: 'Continue with email' }).click();
    await phone.L('Email', { exact: true }).fill(email);
    await phone.R('button', { name: 'Send code' }).click();
    await phone.T('Check your email').waitFor();
    await phone.L('6-digit code').fill(CODE);
    await phone.R('tab', { name: 'Home' }).waitFor({ timeout: 20000 });
    phone.shot = async (name) => {
      await theirs.waitForTimeout(900);
      await theirs.screenshot({ path: `${ctx.out}/${ctx.scheme}-${who}-${name}.png` });
      console.log('shot', `${who}-${name}`, theirs.url());
    };
    phone.close = () => context.close();
    return phone;
  };
  /**
   * Types into the box at the end of a page. A sheet that has just slid away hands the keyboard back a moment
   * later, and what is typed in that moment goes nowhere: so what was typed is checked, and typed again if it
   * didn't arrive.
   */
  const typeInto = async (label, text) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await L(label).fill(text);
      await page.waitForTimeout(250);
      if ((await L(label).inputValue()) === text) return;
    }
    throw new Error(`what was typed into "${label}" did not arrive`);
  };
  /** The share each slider stands at, in whole cents, read from what a screen reader is told. */
  const shares = async (phone, names) => Promise.all(names.map(async (name) => Math.round(Number((await phone.R('slider', { name }).getAttribute('aria-valuetext')).replace(/[^0-9.]/g, '')) * 100)));
  /** Drags a slider sideways by so many points, the way a finger does. */
  const drag = async (name, by) => {
    const box = await R('slider', { name }).boundingBox();
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + by / 3, y, { steps: 3 });
    await page.mouse.move(x + by, y + 1, { steps: 6 });
    await page.mouse.up();
  };

  let kitty;
  await step('kitty', async () => {
    await ctx.signIn('kai@example.com');
    const token = async (email) => (await ctx.api(null, 'POST', '/local-auth/token', { email, code: CODE })).accessToken;
    [kai, leaToken, lenaToken] = [await token('kai@example.com'), await token('lea@example.com'), await token('lena@example.com')];
    flat = (await asKai('GET', '/v1/circles')).find((circle) => circle.kind === 'flat');
    await switchTo('Trubarjeva 9', /^Trubarjeva 9\. Housemates/);

    // What an earlier run left in the sample kitty is taken back: its own things and lines, and which things are running low.
    kitty = await sampleBoard('kitty', (board) => board.view.leftOverCents !== 0);
    for (const item of kitty.view.items) {
      if (item.name.startsWith('Walk-through')) await asKai('DELETE', `/v1/board-entries/${item.id}`);
      else if (item.low !== (item.name === 'Loo roll')) await act(kai, kitty.id, 'low', { itemId: item.id, low: item.name === 'Loo roll' });
    }
    for (const line of kitty.view.lines) if (line.title.startsWith('Walk-through')) await asKai('DELETE', `/v1/board-entries/${line.id}`);

    await openFromGallery(/^The kitty\. Does work/, /^The kitty\. €6\.40 left/);
    await R('heading', { name: 'The kitty', exact: true }).waitFor({ timeout: 20000 });
    await R('button', { name: /^Seen by: The flat/ }).waitFor();
    // What the pot holds, who hasn't paid in, the usual things, whose turn it is, and the month in and out.
    await R('heading', { name: 'The kitty holds €6.40' }).waitFor();
    await T("€10 each on the 1st · Lena hasn't paid in yet").waitFor();
    await T('Running low? Tap it').waitFor();
    await R('checkbox', { name: 'Loo roll', checked: true }).waitFor();
    for (const thing of ['Bin bags', 'Oil', 'Dish soap', 'Coffee']) await R('checkbox', { name: thing, checked: false }).waitFor();
    await T("It's Lena's turn to shop").waitFor();
    await R('button', { name: /^Loo roll, bin bags\. Lea · .+ · receipt kept\. −€8\.90$/ }).waitFor();
    await R('button', { name: /^Olive oil, salt, sponges\. You · .+\. −€14\.70$/ }).waitFor();
    await R('button', { name: 'Paid in for November. You and Lea. +€20.00' }).or(R('button', { name: /^Paid in for \w+\. You and Lea\. \+€20\.00$/ })).waitFor();
    await R('button', { name: /^Left over from \w+\. €10\.00\./ }).waitFor();
    // Kai has paid in and it isn't his turn to shop: nothing on the page asks him for anything.
    if (await page.getByRole('button', { name: /^Pay in €10/ }).count()) throw new Error('the kitty asks Kai to pay in again');
    await shot('kitty');
  });

  await step('kitty-low-as-two', async () => {
    // Kai taps what is running low; it is the API's own, so Lea finds it ticked on her phone, and unticks it.
    await R('checkbox', { name: 'Bin bags' }).click();
    await R('checkbox', { name: 'Bin bags', checked: true }).waitFor({ timeout: 20000 });
    if (!(await whole(kitty.id, leaToken)).view.items.find((item) => item.name === 'Bin bags').low) throw new Error('what Kai marked as running low is not running low for Lea');
    lea = await phoneOf('lea@example.com', 'lea');
    await lea.page.goto(`${WEB_URL}/board/${kitty.id}`);
    await lea.R('heading', { name: 'The kitty', exact: true }).waitFor({ timeout: 20000 });
    await lea.R('checkbox', { name: 'Bin bags', checked: true }).waitFor();
    // On her phone she is the one who is "You".
    await lea.R('button', { name: /^Paid in for \w+\. You and Kai\. \+€20\.00$/ }).waitFor();
    await lea.shot('kitty');
    await lea.R('checkbox', { name: 'Bin bags' }).click();
    await lea.R('checkbox', { name: 'Bin bags', checked: false }).waitFor({ timeout: 20000 });
    await page.reload();
    await R('checkbox', { name: 'Bin bags', checked: false }).waitFor({ timeout: 20000 });
    await R('checkbox', { name: 'Loo roll', checked: true }).waitFor();
  });

  await step('kitty-lines', async () => {
    // A purchase opens with its receipt; someone else's can't be taken out.
    await R('button', { name: /^Loo roll, bin bags\./ }).click();
    await R('img', { name: 'The receipt' }).waitFor();
    if (await page.getByRole('button', { name: 'Take it out', exact: true }).count()) throw new Error("Kai could take Lea's purchase out of the kitty");
    await shot('kitty-receipt');
    await closeSheet(ctx);
    await R('img', { name: 'The receipt' }).waitFor({ state: 'detached' });
    // The months before this one are read from the list.
    await R('button', { name: /^Left over from \w+\./ }).click();
    await R('heading', { name: 'In and out, all of it' }).waitFor();
    await T('Dish soap, sponges, washing powder').waitFor({ timeout: 20000 });
    await shot('kitty-all');
    await closeSheet(ctx);
    await R('heading', { name: 'In and out, all of it' }).waitFor({ state: 'detached' });
  });

  await step('kitty-new', async () => {
    // A kitty started from the gallery: nobody has paid in, and the first turn to shop is the first flatmate's.
    const id = await startAnother(/^The kitty\. Does work/, 'The kitty');
    await R('heading', { name: 'The kitty holds €0.00' }).waitFor();
    await T("€10 each on the 1st · You, Lea and Lena haven't paid in yet").waitFor();
    await T("It's your turn to shop").waitFor();
    await T(/^Nothing in or out yet in \w+\.$/).waitFor();
    await shot('kitty-new');
    // Paying in.
    await R('button', { name: /^Pay in €10 for \w+$/ }).click();
    await R('heading', { name: 'The kitty holds €10.00' }).waitFor({ timeout: 20000 });
    await T("€10 each on the 1st · Lea and Lena haven't paid in yet").waitFor();
    await R('button', { name: /^Paid in for \w+\. You\. \+€10\.00$/ }).waitFor();
    // What was bought, with a photo of the receipt (a picked file stands in for the camera) and what it covered.
    await R('checkbox', { name: 'Oil' }).click();
    await R('checkbox', { name: 'Oil', checked: true }).waitFor({ timeout: 20000 });
    await R('button', { name: "I've shopped" }).click();
    await R('heading', { name: 'What was bought?' }).waitFor();
    await L('What', { exact: true }).fill(`Walk-through oil ${tag}`);
    await L('What it cost').fill('3,20');
    const [receipts] = await Promise.all([page.waitForEvent('filechooser'), R('button', { name: 'Add a photo of the receipt' }).click()]);
    await receipts.setFiles(path.join(IMG, 'coffee-receipt.jpg'));
    await R('button', { name: 'Change the photo' }).waitFor();
    await shot('kitty-bought');
    await R('button', { name: 'Take it out of the kitty' }).click();
    await R('heading', { name: 'The kitty holds €6.80' }).waitFor({ timeout: 30000 });
    await R('button', { name: new RegExp(`^Walk-through oil ${tag}\\. You · today · receipt kept\\. −€3\\.20$`) }).waitFor();
    // It bought the oil, so that isn't running low any more; and the turn to shop has moved on.
    await R('checkbox', { name: 'Oil', checked: false }).waitFor();
    await T("It's Lea's turn to shop").waitFor();
    // The usual things: one more, and off again.
    await more().click();
    await R('button', { name: 'The usual things' }).click();
    await L('One more').fill('Walk-through tea');
    await R('button', { name: 'Add it' }).click();
    await R('button', { name: 'Take Walk-through tea off' }).waitFor({ timeout: 20000 });
    await shot('kitty-usual');
    await R('button', { name: 'Take Walk-through tea off' }).click();
    await R('button', { name: 'Take Walk-through tea off' }).waitFor({ state: 'detached', timeout: 20000 });
    await closeSheet(ctx);
    // What each pays in.
    await more().click();
    await R('button', { name: 'What each pays in' }).click();
    await L('Each pays in, every month').fill('12.50');
    await R('button', { name: 'Save' }).click();
    await T(/^€12\.50 each on the 1st · /).waitFor({ timeout: 20000 });
    // Kai's own lines are his to take back.
    await R('button', { name: /^Walk-through oil/ }).click();
    await R('button', { name: 'Take it out', exact: true }).click();
    await R('heading', { name: 'The kitty holds €10.00' }).waitFor({ timeout: 20000 });
    await R('button', { name: /^Paid in for \w+\. You\./ }).click();
    await R('button', { name: 'Take mine back' }).click();
    await R('heading', { name: 'The kitty holds €0.00' }).waitFor({ timeout: 20000 });
    // The board's own More: it is deleted from there, after asking.
    await more().click();
    await R('button', { name: 'Delete', exact: true }).click();
    await R('button', { name: 'Delete it' }).click();
    await R('tab', { name: 'Home' }).waitFor({ timeout: 20000 });
    if ((await boardsOf('kitty')).some((board) => board.id === id)) throw new Error('the kitty that was deleted is still there');
  });

  let split;
  const RENT = ['Your share of rent', "Lea's share of rent", "Lena's share of rent"];
  const rentOf = (board) => board.view.splits.find((one) => one.name === 'Rent');
  await step('fair-split', async () => {
    split = await sampleBoard('fairer_split', (board) => board.title === 'How we split');
    // A proposal an earlier run left waiting is taken back by whoever made it, and Kai's tick on the bill.
    for (const one of split.view.splits) {
      if (one.proposed) await ctx.api(one.proposed.proposedBy.name === 'Lea' ? leaToken : one.proposed.proposedBy.name === 'Lena' ? lenaToken : kai, 'DELETE', `/v1/board-entries/${one.proposed.id}`);
      if (!one.repeats && one.agreed) await act(kai, split.id, 'paid', { splitId: one.id, paid: false });
    }
    await openFromGallery(/^A fairer split\. Does work/, /^How we split\. 3 splits agreed/);
    await R('heading', { name: 'How we split' }).waitFor({ timeout: 20000 });
    await R('radio', { name: 'Rent', checked: true }).waitFor();
    for (const tab of ['Bills', 'Kitty']) await R('radio', { name: tab, checked: false }).waitFor();
    // A slider each, by room size; the total; and since when it counts.
    await T('You · 18 m², the big room').waitFor();
    await T('Lea · 14 m²').waitFor();
    await T('Lena · 11 m², facing the street').waitFor();
    if ((await shares(ctx, RENT)).join() !== '37200,31000,26800') throw new Error(`the rent is split ${await shares(ctx, RENT)}`);
    await T('The rent', { exact: true }).waitFor();
    await T('€950', { exact: true }).waitFor();
    await T(/^Agreed by all three on 1 September/).waitFor();
    await T('Drag a slider and the others move to keep the total. It counts once everyone says yes.').waitFor();
    // Under the rent, the newest bill as bars: the largest share first.
    await R('button', { name: "October's electricity, by nights at home. Lea €70. You €61. Lena €28" }).or(R('button', { name: /electricity, by nights at home\. Lea €70\. You €61\. Lena €28$/ })).waitFor();
    await shot('fair-split');
  });

  await step('fair-split-as-three', async () => {
    // Kai drags his slider: the others move to keep the total, and nothing counts or is even sent yet.
    await drag('Your share of rent', 44);
    await T('Not proposed yet').waitFor();
    const dragged = await shares(ctx, RENT);
    if (dragged[0] <= 37200 || dragged[1] >= 31000 || dragged[2] >= 26800) throw new Error(`dragging Kai's slider to the right gave ${dragged}`);
    if (dragged.reduce((sum, one) => sum + one, 0) !== 95000) throw new Error(`the dragged shares add up to ${dragged.reduce((sum, one) => sum + one, 0)}, not to the rent`);
    if (rentOf(await whole(split.id)).proposed) throw new Error('dragging a slider proposed a split by itself');
    await shot('fair-split-dragged');
    // Proposing asks everyone. Until they have all said yes, the split agreed before is the one that counts.
    await R('button', { name: 'Propose this split' }).click();
    await T('You proposed this').waitFor({ timeout: 20000 });
    await T('Waiting for a yes from Lea and Lena. Until everyone says yes, the split agreed on 1 September counts: You €372, Lea €310, Lena €268.').waitFor();
    await shot('fair-split-proposed');
    const proposed = rentOf(await whole(split.id, lenaToken));
    if (proposed.agreed.shares.map((share) => share.cents).join() !== '37200,31000,26800') throw new Error('a split that was only proposed already counts');
    if (!proposed.proposed.needsYou || proposed.proposed.shares.map((share) => share.cents).join() !== dragged.join()) throw new Error("Lena isn't asked about Kai's proposal as he made it");

    // Lea is asked on her phone, and says yes. It still waits for Lena, so it still doesn't count.
    await lea.page.goto(`${WEB_URL}/board/${split.id}`);
    await lea.R('heading', { name: 'How we split' }).waitFor({ timeout: 20000 });
    await lea.T('Kai proposed this').waitFor();
    await lea.T(/^Waiting for a yes from you and Lena\. Until everyone says yes, the split agreed on 1 September counts: Kai €372, You €310, Lena €268\.$/).waitFor();
    if ((await shares(lea, ["Kai's share of rent", 'Your share of rent', "Lena's share of rent"])).join() !== dragged.join()) throw new Error("Lea doesn't see the numbers Kai proposed");
    await lea.shot('fair-split-asked');
    await lea.R('button', { name: 'Say yes' }).click();
    await lea.T(/^Waiting for a yes from Lena\./).waitFor({ timeout: 20000 });
    const twoOfThree = rentOf(await whole(split.id));
    if (twoOfThree.agreed.shares[0].cents !== 37200 || twoOfThree.proposed.waitingFor.map((person) => person.name).join() !== 'Lena') throw new Error('two of three saying yes made the split count');

    // Kai takes it back: the split from 1 September stands as it stood.
    await page.reload();
    await T(/^Waiting for a yes from Lena\./).waitFor({ timeout: 20000 });
    await R('button', { name: 'Take it back' }).click();
    await T(/^Agreed by all three on 1 September/).waitFor({ timeout: 20000 });
    if ((await shares(ctx, RENT)).join() !== '37200,31000,26800') throw new Error('taking the proposal back did not bring the agreed split back');
    // Dragged numbers that aren't wanted are put back with a tap.
    await drag("Lena's share of rent", -30);
    await R('button', { name: 'Put it back' }).click();
    await T(/^Agreed by all three on 1 September/).waitFor();
  });

  await step('fair-split-bill', async () => {
    // A bill that is paid once: the exact shares, who paid it, and a tick each for a share that is paid.
    await R('radio', { name: 'Bills' }).click();
    await R('radio', { name: 'Bills', checked: true }).waitFor();
    await R('button', { name: /electricity, by nights at home\./ }).click();
    await T(/^€159\.00 · .+ · Lea paid it$/).waitFor();
    await T('€60.79 · 26 nights').waitFor();
    await R('checkbox', { name: 'Lea has paid', checked: true }).waitFor();
    await R('checkbox', { name: 'You have paid', checked: false }).waitFor();
    await shot('fair-split-bill');
    await R('button', { name: "I've paid my €60.79" }).click();
    await R('checkbox', { name: 'You have paid', checked: true }).waitFor({ timeout: 20000 });
    // Only Kai's own tick is his: Lena's isn't, and Lea's is paid by her having paid the bill.
    if ((await R('checkbox', { name: 'Lena has paid' }).getAttribute('aria-disabled')) !== 'true') throw new Error("Kai could tick Lena's share as paid");
    // Lea paid the bill, so on her phone she can tick for Lena, and untick again.
    await lea.page.goto(`${WEB_URL}/board/${split.id}`);
    await lea.R('button', { name: /electricity, by nights at home\. You €70\. Kai €61\. Lena €28$/ }).click();
    await lea.R('checkbox', { name: 'Kai has paid', checked: true }).waitFor({ timeout: 20000 });
    await lea.R('checkbox', { name: 'Lena has paid' }).click();
    await lea.R('checkbox', { name: 'Lena has paid', checked: true }).waitFor({ timeout: 20000 });
    await lea.T('Every share is paid. This one is settled.').waitFor();
    await lea.shot('fair-split-settled');
    await lea.R('checkbox', { name: 'Lena has paid' }).click();
    await lea.R('checkbox', { name: 'Lena has paid', checked: false }).waitFor({ timeout: 20000 });
    // Kai unticks his own, so the next run finds the bill as it was.
    await R('checkbox', { name: 'You have paid' }).click();
    await R('checkbox', { name: 'You have paid', checked: false }).waitFor({ timeout: 20000 });
    await closeSheet(ctx);
    // The kitty's tab has its own sliders: €10 each.
    await R('radio', { name: 'Kitty' }).click();
    if ((await shares(ctx, ['Your share of the kitty', "Lea's share of the kitty", "Lena's share of the kitty"])).join() !== '1000,1000,1000') throw new Error('the kitty is not split €10 each');
    await T('€30', { exact: true }).waitFor();
    await shot('fair-split-kitty');
  });

  await step('fair-split-new', async () => {
    // A board started from the gallery has nothing under any tab; a split is added as its first proposal.
    const id = await startAnother(/^A fairer split\. Does work/, 'A fairer split');
    await T("The rent isn't split here yet.").waitFor();
    await R('button', { name: 'Split something new' }).click();
    await R('heading', { name: 'Split something new' }).waitFor();
    await L('What is it?').fill('Rent');
    await L('How much is there to split?').fill('900');
    // Opened under Rent, it goes by room size: each room and the shared space.
    await L('Your room, in m²').fill('18');
    await L("Lea's room, in m²").fill('14');
    await L("Lena's room, in m²").fill('11');
    await L('The shared space, in m²').fill('20');
    await shot('fair-split-add');
    await R('button', { name: 'Propose it' }).click();
    await T('You proposed this').waitFor({ timeout: 20000 });
    await T('Waiting for a yes from Lea and Lena. It counts once everyone says yes.').waitFor();
    // The API worked the shares out by room size, and they add up to the rent.
    const byRoom = await shares(ctx, RENT);
    if (byRoom.reduce((sum, one) => sum + one, 0) !== 90000 || !(byRoom[0] > byRoom[1] && byRoom[1] > byRoom[2])) throw new Error(`by room size the rent came out as ${byRoom}`);
    // Lea says yes on her phone, Lena through the API: with everyone's yes it counts, and says since when.
    await lea.page.goto(`${WEB_URL}/board/${id}`);
    await lea.R('button', { name: 'Say yes' }).click();
    await lea.T(/^Waiting for a yes from Lena\./).waitFor({ timeout: 20000 });
    const rent = rentOf(await whole(id, lenaToken));
    await act(lenaToken, id, 'agree', { proposalId: rent.proposed.id });
    await page.reload();
    await T(/^Agreed by all three on \d+ \w+$/).waitFor({ timeout: 20000 });
    await shot('fair-split-new');
    // A bill, split equally, that Kai paid: bars on the Bills tab, waiting for the others' yes.
    await more().click();
    await R('button', { name: 'Split something new' }).click();
    await L('What is it?').fill('Internet');
    await L('How much is there to split?').fill('29,97');
    await R('radio', { name: 'Bills' }).click();
    await R('button', { name: 'Equally' }).click();
    await R('button', { name: 'Kai', exact: true }).click();
    await R('button', { name: 'Propose it' }).click();
    await R('radio', { name: 'Bills', checked: true }).waitFor({ timeout: 20000 });
    await R('button', { name: 'Internet, split equally. You €10. Lea €10. Lena €10' }).waitFor({ timeout: 20000 });
    await T('Proposed, and waiting for a yes. Tap to see.').waitFor();
    await shot('fair-split-new-bill');
    await asKai('DELETE', `/v1/things/${id}`);
  });

  let headsUp;
  await step('heads-up', async () => {
    headsUp = await sampleBoard('heads_up', (board) => board.view.earlier > 0);
    // What an earlier run left: its own notices, and Kai's answer to Lea's Saturday.
    for (const notice of headsUp.view.notices) {
      if (notice.text.startsWith('Walk-through')) await asKai('DELETE', `/v1/board-entries/${notice.id}`);
      else if (!notice.mine && notice.text.startsWith('Six people over') && notice.yourAnswer) await act(kai, headsUp.id, 'answer', { noticeId: notice.id, says: null });
    }
    await openFromGallery(/^Heads-up\. Does work/, /^Heads-up\. 3 notices/);
    await R('heading', { name: 'Heads-up' }).waitFor({ timeout: 20000 });
    // Lea's Saturday waits for Kai: Lena has said fine, and the two buttons are his.
    await R('button', { name: /^Six people over on Saturday, done by midnight\. Lea · .+\. Waits for your answer$/ }).waitFor();
    await T("Lena's fine").waitFor();
    // Lena's sister: everyone said fine. Kai's own week away: Lea's words with her yes; nobody answers their own.
    await T('Lena · on the sofa').waitFor();
    await T('You and Lea said fine').waitFor();
    await T(/^You · 7 nights off your bills$/).waitFor();
    await T('Lea will water the plants').waitFor();
    if ((await page.getByRole('button', { name: 'Fine by me' }).count()) !== 1) throw new Error('Heads-up asks Kai for more than the one answer that is his to give');
    await T('Quiet after 23:00 on weeknights').waitFor();
    await T('From the House rules, agreed by all three.').waitFor();
    await L('Tell the flat something').waitFor();
    await shot('heads-up');
  });

  await step('heads-up-answer', async () => {
    const saturday = /^Six people over on Saturday/;
    // One tap says it's fine; the answer is Kai's own, to change or take back.
    await R('button', { name: 'Fine by me' }).click();
    await R('button', { name: 'You and Lena said fine. Change your answer' }).waitFor({ timeout: 20000 });
    if (await page.getByRole('button', { name: 'Fine by me' }).count()) throw new Error('a notice Kai answered still asks him');
    await R('button', { name: 'You and Lena said fine. Change your answer' }).click();
    await R('radio', { name: 'Fine by me', checked: true }).waitFor();
    // Let's talk, with a few words.
    await R('radio', { name: "Let's talk" }).click();
    await L('A few words with it, if you like').fill('Can we keep it to ten?');
    await shot('heads-up-answer');
    await R('button', { name: 'Send my answer' }).click();
    await T('You want to talk: Can we keep it to ten?').waitFor({ timeout: 20000 });
    await shot('heads-up-talk');
    // Lea, who wrote it, sees that on her phone; she can't answer her own notice.
    await lea.page.goto(`${WEB_URL}/board/${headsUp.id}`);
    await lea.T('Kai wants to talk: Can we keep it to ten?').waitFor({ timeout: 20000 });
    await lea.R('button', { name: saturday }).click();
    await lea.T("Let's talk first · Can we keep it to ten?").waitFor();
    if (await lea.page.getByRole('button', { name: 'Send my answer' }).count()) throw new Error('Lea could answer her own notice');
    await lea.shot('heads-up-answers');
    await closeSheet(lea);
    // Kai takes his answer back: the notice waits for him again, as the next run expects.
    await R('button', { name: 'You want to talk: Can we keep it to ten?. Change your answer' }).click();
    await R('button', { name: 'Take my answer back' }).click();
    await R('button', { name: 'Fine by me' }).waitFor({ timeout: 20000 });
    // (A sheet that is sliding away still holds the keyboard: the next step types once it is gone.)
    await R('button', { name: 'Take my answer back' }).waitFor({ state: 'detached' });
  });

  await step('heads-up-tell', async () => {
    // One line from the box at the end. Each of the others answers it for themselves.
    const line = `Walk-through: the plumber comes on Thursday (${tag})`;
    await typeInto('Tell the flat something', line);
    await R('button', { name: 'Add', exact: true }).click();
    await R('button', { name: new RegExp(`^Walk-through: the plumber comes on Thursday \\(${tag}\\)\\. You · just now$`) }).waitFor({ timeout: 20000 });
    const told = async (token) => (await whole(headsUp.id, token)).view.notices.find((notice) => notice.text === line);
    if (!(await told(leaToken)).needsYou || !(await told(lenaToken)).needsYou || (await told(kai)).needsYou) throw new Error('a new notice does not wait for exactly the others');
    // Lea says fine on her phone. That is her answer, not Lena's: the notice still waits for Lena.
    await lea.page.reload();
    await lea.R('button', { name: new RegExp(`^Walk-through: the plumber.+Kai · .+\\. Waits for your answer$`) }).waitFor({ timeout: 20000 });
    await lea.R('button', { name: 'Fine by me' }).click();
    await lea.R('button', { name: 'You said fine. Change your answer' }).waitFor({ timeout: 20000 });
    const afterLea = await told(kai);
    if (afterLea.everyoneFine || afterLea.waitingFor.map((person) => person.name).join() !== 'Lena') throw new Error("Lea's answer counted for Lena too");
    await page.reload();
    await T("Lea's fine").waitFor({ timeout: 20000 });
    // Lena answers through the API with a few words; Kai opens his notice and sees both.
    await act(lenaToken, headsUp.id, 'answer', { noticeId: afterLea.id, says: 'fine', text: 'will let him in' });
    await page.reload();
    await T('Lena will let him in').waitFor({ timeout: 20000 });
    await R('button', { name: /^Walk-through: the plumber/ }).click();
    await T("It's fine · will let him in").waitFor();
    await shot('heads-up-notice');
    // Only whoever wrote a notice takes it down.
    await R('button', { name: 'Take it down' }).click();
    await R('button', { name: /^Walk-through: the plumber/ }).waitFor({ state: 'detached', timeout: 20000 });
    // The microphone is the phone's own dictation: in a browser the button says so.
    await R('button', { name: 'Say it out loud' }).click();
    await T('Saying it out loud arrives with the phone app. Until then, type the line.').waitFor();
    await R('button', { name: 'OK' }).click();
  });

  await step('heads-up-away', async () => {
    // The plus is the whole notice. Time away needs the day you leave and the day you're back: five nights off the bills.
    await R('button', { name: 'Write a notice' }).click();
    await R('heading', { name: 'Tell the flat', exact: true }).waitFor();
    await L('What do you want to tell the flat?').fill(`Walk-through: skiing (${tag})`);
    await R('radio', { name: "I'm away" }).click();
    if ((await R('button', { name: 'Tell the flat', exact: true }).getAttribute('aria-disabled')) !== 'true') throw new Error('time away could be told without its days');
    await R('button', { name: 'The day you leave: No day. Change' }).click();
    await R('button', { name: 'Next month' }).click();
    await R('button', { name: /^10 / }).click();
    await R('button', { name: /^The day you leave: \w+ 10 / }).waitFor();
    await R('button', { name: "The day you're back: No day. Change" }).click();
    await R('button', { name: /^15 / }).click();
    await R('button', { name: /^The day you're back: \w+ 15 / }).waitFor();
    await shot('heads-up-write');
    await R('button', { name: 'Tell the flat', exact: true }).click();
    await R('button', { name: new RegExp(`^Walk-through: skiing \\(${tag}\\)\\. You · 5 nights off your bills$`) }).waitFor({ timeout: 20000 });
    await R('button', { name: /^Walk-through: skiing/ }).click();
    await R('button', { name: 'Take it down' }).click();
    await R('button', { name: /^Walk-through: skiing/ }).waitFor({ state: 'detached', timeout: 20000 });
    // The notices that are over stay under More.
    await more().click();
    await R('button', { name: /^Earlier notices\. \d+ notices$/ }).click();
    await T("At my parents' for a while").waitFor({ timeout: 20000 });
    await shot('heads-up-earlier');
    await closeSheet(ctx);
  });

  await step('heads-up-new', async () => {
    // A board started from the gallery is empty; the line that always stands is its own setting.
    const id = await startAnother(/^Heads-up\. Does work/, 'Heads-up');
    await T('Nothing to tell just now').waitFor();
    await more().click();
    await R('button', { name: 'The line that always stands' }).click();
    await L('The line', { exact: true }).fill('No shoes past the door');
    await L('A line under it').fill('Agreed at the flat meeting.');
    await R('button', { name: 'Save' }).click();
    await T('No shoes past the door').waitFor({ timeout: 20000 });
    await T('Agreed at the flat meeting.').waitFor();
    await shot('heads-up-new');
    await asKai('DELETE', `/v1/things/${id}`);
  });

  let heard;
  await step('heard', async () => {
    heard = await sampleBoard('heard', (board) => board.view.total > 50);
    for (const quote of (await asKai('GET', `/v1/boards/${heard.id}/entries?kind=quote&q=walk-through&limit=50`)).items) await asKai('DELETE', `/v1/board-entries/${quote.id}`);
    await openFromGallery(/^Heard in the kitchen\. Does work/, /^Heard in the kitchen\. \d+ lines/);
    await R('heading', { name: 'Heard in the kitchen' }).waitFor({ timeout: 20000 });
    await R('button', { name: 'All, 112' }).waitFor();
    for (const who of ['Lea', 'Lena', 'You']) await R('button', { name: who, exact: true }).waitFor();
    await T("“I'm not hungover. I'm buffering.”").waitFor();
    await T("“That's not mould. That's character.”").waitFor();
    await T('about the bathroom ceiling', { exact: false }).waitFor();
    await T('“Whose turn is it to have opinions about the heating?”').waitFor();
    await L('Who said what?').waitFor();
    await shot('heard');
    // One person's lines, and a search of the words: each is the API's own list.
    await R('button', { name: 'You', exact: true }).click();
    await T("“I'm not hungover. I'm buffering.”").waitFor({ state: 'detached', timeout: 20000 });
    await T("“That's not mould. That's character.”").waitFor();
    await R('button', { name: 'Search what was said' }).click();
    await L('Search what was said').fill('heating');
    await T('“Whose turn is it to have opinions about the heating?”').waitFor({ timeout: 20000 });
    await T("“That's not mould. That's character.”").waitFor({ state: 'detached' });
    await shot('heard-search');
    await R('button', { name: 'Close search' }).click();
    await R('button', { name: 'All, 112' }).click();
    await T("“I'm not hungover. I'm buffering.”").waitFor({ timeout: 20000 });
    // More holds who can see it, where the bar has no room for the chip.
    await more().click();
    await R('button', { name: /^Who can see this/ }).click();
    await T('Who can see this?').waitFor();
    await R('button', { name: 'Done' }).click();
    await T('Who can see this?').waitFor({ state: 'detached' });
  });

  await step('heard-add', async () => {
    const line = `The walk-through is the fourth flatmate (${tag}).`;
    // With everyone showing, the box asks who said it.
    await typeInto('Who said what?', line);
    await R('button', { name: 'Add', exact: true }).click();
    await R('heading', { name: 'Who said it?' }).waitFor();
    await shot('heard-who');
    await R('button', { name: 'Lena', exact: true }).click();
    await T(`“${line}”`).waitFor({ timeout: 20000 });
    await R('button', { name: 'All, 113' }).waitFor({ timeout: 20000 });
    await R('button', { name: new RegExp(`^“The walk-through is the fourth flatmate \\(${tag}\\)\\.”\\. Lena · today, \\d\\d:\\d\\d$`) }).waitFor();
    // It is there for Lea too, with who wrote it down.
    await lea.page.goto(`${WEB_URL}/board/${heard.id}`);
    await lea.R('button', { name: /^“The walk-through is the fourth flatmate/ }).click();
    await lea.T(/^Lena, on \d+ \w+ \d{4}\. Written down by Kai\.$/).waitFor({ timeout: 20000 });
    await closeSheet(lea);
    // A few words on what it was about, and out again.
    await R('button', { name: /^“The walk-through is the fourth flatmate/ }).click();
    await T(/^Lena, on \d+ \w+ \d{4}\. Written down by you\.$/).waitFor();
    await L('When, or what about').fill('about the test run');
    await R('button', { name: 'Save' }).click();
    await R('button', { name: new RegExp(`^“The walk-through is the fourth flatmate \\(${tag}\\)\\.”\\. Lena · about the test run$`) }).waitFor({ timeout: 20000 });
    await shot('heard-added');
    await R('button', { name: /^“The walk-through is the fourth flatmate/ }).click();
    await R('button', { name: 'Take it out', exact: true }).click();
    await R('button', { name: 'All, 112' }).waitFor({ timeout: 20000 });
    await R('button', { name: 'Take it out', exact: true }).waitFor({ state: 'detached' });
    // With one person's chip showing, a line is theirs without asking.
    await R('button', { name: 'Lea', exact: true }).click();
    await T("“I'm not hungover. I'm buffering.”").waitFor({ timeout: 20000 });
    await typeInto('Who said what?', `Walk-through: straight to Lea (${tag}).`);
    await R('button', { name: 'Add', exact: true }).click();
    await R('button', { name: new RegExp(`^“Walk-through: straight to Lea \\(${tag}\\)\\.”\\. Lea · today`) }).waitFor({ timeout: 20000 });
    await R('button', { name: /^“Walk-through: straight to Lea/ }).click();
    await R('button', { name: 'Take it out', exact: true }).click();
    await R('button', { name: /^“Walk-through: straight to Lea/ }).waitFor({ state: 'detached', timeout: 20000 });
    await R('button', { name: 'Say it out loud' }).click();
    await T('Saying it out loud arrives with the phone app. Until then, type what was said.').waitFor();
    await R('button', { name: 'OK' }).click();
  });

  await step('heard-new', async () => {
    // A new board: nothing written down, and the first line from someone who doesn't live here.
    const id = await startAnother(/^Heard in the kitchen\. Does work/, 'Heard in the kitchen');
    await T('Nothing written down yet').waitFor();
    await typeInto('Who said what?', 'Nice flat. Shame about the stairs.');
    await R('button', { name: 'Add', exact: true }).click();
    await L("Someone who doesn't live here").fill('The plumber');
    await R('button', { name: 'Write it down for them' }).click();
    await R('button', { name: /^“Nice flat\. Shame about the stairs\.”\. The plumber · today/ }).waitFor({ timeout: 20000 });
    await R('button', { name: 'All, 1' }).waitFor();
    await shot('heard-new');
    await asKai('DELETE', `/v1/things/${id}`);
  });

  let book;
  await step('guest-book', async () => {
    book = await sampleBoard('guest_book', (board) => board.view.guests > 10);
    // Lines an earlier run left at the door or in the book are taken away.
    for (const line of [...book.view.waiting, ...book.view.latest]) if (line.name.startsWith('Walk-through')) await asKai('DELETE', `/v1/board-entries/${line.id}`);
    await openFromGallery(/^The guest book\. Does work/, /^The guest book\. 23 guests/);
    await R('heading', { name: 'The guest book' }).waitFor({ timeout: 20000 });
    await T('The code by the door').waitFor();
    await T(/^23 guests and 61 nights on the sofa since \d{4}\.$/).waitFor();
    await R('button', { name: /^“Came for a weekend, stayed for the pancakes\.”\. Tom, from Leeds · 3 nights/ }).waitFor();
    await R('button', { name: /^“Best sofa in Ljubljana\. Sorry about the glass\.”\. Maja, Lena's sister · 2 nights/ }).waitFor();
    await R('button', { name: '“Thank you for New Year. I remember most of it.”. Ana · who used to live here' }).waitFor();
    await R('img', { name: "Tom's photo" }).waitFor();
    await shot('guest-book');
    // "Print" shows the code, drawn from the door's own link, with the link to copy.
    await R('button', { name: 'Print', exact: true }).click();
    await R('heading', { name: 'The code by the door' }).waitFor();
    await R('img', { name: 'The QR code that opens the guest book' }).waitFor();
    const modules = await R('img', { name: 'The QR code that opens the guest book' }).locator('path').getAttribute('d');
    // A link of this length is a 33-module code: more than a hundred dark bars, three corner squares among them.
    if ((modules.match(/M/g) || []).length < 100 || !modules.startsWith('M4 4h7v1h-7z')) throw new Error('the code by the door is not drawn as a QR code');
    await T(book.view.link.replace(/^https?:\/\//, '')).waitFor();
    await T('Scan to write in the guest book').waitFor();
    await shot('guest-book-code');
    // A browser prints the page; the walk-through only checks that it was asked to.
    await page.evaluate(() => {
      window.print = () => {
        window.printed = true;
      };
    });
    await R('button', { name: 'Print this page' }).click();
    if (!(await page.evaluate(() => window.printed))) throw new Error('"Print this page" did not ask the browser to print');
    await closeSheet(ctx);
    await R('heading', { name: 'The code by the door' }).waitFor({ state: 'detached' });
    // The button in the bar shares the link; a browser copies it and says so.
    await R('button', { name: 'Share the link' }).click();
    await T('Link copied').waitFor();
    if (!(await page.evaluate(() => navigator.clipboard.readText())).includes(book.view.link)) throw new Error("the door's link was not copied");
    await R('button', { name: 'OK' }).click();
  });

  await step('guest-book-door', async () => {
    const guest = `Walk-through ${tag} guest`;
    const line = `Lovely stairs. All ninety of them (${tag}).`;
    // A guest opens the page behind the code, with no account, and leaves a line and a photo.
    await ctx.webPage(book.view.link, 'Thank you', 'guest-book-door', async (web) => {
      await web.getByText('Leave a line for the people who live here.').waitFor();
      await web.getByText('“Came for a weekend, stayed for the pancakes.”').waitFor();
      await web.getByLabel('Your name').fill(guest);
      await web.getByLabel(/^Who you are to them/).fill('from the test run');
      await web.getByLabel('Your line').fill(line);
      await web.getByLabel(/^Nights you stayed/).fill('2');
      await web.getByLabel(/^A photo/).setInputFiles(path.join(IMG, 'mugs.jpg'));
      await web.getByRole('button', { name: 'Sign the book' }).click();
    });
    // It waits: not in the book, not counted, and not on the door's page for the next guest.
    const waiting = await whole(book.id);
    if (waiting.view.guests !== 23 || waiting.view.latest.some((one) => one.text === line) || !waiting.view.waiting.some((one) => one.text === line && one.photo)) throw new Error("a guest's line did not wait, with its photo, for a flatmate's yes");
    await ctx.webPage(book.view.link, 'From the book', 'guest-book-door-again', async (web) => {
      await web.getByText('“Came for a weekend, stayed for the pancakes.”').waitFor();
      if (await web.getByText(line).count()) throw new Error("the door's page shows a line nobody has let in");
    });
    // Every flatmate sees it waiting: Kai on his phone, Lea on hers.
    await page.reload();
    await T('Waiting at the door').waitFor({ timeout: 20000 });
    await T(`“${line}”`).waitFor();
    await T(new RegExp(`^${guest}, from the test run · 2 nights in \\w+$`)).waitFor();
    await R('img', { name: `${guest}'s photo` }).waitFor();
    await T(/^23 guests and 61 nights/).waitFor();
    await shot('guest-book-waiting');
    await lea.page.goto(`${WEB_URL}/board/${book.id}`);
    await lea.T('Waiting at the door').waitFor({ timeout: 20000 });
    await lea.T(`“${line}”`).waitFor();
    await lea.shot('guest-book-waiting');
    // Kai lets it in: it joins the book, is counted, and the next guest reads it at the door.
    await R('button', { name: `Let ${guest}'s line in` }).click();
    await T(/^24 guests and 63 nights/).waitFor({ timeout: 20000 });
    await T('Waiting at the door').waitFor({ state: 'detached' });
    await R('button', { name: new RegExp(`^“Lovely stairs\\. All ninety of them \\(${tag}\\)\\.”\\. ${guest}, from the test run · 2 nights in \\w+$`) }).waitFor();
    await shot('guest-book-let-in');
    await ctx.webPage(book.view.link, line, 'guest-book-door-after');
    // Its sheet says who let it in, and takes it out of the book again.
    await R('button', { name: /^“Lovely stairs/ }).click();
    await T('Let in by you').waitFor();
    await R('button', { name: 'Take it out of the book' }).click();
    await T(/^23 guests and 61 nights/).waitFor({ timeout: 20000 });

    // Another line at the door is turned away by Lea, after she is asked: it is gone for Kai too.
    await ctx.webPage(book.view.link, 'Thank you', 'guest-book-door-second', async (web) => {
      await web.getByLabel('Your name').fill(guest);
      await web.getByLabel('Your line').fill(`Second thoughts (${tag}).`);
      await web.getByRole('button', { name: 'Sign the book' }).click();
    });
    await lea.page.reload();
    await lea.R('button', { name: `Turn ${guest}'s line away` }).click();
    await lea.R('heading', { name: 'Turn this line away?' }).waitFor();
    await lea.R('button', { name: 'Turn away', exact: true }).click();
    await lea.T('Waiting at the door').waitFor({ state: 'detached', timeout: 20000 });
    await page.reload();
    await R('heading', { name: 'The guest book' }).waitFor({ timeout: 20000 });
    await T(/^23 guests and 61 nights/).waitFor();
    if (await page.getByText('Waiting at the door').count()) throw new Error('a line Lea turned away still waits on Kai\'s phone');
  });

  await step('guest-book-write', async () => {
    // A flatmate writes a line in for a guest: it is in the book at once.
    const guest = `Walk-through visitor ${tag}`;
    await more().click();
    await R('button', { name: 'Write a line in for a guest' }).click();
    await L("The guest's name").fill(guest);
    await L('Who they are, in a few words').fill("Kai's cousin");
    await L('The line they left').fill('Said it at the door, on the way out.');
    await L('Nights they stayed').fill('1');
    await shot('guest-book-write');
    await R('button', { name: 'Put it in the book' }).click();
    await R('button', { name: new RegExp(`^“Said it at the door, on the way out\\.”\\. ${guest}, Kai's cousin · 1 night in \\w+$`) }).waitFor({ timeout: 20000 });
    await T(/^24 guests and 62 nights/).waitFor();
    await R('button', { name: /^“Said it at the door/ }).click();
    await T('Written in by you').waitFor();
    await R('button', { name: 'Take it out of the book' }).click();
    await T(/^23 guests and 61 nights/).waitFor({ timeout: 20000 });
  });

  await step('guest-book-new', async () => {
    // A new book has its own door. A new code makes the old one stop working at once.
    const id = await startAnother(/^The guest book\. Does work/, 'The guest book');
    await T('Nobody has written in it yet.').waitFor();
    await T('Print the code and put it by the door. The first guest to scan it leaves the first line.').waitFor();
    const first = (await whole(id)).view.link;
    await shot('guest-book-new');
    await R('button', { name: 'Print', exact: true }).click();
    await T(first.replace(/^https?:\/\//, '')).waitFor();
    await R('button', { name: 'Make a new code' }).click();
    await T('The code by the door stops working at once, and so does every copy of its link. Print the new one and put it up.').waitFor();
    await shot('guest-book-new-code');
    await R('button', { name: 'Make a new code' }).click();
    await T(first.replace(/^https?:\/\//, '')).waitFor({ state: 'detached', timeout: 20000 });
    const second = (await whole(id)).view.link;
    if (!second || second === first) throw new Error('a new code is the old one');
    await T(second.replace(/^https?:\/\//, '')).waitFor();
    await ctx.webPage(first, "This code doesn't work any more", 'guest-book-old-code');
    await ctx.webPage(second, 'Leave a line for the people who live here.', 'guest-book-new-door');
    await asKai('DELETE', `/v1/things/${id}`);
  });

  let roll;
  await step('lived-here', async () => {
    roll = await sampleBoard('lived_here', (board) => board.title === 'Trubarjeva 9, flat 3');
    // What an earlier run left: its own people from before, a line it wrote about Lea, and what it took off the list.
    for (const row of roll.view.before) if (row.name.startsWith('Walk-through')) await asKai('DELETE', `/v1/board-entries/${row.entryId}`);
    const leaRow = roll.view.hereNow.find((row) => row.name === 'Lea');
    if (leaRow.note) await asKai('PATCH', `/v1/board-entries/${leaRow.entryId}`, { fields: { note: '' } });
    if (!roll.view.handedOn.some((one) => one.thing.title === 'Who to call')) {
      const found = (await asKai('GET', `/v1/circles/${flat.id}/search?q=${encodeURIComponent('Who to call')}`)).hits.find((hit) => hit.thing.title === 'Who to call');
      if (found) await asKai('POST', `/v1/boards/${roll.id}/entries`, { clientId: randomUUID(), kind: 'handed_on', fields: { thingId: found.thing.id } });
    }
    await openFromGallery(/^Everyone who's lived here\. Does work/, /^Trubarjeva 9, flat 3\. 3 here now/);
    await R('heading', { name: 'Trubarjeva 9, flat 3' }).waitFor({ timeout: 20000 });
    const year = new Date().getFullYear();
    // The roll: who lives here now, the newest first, and who lived here before.
    await T('Here now').waitFor();
    await R('button', { name: `Lena. Since ${year}. The small room, facing the street` }).waitFor();
    await R('button', { name: `Lea. Since ${year - 2}` }).waitFor();
    await R('button', { name: `You. Since ${year - 3}` }).waitFor();
    await T(`${year} –`, { exact: true }).waitFor();
    await T('Before', { exact: true }).waitFor();
    await R('button', { name: `Ana. From ${year - 3} to ${year - 1}. Moved to Lisbon. Still in the photos, off the Wi‑Fi.` }).waitFor();
    await T(`${year - 3} – ${String(year - 1).slice(-2)}`, { exact: true }).waitFor();
    await R('button', { name: `Two people before you. From ${year - 5} to ${year - 3}. Left the house manual and a cactus` }).waitFor();
    await R('button', { name: 'When someone moves out. Memories stay theirs. Codes and logins stop.' }).waitFor();
    await R('button', { name: /^Handed on to the next person\. House rules, Bin days, Who to call$/ }).waitFor();
    await R('button', { name: 'A last settling-up. Bills to the day, the kitty, the deposit' }).waitFor();
    await shot('lived-here');
  });

  /**
   * Back on the roll, by its own address. (A screen underneath the one on top stays in the page on the web,
   * so the roll is opened afresh instead of trusting the browser's Back and whatever lies under it.)
   */
  const backToTheRoll = async () => {
    await page.goto(`${WEB_URL}/board/${roll.id}`);
    await R('heading', { name: 'Trubarjeva 9, flat 3' }).waitFor({ timeout: 20000 });
    await T('Here now').waitFor();
  };

  await step('lived-here-rows', async () => {
    // What happens when someone moves out, in plain sentences, and where it is done.
    await R('button', { name: /^When someone moves out\./ }).click();
    await T(/the app stops showing them, but it cannot make anyone forget them\.$/).waitFor();
    await shot('lived-here-moves-out');
    await R('button', { name: 'Open People' }).click();
    await page.waitForURL(/\/people$/, { timeout: 20000 });
    await T('In this circle').first().waitFor({ timeout: 20000 });
    await backToTheRoll();
    // What is handed on: things of the flat. One comes off the list, and is found by its name and put back.
    await R('button', { name: /^Handed on to the next person\./ }).click();
    await R('button', { name: /^House rules/ }).waitFor();
    await shot('lived-here-handed-on');
    await R('button', { name: 'Take Who to call off the list' }).click();
    await R('button', { name: 'Take Who to call off the list' }).waitFor({ state: 'detached', timeout: 20000 });
    await L('Add something of the flat').fill('who to');
    await R('button', { name: 'Hand on Who to call' }).click();
    await R('button', { name: 'Take Who to call off the list' }).waitFor({ timeout: 20000 });
    // Each opens with a tap.
    await R('button', { name: /^Bin days/ }).click();
    await page.waitForURL(/\/page\/[0-9a-f-]{36}/, { timeout: 20000 });
    await backToTheRoll();
    await R('button', { name: /^Handed on to the next person\. House rules, Bin days, Who to call$/ }).waitFor();
    // A last settling-up leads to the flat's own boards that do the sums.
    await R('button', { name: /^A last settling-up\./ }).click();
    await R('button', { name: /^How we split\. 3 splits agreed/ }).waitFor({ timeout: 20000 });
    await shot('lived-here-settling');
    await R('button', { name: /^The kitty\. €6\.40 left/ }).click();
    await R('heading', { name: 'The kitty holds €6.40' }).waitFor({ timeout: 20000 });
    await backToTheRoll();
  });

  await step('lived-here-write', async () => {
    const year = new Date().getFullYear();
    // The flat writes a line about someone, and takes it away again.
    await R('button', { name: `Lea. Since ${year - 2}` }).click();
    await R('heading', { name: 'Lea', exact: true }).waitFor();
    await L('A line about them').fill('The room with the balcony');
    await shot('lived-here-edit');
    await R('button', { name: 'Save' }).click();
    await R('button', { name: `Lea. Since ${year - 2}. The room with the balcony` }).waitFor({ timeout: 20000 });
    // Lea reads it on her phone, where she is "You".
    await lea.page.goto(`${WEB_URL}/board/${roll.id}`);
    await lea.R('button', { name: `You. Since ${year - 2}. The room with the balcony` }).waitFor({ timeout: 20000 });
    await R('button', { name: /^Lea\. Since/ }).click();
    await L('A line about them').fill('');
    await R('button', { name: 'Save' }).click();
    await R('button', { name: `Lea. Since ${year - 2}` }).waitFor({ timeout: 20000 });
    // People from before the app are added by hand, and taken off the roll again.
    await more().click();
    await R('button', { name: 'Add people from before' }).click();
    await L('Who', { exact: true }).fill(`Walk-through tenants ${tag}`);
    await L('How many people').fill('3');
    await L('Moved in (year)').fill('2010');
    await L('Moved out (year)').fill('2012');
    await L('A line about them').fill('Painted the kitchen yellow');
    await R('button', { name: 'Save' }).click();
    await R('button', { name: `Walk-through tenants ${tag}. From 2010 to 2012. Painted the kitchen yellow` }).waitFor({ timeout: 20000 });
    await T('2010 – 12', { exact: true }).waitFor();
    await shot('lived-here-before');
    await R('button', { name: /^Walk-through tenants/ }).click();
    await R('button', { name: 'Take them off the roll' }).click();
    await R('button', { name: /^Walk-through tenants/ }).waitFor({ state: 'detached', timeout: 20000 });
  });

  await step('lived-here-new', async () => {
    // A new roll starts from the circle's own people.
    const id = await startAnother(/^Everyone who's lived here\. Does work/, "Everyone who's lived here");
    await T('Here now').waitFor();
    for (const who of ['You', 'Lea', 'Lena']) await R('button', { name: new RegExp(`^${who}\\. Since \\d{4}$`) }).waitFor();
    await R('button', { name: 'Handed on to the next person. Nothing chosen yet' }).waitFor();
    await shot('lived-here-new');
    await asKai('DELETE', `/v1/things/${id}`);
  });

  await step('flat-today', async () => {
    // The flat's Today leads to the same boards: the kitty's card opens the kitty.
    await page.goto(WEB_URL + '/');
    await R('button', { name: 'Trubarjeva 9. Change circle' }).waitFor({ timeout: 20000 });
    await R('button', { name: /^The kitty is down to €6\.40\./ }).waitFor({ timeout: 20000 });
    // "Running low" stands on Today once Today mounts it (another builder's piece). Where it does, it is the kitty's own chips.
    if (await page.getByRole('button', { name: 'Running low. Open the kitty' }).count()) {
      await R('checkbox', { name: 'Loo roll', checked: true }).waitFor();
      await R('checkbox', { name: 'Coffee' }).click();
      await R('checkbox', { name: 'Coffee', checked: true }).waitFor({ timeout: 20000 });
      if (!(await whole(kitty.id)).view.items.find((item) => item.name === 'Coffee').low) throw new Error('a tap on Today did not mark the coffee as running low in the kitty');
      await shot('flat-today-running-low');
      await R('checkbox', { name: 'Coffee' }).click();
      await R('checkbox', { name: 'Coffee', checked: false }).waitFor({ timeout: 20000 });
      await R('button', { name: 'Running low. Open the kitty' }).click();
      await R('heading', { name: 'The kitty holds €6.40' }).waitFor({ timeout: 20000 });
      await R('checkbox', { name: 'Coffee', checked: false }).waitFor();
      await page.goto(WEB_URL + '/');
      await R('button', { name: 'Trubarjeva 9. Change circle' }).waitFor({ timeout: 20000 });
    } else {
      console.log('note', 'Today does not mount "Running low" in this build: it is checked in its own test (RunningLow.test.tsx)');
    }
    await shot('flat-today');
    await R('button', { name: /^The kitty is down to €6\.40\./ }).click();
    await R('heading', { name: 'The kitty holds €6.40' }).waitFor({ timeout: 20000 });
    await R('button', { name: 'Back', exact: true }).click();
    await R('button', { name: 'Trubarjeva 9. Change circle' }).waitFor({ timeout: 20000 });

    await lea.close();
    // Kai's phone goes back to the circle it showed before, and he logs out.
    await switchTo('Lisbon crew', /^Lisbon crew\. Friends/);
    await ctx.signOut();
  });
};
