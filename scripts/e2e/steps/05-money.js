// Milestone 5, Money: the month's card, a bill (paying a share and taking it back), scanning a bill (a picked
// picture and pasted lines stand in for the phone's camera), the lists of bills, sheets and their templates,
// a sheet (a tick that moves the totals, "Alex is here too", sideways scrolling, a row as a card, columns, a
// formula from chips and one asked for in words), the loan planner, and splitting costs with friends. Then,
// as two people: a sheet only Nora sees, which a second person can't find until she shares it, and Money
// shut for that person once she is a teen.
//
// Everything is done as nora@example.com in the sample circles, and everything it changes it puts back (the
// tick, the row's cells, the columns and the tile it adds, the bill it scans, the sheets it makes, the
// expense and the payment), so the run can be repeated and the sample data stays as the drawings show it.
const path = require('path');

/** The lines of a water bill, as a phone would read them off the letter. The amount is corrected by hand below. */
const LETTER = ['Komunala Ljubljana d.o.o.', 'Račun za vodo in odvoz odpadkov', 'Obdobje: oktober 2026', 'Za plačilo: 48,09 EUR', 'Rok plačila: 27.11.2026', 'Sklic: SI12 9087 6543 2101'].join('\n');

exports.run = async function run(ctx) {
  const { page, T, R, L, shot, step, tag, WEB_URL, IMG, CODE } = ctx;
  let nora;
  let linds;
  let crew;

  /** Waits for the API to answer a change the app sends, while `act` makes it. Fails when the answer isn't a yes. */
  const sent = async (method, address, act) => {
    const [response] = await Promise.all([page.waitForResponse((r) => r.request().method() === method && address.test(new URL(r.url()).pathname)), act()]);
    if (!response.ok()) throw new Error(`${method} ${response.url()} gave ${response.status()}`);
    return response;
  };
  /** Waits until a box holds these words. (What a box shows follows the API's answer by a moment: looking once would be too early now and then.) */
  const holds = async (label, value, why, exact = true) => {
    for (let tries = 0; tries < 50; tries += 1) {
      if ((await L(label, { exact }).inputValue()) === value) return;
      await page.waitForTimeout(100);
    }
    throw new Error(why);
  };
  /** Waits until no sheet is on the screen any more, not even one that is sliding away. */
  const sheetGone = () => page.waitForFunction(() => !document.querySelector('[aria-modal="true"]'));
  /** Closes the sheet that is open by pressing beside it. */
  const closeSheet = async () => page.getByRole('button', { name: 'Close', exact: true }).last().click({ position: { x: 20, y: 20 } });
  /** Types into a box of a row's card and leaves it, which is when the app saves the cell. */
  const typeIn = async (label, value) => {
    // (A box that shows money as "€2,350.00" holds plain digits once it is tapped: tap first, then type over them.)
    await sheetGone();
    await L(label, { exact: true }).click();
    await L(label, { exact: true }).fill(value);
    await sent('PATCH', /^\/v1\/sheet-rows\/[^/]+$/, () => L(label, { exact: true }).press('Tab'));
  };

  await step('money', async () => {
    await ctx.signIn('nora@example.com');
    nora = (await ctx.api(null, 'POST', '/local-auth/token', { email: 'nora@example.com', code: CODE })).accessToken;
    const circles = await ctx.api(nora, 'GET', '/v1/circles');
    linds = circles.find((circle) => circle.name === 'The Linds');
    crew = circles.find((circle) => circle.name === 'Lisbon crew');
    await R('button', { name: 'The Linds. Change circle' }).waitFor();
    // The bill's line on Today ends in "Pay", Money's own button.
    await R('button', { name: 'Pay Electricity' }).waitFor();
    await R('tab', { name: 'Money' }).click();
    // The month in one card: what is paid of what is due, and three numbers that each open their list.
    const month = new Date().toLocaleString('en-GB', { month: 'long' });
    await T(`${month} bills`, { exact: true }).waitFor();
    await R('progressbar').waitFor();
    await R('button', { name: /^€\d[\d,]* due this week$/ }).waitFor();
    await R('button', { name: '€86 in subscriptions' }).waitFor();
    await R('button', { name: '€42 Alex owes you' }).waitFor();
    // What is due soonest, and the sheets as a rail.
    await R('button', { name: /^Electricity\. .*split with Alex\. €84\.20$/ }).waitFor();
    await R('button', { name: /^Rent\. .*standing order\. €980\.00$/ }).waitFor();
    await R('button', { name: 'Norway budget. Trip' }).waitFor();
    await shot('money');
  });

  await step('bills', async () => {
    // The three lists behind "Due soon": to pay, paid, and the subscriptions with what they come to.
    await R('button', { name: 'Due soon. See all' }).click();
    await R('heading', { name: 'Bills' }).waitFor();
    await R('radio', { name: 'To pay', checked: true }).waitFor();
    await R('button', { name: /^Netflix\./ }).waitFor();
    await shot('bills');
    await R('radio', { name: 'Subscriptions' }).click();
    await T('€86 a month · €1,032 a year').waitFor();
    await R('button', { name: /^Netflix\. .*€168 a year\. €13\.99$/ }).waitFor();
    await shot('bills-subscriptions');
    await R('radio', { name: 'Paid' }).click();
    await R('button', { name: /^Water\. Paid / }).waitFor();
    await R('button', { name: 'Back', exact: true }).click();
    await T('Due soon').waitFor();
  });

  await step('bill', async () => {
    await R('button', { name: /^Electricity\. .*€84\.20$/ }).click();
    await R('heading', { name: 'Electricity' }).waitFor();
    await T('Elektro Ljubljana').waitFor();
    await T('€84.20', { exact: true }).waitFor();
    await T(/^(Due|Was due) /).waitFor();
    await T("Your half isn't paid yet").waitFor();
    // The last months as bars, what it usually comes to, and that this one is more.
    await T('The last six').waitFor();
    await T('usually about €63').waitFor();
    await T('More than usual this time').waitFor();
    // Who pays what, and how it comes round.
    await T('Split 50/50 with Alex').waitFor();
    await T('€42.10 each · Alex has paid').waitFor();
    await T(/^Every month, around the \d+(st|nd|rd|th)$/).waitFor();
    await T('Reminds you 2 days before').waitFor();
    await shot('bill');
    await R('button', { name: /^Split 50\/50 with Alex/ }).click();
    await T('Who pays what').waitFor();
    await R('button', { name: 'Mark my part as paid' }).waitFor();
    await R('button', { name: "Alex's part isn't paid after all" }).waitFor();
    await shot('bill-who-pays');
    await closeSheet();
    // No login is linked to it: the row is there and says so.
    await R('button', { name: /^No login kept with it/ }).click();
    await T('No login yet').waitFor();
    await R('button', { name: 'OK' }).click();
    // The three dots: changing it, who sees it, its IBAN and reference to copy, deleting it.
    await R('button', { name: 'More', exact: true }).click();
    await R('button', { name: 'Change the bill' }).waitFor();
    await R('button', { name: /^Who can see it/ }).waitFor();
    await R('button', { name: /^Copy the reference/ }).waitFor();
    await R('button', { name: 'Delete the bill' }).waitFor();
    await shot('bill-menu');
    await R('button', { name: /^Who can see it/ }).click();
    await T('Who can see this?').waitFor();
    await R('button', { name: 'Done' }).click();
    await T('Who can see this?').waitFor({ state: 'detached' });
  });

  await step('bill-paid-and-taken-back', async () => {
    // Alex has paid his half, so Nora's is the last one: the bill is paid and comes round again next month.
    await sent('PUT', /^\/v1\/bills\/[^/]+\/paid$/, () => R('button', { name: 'Mark my half as paid' }).click());
    await T(/^Paid\. It is due again on /).waitFor();
    await T("€42.10 each · Alex hasn't paid yet").waitFor();
    await shot('bill-paid');
    // And she takes it back: this month's is open again, with Alex's half still paid.
    await sent('PUT', /^\/v1\/bills\/[^/]+\/paid$/, () => R('button', { name: 'Take it back' }).click());
    await T("Your half isn't paid yet").waitFor();
    await T('€42.10 each · Alex has paid').waitFor();
    await R('button', { name: 'Mark my half as paid' }).waitFor();
  });

  await step('bill-changed', async () => {
    // Changing it: the same form that adds one, filled with what the bill holds.
    await R('button', { name: 'More', exact: true }).click();
    await R('button', { name: 'Change the bill' }).click();
    await R('heading', { name: 'Change the bill' }).waitFor();
    await R('radio', { name: 'Every month', checked: true }).waitFor();
    await R('radio', { name: '2 days before', checked: true }).waitFor();
    await shot('bill-change');
    await R('radio', { name: 'A week before' }).click();
    await sent('PATCH', /^\/v1\/bills\/[^/]+$/, () => R('button', { name: 'Save' }).click());
    await T('Reminds you 7 days before').waitFor();
    await R('button', { name: /^Every month, around the/ }).click();
    await R('heading', { name: 'Change the bill' }).waitFor();
    await R('radio', { name: '2 days before' }).click();
    await sent('PATCH', /^\/v1\/bills\/[^/]+$/, () => R('button', { name: 'Save' }).click());
    await T('Reminds you 2 days before').waitFor();
    await R('button', { name: 'Back', exact: true }).click();
    await T('Due soon').waitFor();
  });

  await step('scan-bill', async () => {
    // The + button, then Bill: adding one by hand, or scanning a letter.
    await R('button', { name: 'Add something' }).click();
    await R('button', { name: 'Bill', exact: true }).click();
    await R('heading', { name: 'New bill' }).waitFor();
    await shot('new-bill');
    await R('button', { name: 'Scan a letter instead' }).click();
    await T('What does it say?').waitFor();
    await T('Pick a picture', { exact: true }).waitFor();
    // Where the phone's camera would be: a picture is picked...
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), R('button', { name: 'Pick a picture of the paper' }).click()]);
    await chooser.setFiles(path.join(IMG, 'coffee-receipt.jpg'));
    await T('Type what it says', { exact: true }).waitFor();
    // ...and where it would read the words: the lines are pasted.
    await L('The lines on the paper').fill(LETTER);
    await shot('scan-bill-lines');
    await sent('POST', /^\/v1\/bills\/read$/, () => R('button', { name: 'Read it' }).click());
    // What was read, each with the line it came from.
    await T('Is this right?').waitFor();
    await holds('Who to pay', 'Komunala Ljubljana', 'the payee was not read off the first line');
    await T('Read from “Komunala Ljubljana d.o.o.”').waitFor();
    await holds('Amount', '€48.09', 'the amount was not read');
    await T('Read from “Za plačilo: 48,09 EUR”').waitFor();
    await R('button', { name: /^Due: 27 Nov( \d{4})?\. Change$/ }).waitFor();
    await T('Read from “Rok plačila: 27.11.2026”').waitFor();
    await holds('Reference', 'SI12 9087 6543 2101', 'the reference was not read');
    // A utility comes every month: that was read too. Splitting it is hers to say.
    await R('checkbox', { name: 'Comes every month', checked: true }).waitFor();
    await R('checkbox', { name: 'Split with Alex', checked: false }).click();
    await R('checkbox', { name: 'Split with Alex', checked: true }).waitFor();
    await shot('scan-bill');
    // The amount was read wrong off a smudged letter: she corrects it.
    await L('Amount', { exact: true }).click();
    await L('Amount', { exact: true }).fill('48.90');
    const made = await sent('POST', /^\/v1\/bills$/, () => R('button', { name: 'Add bill' }).click());
    const bill = await made.json();
    // The bill opens: the corrected amount, half each, every month, and the picture kept as its invoice.
    await R('heading', { name: 'Water' }).waitFor({ timeout: 30000 });
    await T('€48.90', { exact: true }).waitFor();
    await T('Split 50/50 with Alex').waitFor();
    await T(/^Every month, around the 27th$/).waitFor();
    await R('button', { name: /^Invoice, November\. Scanned from the letter/ }).waitFor({ timeout: 30000 });
    await shot('bill-scanned');
    // It is deleted again, and so is the picture it kept in the Library.
    const kept = (await ctx.api(nora, 'GET', `/v1/bills/${bill.id}`)).invoice;
    await R('button', { name: 'More', exact: true }).click();
    await R('button', { name: 'Delete the bill' }).click();
    await T('Delete this bill?').waitFor();
    await sent('DELETE', /^\/v1\/things\/[^/]+$/, () => R('button', { name: 'Delete the bill' }).click());
    if (kept) await ctx.api(nora, 'DELETE', `/v1/things/${kept.id}`);
    await T('Due soon').waitFor();
  });

  await step('sheets', async () => {
    await R('button', { name: 'Sheets. See all' }).click();
    await R('heading', { name: 'Sheets' }).waitFor();
    await T('Yours', { exact: true }).waitFor();
    // A sheet everyone sees shows its first tile's number; one that only some see shows who.
    await R('button', { name: /^Norway budget\. 3 tabs · .*\. €7,640$/ }).waitFor();
    await R('button', { name: 'Budget 2026. 12 tabs · one a month' }).waitFor();
    await T('Start from a template').waitFor();
    for (const template of ['Monthly budget', 'Trip budget', 'Tax checklist', 'Car costs']) await R('button', { name: new RegExp(`^${template}\\.`) }).waitFor();
    await R('button', { name: /^Loan planner\. .*Has sliders to try first$/ }).waitFor();
    await R('button', { name: /^Savings plan\. .*Has sliders to try first$/ }).waitFor();
    await shot('sheets');
  });

  let sheetId;
  await step('sheet', async () => {
    await R('button', { name: /^Norway budget\./ }).click();
    await R('heading', { name: 'Norway budget' }).waitFor();
    sheetId = page.url().split('/sheet/')[1].split(/[?#]/)[0];
    // The tiles on top, the typed columns, the rows, and the row of totals with the bar that says what the chosen one does.
    await R('button', { name: 'Planned: €7,640. Change this tile' }).waitFor();
    await R('button', { name: 'Paid: €2,500. Change this tile' }).waitFor();
    await R('button', { name: 'Still to pay: €5,140. Change this tile' }).waitFor();
    await R('button', { name: 'Item, Text. Change this column' }).waitFor();
    await R('button', { name: 'Cost, Money. Change this column' }).waitFor();
    await R('button', { name: 'Row 6: Fun money. Open as a card' }).waitFor();
    await R('checkbox', { name: 'Paid, row 1', checked: true }).waitFor();
    await R('button', { name: 'Total of Cost: 7,640.00' }).waitFor();
    await T('Adds up every row in Cost. Tap a row to open it as a card.').waitFor();
    await shot('sheet');
    // Another total: the bar says what that one does.
    await R('button', { name: 'Total of Paid: 2 of 6' }).click();
    await T('Counts the rows where Paid is ticked. Tap a row to open it as a card.').waitFor();
    await R('button', { name: 'Total of Cost: 7,640.00' }).click();
    // The row numbers and the first column stay; the other columns scroll sideways under the header and the totals.
    const sideways = page.getByLabel('The other columns. Scroll sideways for more.').last();
    await sideways.evaluate((scroller) => (scroller.scrollLeft = 400));
    await R('button', { name: 'Due, Date. Change this column' }).waitFor();
    await T('Cabins, 9 nights').waitFor();
    await shot('sheet-sideways');
    await sideways.evaluate((scroller) => (scroller.scrollLeft = 0));
  });

  await step('sheet-alex-is-here', async () => {
    // Alex opens the same sheet on his phone (here: through the API). Within a few seconds Nora's says so.
    const alex = (await ctx.api(null, 'POST', '/local-auth/token', { email: 'alex@example.com', code: CODE })).accessToken;
    await ctx.api(alex, 'GET', `/v1/sheets/${sheetId}`);
    await T('Alex is here too').waitFor({ timeout: 15000 });
    await shot('sheet-alex-is-here');
  });

  await step('sheet-a-tick-moves-the-totals', async () => {
    // Ticking "Paid" for the cabins moves two tiles and the count of ticks at once.
    await sent('PATCH', /^\/v1\/sheet-rows\/[^/]+$/, () => R('checkbox', { name: 'Paid, row 3' }).click());
    await R('checkbox', { name: 'Paid, row 3', checked: true }).waitFor();
    await R('button', { name: 'Paid: €4,850. Change this tile' }).waitFor();
    await R('button', { name: 'Still to pay: €2,790. Change this tile' }).waitFor();
    await R('button', { name: 'Total of Paid: 3 of 6' }).waitFor();
    await shot('sheet-ticked');
    await sent('PATCH', /^\/v1\/sheet-rows\/[^/]+$/, () => R('checkbox', { name: 'Paid, row 3' }).click());
    await R('button', { name: 'Still to pay: €5,140. Change this tile' }).waitFor();
    await R('button', { name: 'Total of Paid: 2 of 6' }).waitFor();
  });

  await step('sheet-row', async () => {
    await R('button', { name: 'Row 3: Cabins, 9 nights. Open as a card' }).click();
    await R('heading', { name: 'Row 3 of 6' }).waitFor();
    await T('Norway budget').waitFor();
    // Every column is a box of its own kind, with the note and the papers under them.
    await holds('Item', 'Cabins, 9 nights', 'the text cell does not hold its words');
    await holds('Cost', '€2,350.00', 'the money cell is not written as money');
    await R('button', { name: 'Who: Alex. Change' }).waitFor();
    await R('button', { name: /^Due: 15 Jan( \d{4})?\. Change$/ }).waitFor();
    await R('switch', { name: 'Paid', checked: false }).waitFor();
    await T('Not yet').waitFor();
    await T('Receipts and papers').waitFor();
    await R('button', { name: 'Previous row: Rail passes' }).waitFor();
    await R('button', { name: 'Next row: Ferries' }).waitFor();
    await shot('sheet-row');

    // Two cells changed, each in its own way: money is typed, a tick is a switch.
    await typeIn('Cost', '2400');
    await holds('Cost', '€2,400.00', 'the changed amount is not shown as money');
    await sent('PATCH', /^\/v1\/sheet-rows\/[^/]+$/, () => R('switch', { name: 'Paid' }).click());
    await R('switch', { name: 'Paid', checked: true }).waitFor();
    await T('Yes', { exact: true }).waitFor();
    // A person is picked from the circle...
    await R('button', { name: 'Who: Alex. Change' }).click();
    await R('checkbox', { name: 'Alex', checked: true }).waitFor();
    await R('checkbox', { name: 'Nora', checked: false }).click();
    await shot('sheet-row-people');
    await sent('PATCH', /^\/v1\/sheet-rows\/[^/]+$/, () => R('button', { name: 'Done' }).click());
    await R('button', { name: /^Who: (Alex and Nora|Nora and Alex)\. Change$/ }).waitFor();
    // ...and a day from the calendar.
    await R('button', { name: /^Due: 15 Jan/ }).click();
    await sent('PATCH', /^\/v1\/sheet-rows\/[^/]+$/, () => R('button', { name: /^16 January \d{4}$/ }).click());
    await R('button', { name: /^Due: 16 Jan/ }).waitFor();
    // A paper goes up through the upload flow, and comes off again.
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), R('button', { name: 'Add a receipt or a paper' }).click()]);
    await chooser.setFiles(path.join(IMG, 'coffee-receipt.jpg'));
    await R('button', { name: 'Remove paper 2' }).waitFor({ timeout: 30000 });
    await shot('sheet-row-changed');
    await R('button', { name: 'Remove paper 2' }).click();
    await T('Remove this paper?').waitFor();
    await sent('DELETE', /^\/v1\/sheet-rows\/[^/]+\/papers\/[^/]+$/, () => R('button', { name: 'Remove it' }).click());
    await R('button', { name: 'Remove paper 2' }).waitFor({ state: 'detached' });
    // The row after, and back to this one.
    await R('button', { name: 'Next row: Ferries' }).click();
    await R('heading', { name: 'Row 4 of 6' }).waitFor();
    await R('button', { name: /^Previous row: Cabins/ }).click();
    await R('heading', { name: 'Row 3 of 6' }).waitFor();
    // Back on the sheet, the totals have moved with the two cells.
    await R('button', { name: 'Done' }).click();
    await R('button', { name: 'Planned: €7,690. Change this tile' }).waitFor();
    await R('button', { name: 'Paid: €4,900. Change this tile' }).waitFor();
    await shot('sheet-after-row');

    // Everything is put back as it was.
    await R('button', { name: 'Row 3: Cabins, 9 nights. Open as a card' }).click();
    await R('heading', { name: 'Row 3 of 6' }).waitFor();
    await typeIn('Cost', '2350');
    await sent('PATCH', /^\/v1\/sheet-rows\/[^/]+$/, () => R('switch', { name: 'Paid' }).click());
    await R('button', { name: /^Who: .*\. Change$/ }).click();
    await R('checkbox', { name: 'Nora', checked: true }).click();
    await sent('PATCH', /^\/v1\/sheet-rows\/[^/]+$/, () => R('button', { name: 'Done' }).click());
    await R('button', { name: 'Who: Alex. Change' }).waitFor();
    await R('button', { name: /^Due: 16 Jan/ }).click();
    await sent('PATCH', /^\/v1\/sheet-rows\/[^/]+$/, () => R('button', { name: /^15 January \d{4}$/ }).click());
    await R('button', { name: 'Done' }).click();
    await R('button', { name: 'Planned: €7,640. Change this tile' }).waitFor();
    await R('button', { name: 'Paid: €2,500. Change this tile' }).waitFor();
  });

  const deposit = `Deposit ${tag}`;
  const left = `Left ${tag}`;
  const total = `Total ${tag}`;

  await step('sheet-columns', async () => {
    // A column of money, added from the three dots, with a total under it.
    await R('button', { name: 'More', exact: true }).click();
    await R('button', { name: 'Add a column' }).click();
    await T('New column').waitFor();
    await L('Name of the column').fill(deposit);
    await R('radio', { name: 'Money. An amount' }).click();
    await R('radio', { name: 'Total', exact: true }).click();
    await shot('sheet-column');
    await sent('POST', /^\/v1\/sheet-tabs\/[^/]+\/columns$/, () => R('button', { name: 'Add', exact: true }).click());
    await R('button', { name: `${deposit}, Money. Change this column` }).waitFor();

    // A formula column, built from chips: the name here, the formula in the builder.
    await R('button', { name: 'More', exact: true }).click();
    await R('button', { name: 'Add a column' }).click();
    await L('Name of the column').fill(left);
    await R('radio', { name: 'Formula. Worked out' }).click();
    await R('button', { name: 'Next: build its formula' }).click();
    await T(/^Tap a column or a function to start\./).waitFor();
    // The sentence and the answer follow each chip.
    await R('button', { name: 'Cost', exact: true }).click();
    await T('Cost.', { exact: true }).waitFor();
    await T('€1,480.00').waitFor();
    await T('in the first row').waitFor();
    await R('button', { name: 'Minus' }).click();
    // A formula that stops halfway says what is missing.
    await T(/^The formula stops too early/).waitFor();
    await R('button', { name: deposit, exact: true }).click();
    await T(`Cost minus ${deposit}.`).waitFor();
    // The first row has no deposit yet, so its cell can't be worked out, and the builder says why.
    await T(`${deposit} is empty`).waitFor();
    await shot('formula-column');
    await sent('POST', /^\/v1\/sheet-tabs\/[^/]+\/columns$/, () => R('button', { name: 'Use this formula' }).click());
    await R('button', { name: `${left}, Formula. Change this column` }).waitFor();
    const sideways = page.getByLabel('The other columns. Scroll sideways for more.').last();
    await sideways.evaluate((scroller) => (scroller.scrollLeft = 2000));
    await shot('sheet-new-columns');

    // A deposit typed into the first row's card fills its cell of the formula column.
    await R('button', { name: 'Row 1: Flights. Open as a card' }).click();
    await R('heading', { name: 'Row 1 of 6' }).waitFor();
    await T(`${deposit} is empty`).waitFor();
    await typeIn(deposit, '480');
    await T('€1,000.00').waitFor();
    await shot('sheet-row-formula');
    await R('button', { name: 'Done' }).click();
    await R('button', { name: `Total of ${deposit}: 480.00` }).waitFor();

    // A column changed: its name, and what stands under it.
    await R('button', { name: `${deposit}, Money. Change this column` }).click();
    await L('Name of the column').waitFor();
    await R('radio', { name: 'Largest' }).click();
    await sent('PATCH', /^\/v1\/sheet-columns\/[^/]+$/, () => R('button', { name: 'Save' }).click());
    await R('button', { name: `Total of ${deposit}: 480.00` }).click();
    await T(new RegExp(`${deposit}.*Tap a row to open it as a card\\.$`)).waitFor();
  });

  await step('formula', async () => {
    // A tile opens its formula: chips, the same as a sentence, and its answer.
    await R('button', { name: 'Still to pay: €5,140. Change this tile' }).click();
    await L('Name of the tile').waitFor();
    await holds('Name of the tile', 'Still to pay', 'the builder did not open on the tile', false);
    await T('Everything in Cost, minus the Cost of rows where Paid is ticked.').waitFor();
    await T('€5,140.00').waitFor();
    await T('changes as rows change').waitFor();
    await T('is ticked').waitFor();
    for (const chip of ['SUM', 'SUM IF', 'AVERAGE', 'COUNT', 'IF', 'PAYMENT', 'More']) await R('button', { name: new RegExp(`^${chip}(\\.|$)`) }).waitFor();
    await shot('formula');
    // Chips come off one at a time, and the sentence follows.
    await R('button', { name: 'Take the last one away' }).click();
    await T(/^SUMIF needs two things/).waitFor();
    await R('button', { name: 'Cost', exact: true }).click();
    await T('Everything in Cost, minus the Cost of rows where Paid is ticked.').waitFor();
    await R('button', { name: 'More', exact: true }).click();
    await R('button', { name: /^MAX\./ }).waitFor();
    await R('button', { name: 'Fewer' }).click();
    await closeSheet();
    await R('button', { name: 'Still to pay: €5,140. Change this tile' }).waitFor();
  });

  await step('formula-asked-in-words', async () => {
    await R('button', { name: 'More', exact: true }).click();
    await R('button', { name: 'Add a tile on top' }).click();
    await L('Name of the tile').waitFor();
    // A formula that reads but can't be worked out says why, in plain words.
    await R('button', { name: 'Cost', exact: true }).click();
    await R('button', { name: 'Divided by' }).click();
    await R('button', { name: 'Item', exact: true }).click();
    await T('Item holds words, not a number').waitFor();
    await shot('formula-cant-be-worked-out');
    for (let chips = 0; chips < 3; chips += 1) await R('button', { name: 'Take the last one away' }).click();
    // Asked in words: a question it doesn't know is told how to write it, with questions this tab can answer...
    await L('Ask in words').fill('Will it rain in Bergen?');
    await sent('POST', /^\/v1\/sheet-tabs\/[^/]+\/ask$/, () => R('button', { name: 'Ask', exact: true }).click());
    await T(/^I didn't understand that; here is how to write it/).waitFor();
    await R('button', { name: 'How much is left to pay?' }).waitFor();
    await shot('formula-not-understood');
    // ...and one of those is answered with a formula: its chips, its sentence, its answer.
    await sent('POST', /^\/v1\/sheet-tabs\/[^/]+\/ask$/, () => R('button', { name: 'Total Cost' }).click());
    await T('Everything in Cost.').waitFor();
    await T('€7,640.00').waitFor();
    await L('Ask in words').fill('How much has Alex paid?');
    await sent('POST', /^\/v1\/sheet-tabs\/[^/]+\/ask$/, () => L('Ask in words').press('Enter'));
    await T('The Cost of rows where Who is “Alex” and Paid is ticked.').waitFor();
    await T('€1,480.00').waitFor();
    await sent('POST', /^\/v1\/sheet-tabs\/[^/]+\/ask$/, async () => {
      await L('Ask in words').fill('total cost');
      await L('Ask in words').press('Enter');
    });
    await T('Everything in Cost.').waitFor();
    // It gives one number for the tab, so it is kept as a tile.
    await R('radio', { name: 'A tile on top', checked: true }).waitFor();
    await L('Name of the tile').fill(total);
    await shot('formula-asked');
    await sent('POST', /^\/v1\/sheet-tabs\/[^/]+\/tiles$/, () => R('button', { name: 'Use this formula' }).click());
    await R('button', { name: `${total}: €7,640. Change this tile` }).waitFor();
    await shot('sheet-new-tile');
  });

  await step('sheet-put-back', async () => {
    // The tile, the two columns and the deposit go again; a tab is added, renamed and removed on the way.
    await R('button', { name: `${total}: €7,640. Change this tile` }).click();
    await R('button', { name: 'Remove this tile' }).click();
    await T('Remove this tile?').waitFor();
    await sent('DELETE', /^\/v1\/sheet-tiles\/[^/]+$/, () => R('button', { name: 'Remove the tile' }).click());
    await R('button', { name: 'Still to pay: €5,140. Change this tile' }).waitFor();
    for (const column of [`${left}, Formula`, `${deposit}, Money`]) {
      await R('button', { name: `${column}. Change this column` }).click();
      await R('button', { name: 'Remove this column' }).click();
      await T('Remove this column?').waitFor();
      await sent('DELETE', /^\/v1\/sheet-columns\/[^/]+$/, () => R('button', { name: 'Remove the column' }).click());
      await R('button', { name: `${column}. Change this column` }).waitFor({ state: 'detached' });
    }
    // The tabs along the bottom.
    await R('tab', { name: 'Budget', selected: true }).waitFor();
    await R('tab', { name: 'Savings' }).click();
    await R('tab', { name: 'Savings', selected: true }).waitFor();
    await R('button', { name: /^Row 1/ }).waitFor();
    await shot('sheet-another-tab');
    await R('button', { name: 'Add a tab' }).click();
    await L('Name of the tab').fill(`Extras ${tag}`);
    await sent('POST', /^\/v1\/sheets\/[^/]+\/tabs$/, () => R('button', { name: 'Add', exact: true }).click());
    await R('tab', { name: `Extras ${tag}`, selected: true }).waitFor();
    // A new tab with the same columns starts without rows: the first one is added, and opens as a card.
    await sent('POST', /^\/v1\/sheet-tabs\/[^/]+\/rows$/, () => R('button', { name: 'Add a row' }).click());
    await R('heading', { name: 'Row 1 of 1' }).waitFor();
    await R('button', { name: 'Done' }).click();
    await R('button', { name: 'Row 1. More' }).click();
    await R('button', { name: 'Remove this row' }).click();
    await sent('DELETE', /^\/v1\/sheet-rows\/[^/]+$/, () => R('button', { name: 'Remove the row' }).click());
    await R('tab', { name: `Extras ${tag}`, selected: true }).click();
    await R('button', { name: 'Remove this tab' }).click();
    await T('Remove this tab?').waitFor();
    await sent('DELETE', /^\/v1\/sheet-tabs\/[^/]+$/, () => R('button', { name: 'Remove the tab' }).click());
    await R('tab', { name: `Extras ${tag}` }).waitFor({ state: 'detached' });
    await R('tab', { name: 'Budget' }).click();
    await R('button', { name: 'Planned: €7,640. Change this tile' }).waitFor();
    await R('button', { name: 'Back', exact: true }).click();
    await R('heading', { name: 'Sheets' }).waitFor();
  });

  await step('what-if', async () => {
    await R('button', { name: /^Loan planner\./ }).click();
    await R('heading', { name: 'Loan planner' }).waitFor();
    // The three outcomes, as drawn.
    await T("You'd pay each month").waitFor();
    await T('€1,189', { exact: true }).waitFor();
    await T('€116,600 of interest over 25 years').waitFor();
    await T('Pay €100 more a month').waitFor();
    await T('Done 2 years 11 months sooner, with about €15,000 less interest.').waitFor();
    await R('slider', { name: 'Borrowed: €240,000' }).waitFor();
    await R('slider', { name: 'Interest a year: 3.4%' }).waitFor();
    await R('slider', { name: 'Over: 25 years' }).waitFor();
    await shot('what-if');
    // Dragging a slider moves the figures as it goes: each stop is a new answer from the API.
    const drag = async (name, toPart) => {
      const box = await R('slider', { name }).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * toPart, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
    };
    /** What the API says of a loan, written the way the screen writes money on this card: whole euros. */
    const euros = (cents) => `€${Math.floor((cents + 50) / 100).toLocaleString('en-US')}`;
    const planFor = (borrowed, rate, years) => ctx.api(nora, 'GET', `/v1/money/loan-plan?principalCents=${borrowed * 100}&ratePercent=${rate}&years=${years}&extraCents=10000`);
    await drag(/^Borrowed/, 0.6);
    await R('slider', { name: 'Borrowed: €340,000' }).waitFor();
    await T(euros((await planFor(340000, 3.4, 25)).plan.paymentCents), { exact: true }).waitFor();
    await drag(/^Interest a year/, 0.25);
    await R('slider', { name: 'Interest a year: 2.0%' }).waitFor();
    await drag(/^Over/, 0.5);
    await R('slider', { name: 'Over: 20 years' }).waitFor();
    const moved = await planFor(340000, 2, 20);
    await T(euros(moved.plan.paymentCents), { exact: true }).waitFor();
    await T(`${euros(moved.plan.interestCents)} of interest over 20 years`).waitFor();
    await T(/^Done (\d+ years? )?(\d+ months? )?sooner, with about €[\d,]+ less interest\.$/).waitFor();
    // The switch takes the extra out of the chart and out of the sheet that is kept.
    await R('switch', { name: 'Count the extra in', checked: true }).click();
    await R('switch', { name: 'Count the extra in', checked: false }).waitFor();
    await R('switch', { name: 'Count the extra in' }).click();
    await shot('what-if-moved');
    // "Keep as a sheet" makes a sheet of the plan: a row for each year.
    await sent('POST', /^\/v1\/sheets$/, () => R('button', { name: 'Keep as a sheet' }).click());
    await R('heading', { name: 'Loan planner' }).waitFor();
    await R('button', { name: new RegExp(`^Each month: ${euros(moved.withExtra.paymentCents).replace(/[.$]/g, '\\$&')}`) }).waitFor();
    await R('button', { name: 'Year, Number. Change this column' }).waitFor();
    await shot('what-if-kept');
    // It was only kept to see that it can be: the sheet is deleted again.
    await R('button', { name: 'More', exact: true }).click();
    await R('button', { name: 'Delete the sheet' }).click();
    await T('Delete this sheet?').waitFor();
    await sent('DELETE', /^\/v1\/things\/[^/]+$/, () => R('button', { name: 'Delete the sheet' }).click());
    await R('heading', { name: 'Sheets' }).waitFor();
    // A template that isn't "live" starts as its sheet at once.
    await sent('POST', /^\/v1\/sheets$/, () => R('button', { name: /^Car costs\./ }).click());
    await R('heading', { name: 'Car costs' }).waitFor();
    await shot('sheet-from-template');
    await R('button', { name: 'More', exact: true }).click();
    await R('button', { name: 'Delete the sheet' }).click();
    await sent('DELETE', /^\/v1\/things\/[^/]+$/, () => R('button', { name: 'Delete the sheet' }).click());
    await R('heading', { name: 'Sheets' }).waitFor();
    await R('button', { name: 'Back', exact: true }).click();
    await T('Due soon').waitFor();
  });

  const pastry = `Pastéis ${tag}`;

  await step('split', async () => {
    // Another circle is another Money: among friends, it is about who owes whom.
    await R('button', { name: 'The Linds. Change circle' }).click();
    await R('button', { name: /^Lisbon crew\./ }).click();
    await R('button', { name: 'Lisbon crew. Change circle' }).waitFor();
    await R('tab', { name: 'Money' }).click();
    await R('button', { name: '€44 Lea owes you' }).waitFor();
    await shot('money-friends');
    await R('button', { name: "Lisbon weekend. You're owed €64" }).click();
    await R('heading', { name: 'Lisbon weekend' }).waitFor();
    await T('Lisbon crew · 5 friends').waitFor();
    await T('After 14 expenses, €1,236 in all').waitFor();
    await T("You're owed €64").waitFor();
    // The fewest payments that settle it, and the latest expenses.
    await T('The fewest payments to settle up').waitFor();
    await R('button', { name: 'Lea pays you. €44. Mark as paid' }).waitFor();
    await R('button', { name: 'Kai pays you. €20. Mark as paid' }).waitFor();
    await R('button', { name: 'Lena pays Ana. €31. Mark as paid' }).waitFor();
    await R('button', { name: 'Dinner at Ramiro. Kai paid · split 5 ways. €186. Change' }).waitFor();
    await R('button', { name: 'Airport taxi. You paid · split with Lea. €24. Change' }).waitFor();
    await shot('split');
    // Where everyone stands: what each paid, their share, and what that leaves.
    await R('button', { name: /Where everyone stands$/ }).click();
    await T('Paid €75.10 · share €261.10').waitFor();
    await shot('split-standings');
    await closeSheet();
  });

  await step('split-expense', async () => {
    // What Nora paid, shared equally by all five: her balance moves by the four parts the others owe her.
    await R('button', { name: 'Add what you paid' }).click();
    await L('What was it').fill(pastry);
    await L('Amount', { exact: true }).fill('25');
    await R('radio', { name: 'You', checked: true }).waitFor();
    await R('radio', { name: 'Equally', checked: true }).waitFor();
    await shot('split-add');
    await sent('POST', /^\/v1\/splits\/[^/]+\/expenses$/, () => R('button', { name: 'Add expense' }).click());
    await R('button', { name: `${pastry}. You paid · split 5 ways. €25. Change` }).waitFor();
    await T("You're owed €84").waitFor();
    await T('After 15 expenses, €1,261 in all').waitFor();
    // Changed to exact amounts: they have to add up to what it cost before it can be saved.
    await R('button', { name: `${pastry}. You paid · split 5 ways. €25. Change` }).click();
    await R('radio', { name: 'Exact amounts' }).click();
    for (const name of ['Lea', 'You', 'Kai', 'Lena']) await L(`${name}: how much`).fill('4');
    await T('€9 still to share out').waitFor();
    await L('Ana: how much').fill('9');
    await T('That adds up').waitFor();
    await shot('split-exact');
    await sent('PATCH', /^\/v1\/split-expenses\/[^/]+$/, () => R('button', { name: 'Save' }).click());
    await T("You're owed €85").waitFor();
    // And by shares: Nora takes two of six.
    await R('button', { name: new RegExp(`^${pastry}\\.`) }).click();
    await R('radio', { name: 'By shares' }).click();
    for (const name of ['Lea', 'Kai', 'Lena', 'Ana']) await L(`${name}: how many shares`).fill('1');
    await L('You: how many shares').fill('1');
    await sent('PATCH', /^\/v1\/split-expenses\/[^/]+$/, () => R('button', { name: 'Save' }).click());
    await T("You're owed €84").waitFor();
  });

  await step('split-payment', async () => {
    // Someone paid Nora back (which of them it is depends on how the fewest payments fall out with the new
    // expense): marked as made, it is counted in at once and stands under "Paid back".
    const owes = page.getByRole('button', { name: /^\w+ pays you\. €[\d.,]+\. Mark as paid$/ });
    await owes.first().waitFor();
    const payer = (await owes.first().getAttribute('aria-label')).split(' ')[0];
    await owes.first().click();
    await T(new RegExp(`^Did ${payer} pay you €[\\d.,]+\\?$`)).waitFor();
    await shot('split-payment');
    await sent('POST', /^\/v1\/splits\/[^/]+\/payments$/, () => R('button', { name: 'Mark as paid', exact: true }).click());
    const paidBack = new RegExp(`^${payer} paid you\\. €[\\d.,]+\\. Take it back$`);
    await R('button', { name: paidBack }).waitFor();
    await R('button', { name: new RegExp(`^${payer} pays you`) }).waitFor({ state: 'detached' });
    await shot('split-paid');
    // Renamed, and named back.
    await R('button', { name: 'More', exact: true }).click();
    await R('button', { name: 'Rename', exact: true }).click();
    await L('What it is called').fill(`Lisbon weekend ${tag}`);
    await sent('PATCH', /^\/v1\/splits\/[^/]+$/, () => R('button', { name: 'Save' }).click());
    await R('heading', { name: `Lisbon weekend ${tag}` }).waitFor();
    await R('button', { name: 'More', exact: true }).click();
    await R('button', { name: 'Rename', exact: true }).click();
    await L('What it is called').fill('Lisbon weekend');
    await sent('PATCH', /^\/v1\/splits\/[^/]+$/, () => R('button', { name: 'Save' }).click());
    await R('heading', { name: 'Lisbon weekend', exact: true }).waitFor();
    // The payment is taken back and the expense removed: everything stands as it did.
    await R('button', { name: paidBack }).click();
    await T('Take this payment back?').waitFor();
    await sent('DELETE', /^\/v1\/split-payments\/[^/]+$/, () => R('button', { name: 'Take it back', exact: true }).click());
    await R('button', { name: new RegExp(`^${pastry}\\.`) }).click();
    await R('button', { name: 'Remove this expense' }).click();
    await T('Remove this expense?').waitFor();
    await sent('DELETE', /^\/v1\/split-expenses\/[^/]+$/, () => R('button', { name: 'Remove it' }).click());
    await T("You're owed €64").waitFor();
    await T('After 14 expenses, €1,236 in all').waitFor();
    await R('button', { name: 'Kai pays you. €20. Mark as paid' }).waitFor();
  });

  await step('split-scan-and-delete', async () => {
    // A receipt is scanned into a split the same way a bill is: a split of its own, started and deleted here.
    await R('button', { name: 'Back', exact: true }).click();
    await R('button', { name: 'Shared costs. See all' }).click();
    await R('heading', { name: 'Shared costs' }).waitFor();
    await shot('splits');
    await R('button', { name: 'Start keeping count' }).click();
    await L('What is it for').fill(`Coffee run ${tag}`);
    await sent('POST', /^\/v1\/splits$/, () => R('button', { name: 'Start', exact: true }).click());
    await R('heading', { name: `Coffee run ${tag}` }).waitFor();
    await T('Nothing added yet').waitFor();
    await T("You're even").waitFor();
    // (The sheet she named it in is still sliding away, quicker than a person could go on. In a browser a sheet
    // keeps the keyboard to itself until it is gone, so what is typed next would be lost.)
    await sheetGone();
    await R('button', { name: 'Scan', exact: true }).click();
    await T('What does it say?').waitFor();
    await L('The lines on the paper').fill(['Pastelaria Santo António', '2 pastel de nata 3,60', '1 galão 1,90', 'Total 5,50 EUR'].join('\n'));
    await sent('POST', /^\/v1\/bills\/read$/, () => R('button', { name: 'Read it' }).click());
    await T('Read from “Total 5,50 EUR”').waitFor();
    await shot('split-scan');
    await sent('POST', /^\/v1\/splits\/[^/]+\/expenses$/, () => R('button', { name: 'Add expense' }).click());
    await R('button', { name: 'Pastelaria Santo António. You paid · split 5 ways. €5.50. Change' }).waitFor();
    await T("You're owed €4.40").waitFor();
    // Each of the other four owes her their part, and one of them is reminded. (Here, so that the sample
    // split keeps its "Remind" buttons as they are drawn: a reminder can't be taken back.)
    await sent('PUT', /^\/v1\/splits\/[^/]+\/reminders\/[^/]+$/, () => page.getByRole('button', { name: /^Remind \w+$/ }).first().click());
    await T('Reminded', { exact: true }).waitFor();
    await shot('split-reminded');
    await R('button', { name: 'More', exact: true }).click();
    await R('button', { name: 'Delete', exact: true }).click();
    await T('Delete this?').waitFor();
    await sent('DELETE', /^\/v1\/things\/[^/]+$/, () => R('button', { name: 'Delete it' }).click());
    await R('heading', { name: 'Shared costs' }).waitFor();
    await R('button', { name: new RegExp(`^Coffee run ${tag}`) }).waitFor({ state: 'detached' });
    await R('button', { name: 'Back', exact: true }).click();
    // Back to the family for what follows.
    await R('button', { name: 'Lisbon crew. Change circle' }).click();
    await R('button', { name: /^The Linds\./ }).click();
    await R('button', { name: 'The Linds. Change circle' }).waitFor();
  });

  const secret = `Surprise fund ${tag}`;
  let secretId;
  let ines;
  let inesMember;

  await step('a-sheet-only-nora-sees', async () => {
    // In a family a new thing is yours alone until you share it.
    await R('button', { name: 'Add something' }).click();
    await R('button', { name: 'Sheet', exact: true }).click();
    await R('heading', { name: 'New sheet' }).waitFor();
    await L('Name of the sheet').fill(secret);
    await R('button', { name: 'Seen by Only you. Change' }).waitFor();
    await shot('new-sheet');
    await sent('POST', /^\/v1\/sheets$/, () => R('button', { name: 'Start blank' }).click());
    await R('heading', { name: secret }).waitFor();
    await R('button', { name: 'Seen by: Only you. Change who can see this' }).waitFor();
    secretId = page.url().split('/sheet/')[1].split(/[?#]/)[0];

    // A second person joins The Linds with the link its owner has, and opens Money.
    ines = await ctx.second('Ines Demo');
    const code = (await ctx.api(nora, 'GET', `/v1/circles/${linds.id}`)).joinUrl.split('/').pop();
    await ines.page.goto(`${WEB_URL}/join/${code}`);
    await ines.R('heading', { name: 'Join The Linds?' }).waitFor({ timeout: 20000 });
    await ines.R('button', { name: 'Join', exact: true }).click();
    await ines.R('button', { name: 'The Linds. Change circle' }).waitFor({ timeout: 20000 });
    inesMember = (await ctx.api(ines.token, 'GET', '/v1/circles')).find((circle) => circle.id === linds.id).myMemberId;
    await ines.R('tab', { name: 'Money' }).click();
    await ines.T('Due soon').waitFor({ timeout: 20000 });
    // She can't find Nora's sheet: not on Money, not among the sheets, not in search, not by its address.
    await ines.R('button', { name: 'Norway budget. Trip' }).waitFor();
    if (await ines.page.getByText(secret).count()) throw new Error('Money showed the second person a sheet only Nora may see');
    await ines.R('button', { name: 'Sheets. See all' }).click();
    await ines.R('button', { name: /^Norway budget\./ }).waitFor();
    if (await ines.page.getByText(secret).count()) throw new Error('the list of sheets showed a sheet only Nora may see');
    await ines.shot('sheets-not-shared');
    await ines.page.goto(`${WEB_URL}/search?place=money`);
    await ines.L('Search The Linds').fill(secret);
    await ines.T(`Nothing found for “${secret}”`).waitFor();
    ctx.expectNotFound = true;
    await ines.page.goto(`${WEB_URL}/sheet/${secretId}`);
    await ines.R('heading', { name: "This isn't available" }).waitFor({ timeout: 20000 });
    await ines.shot('sheet-not-shared');
    ctx.expectNotFound = false;
  });

  await step('shared-and-found', async () => {
    // Nora shares it with the family on the sheet behind its chip...
    await R('button', { name: 'Seen by: Only you. Change who can see this' }).click();
    await T('Who can see this?').waitFor();
    await R('radio', { name: /^Everyone in The Linds/ }).click();
    await sent('PUT', /^\/v1\/things\/[^/]+\/audience$/, () => R('button', { name: 'Done' }).click());
    await R('button', { name: 'Seen by: The Linds. Change who can see this' }).waitFor();
    // ...and the second person finds it: among the sheets, in search, and at its address.
    await ines.page.goto(`${WEB_URL}/money/sheets`);
    await ines.R('button', { name: new RegExp(`^${secret}\\.`) }).waitFor({ timeout: 20000 });
    await ines.shot('sheets-shared');
    await ines.page.goto(`${WEB_URL}/search?place=money`);
    await ines.L('Search The Linds').fill(secret);
    await ines.R('button', { name: new RegExp(`^${secret}\\.`) }).waitFor();
    await ines.page.goto(`${WEB_URL}/sheet/${secretId}`);
    await ines.R('heading', { name: secret }).waitFor({ timeout: 20000 });
    await ines.shot('sheet-shared');
  });

  await step('money-is-shut-for-a-teen', async () => {
    // Nora makes her a teen (through the API): for a teen, Money is there and says it is shut.
    await ctx.api(nora, 'PATCH', `/v1/members/${inesMember}`, { role: 'teen' });
    await ines.page.goto(`${WEB_URL}/?place=money`);
    await ines.R('heading', { name: 'Money is shut for you' }).waitFor({ timeout: 20000 });
    await ines.T('In The Linds, Money is for the adults. Ask one of them if you need something from it.').waitFor();
    if (await ines.page.getByText('Due soon').count()) throw new Error('Money showed a teen the bills');
    await ines.shot('money-shut');
    // The sheet goes again, the second person leaves the family, and her phone is put away.
    await R('button', { name: 'More', exact: true }).click();
    await R('button', { name: 'Delete the sheet' }).click();
    await sent('DELETE', /^\/v1\/things\/[^/]+$/, () => R('button', { name: 'Delete the sheet' }).click());
    await ctx.api(nora, 'DELETE', `/v1/members/${inesMember}`);
    await ines.close();
    await R('tab', { name: 'Home' }).waitFor();
    await ctx.signOut();
  });
};
