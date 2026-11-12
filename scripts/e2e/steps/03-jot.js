// Milestone 3, Jot: adding things without opening the app. As Nora, in The Linds: the jot bar (opened by its
// address, the way a widget, a quick-settings tile or a long press on the icon opens it), what was filed,
// voice, sharing a letter in, the widgets, the Lock Screen, the pinned note and the ways in.
//
// What only a phone can do is stood in as docs/06-build-plan.md says: a typed sentence for the microphone,
// a picked text file for another app's share button. The widgets, the Lock Screen and the pinned note are
// the app's own pictures of them here; the real ones are native code that first runs on a phone build.
const fs = require('fs');
const path = require('path');

const LETTER =
  'Class 4B is going to the Postojna caves on Friday 20 November at 8:00. The bus leaves from the school gate and we will be back by four. ' +
  'Please sign the attached form and return it by Wed 18 Nov. The trip costs €12, to be paid to the school together with the form. ' +
  'Children should bring a warm jacket, good shoes and a snack.';

exports.run = async function run(ctx) {
  const { page, T, R, L, shot, step, WEB_URL, out } = ctx;
  const back = () => R('button', { name: 'Back', exact: true }).click();
  /** The number in "7 left" on the shopping list's widget. */
  const left = async () => Number((await page.getByText(/^\d+ left$/).last().innerText()).split(' ')[0]);

  await ctx.signIn('nora@example.com');

  await step('jot-bar', async () => {
    // What the widget's line, the tile and the long press open: the app, straight onto the bar.
    await page.goto(WEB_URL + '/jot');
    await L('Jot something down').waitFor({ timeout: 30000 });
    await R('button', { name: 'Add', exact: true, disabled: true }).waitFor();

    // Two things to buy in one line: read while typing, filed on Enter, and the bar stays for the next.
    await L('Jot something down').fill('milk and eggs');
    await T('Milk · Groceries').waitFor();
    await T('Eggs · Groceries').waitFor();
    await L('Jot something down').press('Enter');
    await R('button', { name: 'Undo Milk' }).waitFor();
    await R('button', { name: 'Undo Eggs' }).click();
    await R('button', { name: 'Undo Eggs' }).waitFor({ state: 'detached' });
    if ((await L('Jot something down').inputValue()) !== '') throw new Error('The bar kept the line after filing it');

    // A time makes a reminder.
    await L('Jot something down').fill('Call the dentist tomorrow at 9');
    await T('Call the dentist · tomorrow 9:00').waitFor();
    await shot('jot-bar');
    await L('Jot something down').press('Enter');
    await T('Reminder · tomorrow 9:00').waitFor();

    // Something that looks like a code is held back until Nora says where it goes.
    await L('Jot something down').fill('The alarm code is 7302');
    await T('Alarm code 7302 · looks like a code').waitFor();
    await R('button', { name: 'Add', exact: true }).click();
    await T('“Alarm code 7302” looks like a code').waitFor();
    await T("It hasn't been kept anywhere yet.").waitFor();
    await R('button', { name: 'Keep in the Vault' }).waitFor();
    await shot('jot-bar-code');
    await R('button', { name: "It's just a note" }).click();
    await R('button', { name: 'Undo Alarm code 7302' }).waitFor();
    await T('“Alarm code 7302” looks like a code').waitFor({ state: 'detached' });
  });

  await step('jot-filed', async () => {
    await R('button', { name: 'What was filed today' }).click();
    // Milk, the dentist and the note that was a code, filed just now. What Nora jotted this morning is under it.
    await T(/\d+ filed just now$/).waitFor();
    await T('earlier today').waitFor();
    await T('“Gate code 4471” looks like a code').waitFor();
    await shot('jot-filed');

    // The dentist isn't something to do, it is somewhere to be: moved from a reminder to an event. (The
    // latest is the first on the page; an earlier run of this walk may have left another further down.)
    const events = await page.getByText('Event · tomorrow 9:00', { exact: true }).count();
    await page.getByRole('button', { name: 'Move Call the dentist' }).first().click();
    await T('Move “Call the dentist”').waitFor();
    await T('It is this now').waitFor();
    await shot('jot-filed-move');
    await R('button', { name: /^An event/ }).click();
    await T('Move “Call the dentist”').waitFor({ state: 'detached' });
    await page.getByText('Event · tomorrow 9:00', { exact: true }).nth(events).waitFor();
  });

  await step('jot-voice', async () => {
    await R('button', { name: 'Say it all at once' }).click();
    await T('On a phone you hold a mic and say it in one breath. Here, type or paste the sentence.').waitFor();
    await L('What you would say').fill('dentist for Mia Tuesday at 3, buy plasters, and remind Alex about the bins');
    await T('Three things').waitFor();
    await R('checkbox', { name: /^Dentist\. Event · .* · for Mia$/, checked: true }).waitFor();
    await R('checkbox', { name: 'Plasters. Groceries', checked: true }).waitFor();
    await R('checkbox', { name: 'The bins. Reminder · given to Alex', checked: true }).waitFor();
    // Each one can be left out before adding, and taken back in.
    await R('checkbox', { name: 'Plasters. Groceries' }).click();
    await R('button', { name: 'Add two' }).waitFor();
    await R('checkbox', { name: 'Plasters. Left out' }).click();
    await shot('jot-voice');
    // The microphone itself comes with the phone build, and says so.
    await R('button', { name: 'Hold to speak' }).click();
    await T(/^The microphone comes with the phone build/).waitFor();
    await R('button', { name: 'Add all three' }).click();
    // It lands on what was filed: three more, each in its place.
    await T(/\d+ filed just now$/).waitFor();
    await T('Dentist · Mia', { exact: true }).waitFor();
    await T('Plasters', { exact: true }).waitFor();
    await T('Asked Alex', { exact: true }).waitFor();
    await shot('jot-filed-after-voice');
  });

  await step('jot-ways', async () => {
    await back();
    await R('button', { name: 'Close', exact: true }).waitFor();
    await R('button', { name: 'Ways in' }).click();
    await T('Ways to add something without opening the app.').waitFor();
    await T('Where a jot goes').waitFor();
    // A switch is saved the moment it is flipped; what its part still needs is said under the switches.
    const saved = () => page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith('/jot-ways') && r.ok());
    await Promise.all([saved(), R('switch', { name: 'Voice' }).click()]);
    await R('switch', { name: 'Voice', checked: false }).waitFor();
    await Promise.all([saved(), R('switch', { name: 'Voice' }).click()]);
    await R('switch', { name: 'Voice', checked: true }).waitFor();
    await T(/^Saved\. “Hey Siri, jot…” and the mics come with the phone build/).waitFor();
    await shot('jot-ways');

    // A way that only the phone has says so.
    await R('button', { name: /^A button on the phone/ }).click();
    await T(/^Once Homeport is installed from a phone build/).waitFor();
    await shot('jot-ways-button');
    await R('button', { name: 'Got it' }).click();
    await R('button', { name: 'Copy the address' }).click();
    await T(/^Receiving email isn't connected yet/).waitFor();
    await R('button', { name: 'Got it' }).click();

    // Where a jot with a time goes when the words don't say: changed, and changed back.
    await R('button', { name: /^A day or a time/ }).click();
    await Promise.all([saved(), R('button', { name: /^Event\. On the calendar/ }).click()]);
    await R('button', { name: 'A day or a time. Event' }).click();
    await Promise.all([saved(), R('button', { name: /^Reminder\. Something to do/ }).click()]);
    await R('button', { name: 'A day or a time. Reminder' }).waitFor();
    await R('button', { name: /^Something to buy\. Groceries/ }).click();
    await T('Something to buy goes to').waitFor();
    await shot('jot-ways-buy');
    await Promise.all([saved(), R('button', { name: /^The circle's shopping list/ }).click()]);
  });

  await step('jot-share', async () => {
    await R('button', { name: 'Share from any app. See how it looks' }).click();
    await T(/^On a phone, any app's share button hands the letter over/).waitFor();
    // A text file picked here stands in for what another app's share button hands over.
    const file = path.join(out, 'School trip.txt');
    fs.writeFileSync(file, LETTER);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), R('button', { name: 'Pick a text file' }).click()]);
    await chooser.setFiles(file);
    await T('School trip.txt').waitFor();
    await shot('jot-share-letter');
    await R('button', { name: 'Share into Homeport' }).click();
    await T('Save to Homeport').waitFor();
    await T('Read from the letter').waitFor();
    await T('Class 4B is going to the Postojna caves · Fri 20 Nov, 8:00').waitFor();
    await T('Sign the attached form and return it by Wed 18 Nov').waitFor();
    await T('€12 to pay').waitFor();
    await T('A bill, due Wed 18 Nov').waitFor();
    await R('button', { name: 'Save 4 things' }).waitFor();
    await shot('jot-share');
    // Only the trip goes on the calendar: the other three are switched off.
    for (const name of [/^Sign the attached form/, '€12 to pay', 'Keep the letter']) await R('switch', { name }).click();
    await R('button', { name: 'Save 1 thing' }).click();
    await T('Saved 1 thing').waitFor();
    await shot('jot-share-saved');
    // It is an event now, made through Plan's API, and opens as one.
    await R('button', { name: /^Class 4B is going to the Postojna caves\. Event/ }).click();
    await page.waitForURL(/\/event\/[0-9a-f-]{36}/);
    await T('Class 4B is going to the Postojna caves').waitFor();
    await page.goBack();
    await T(/^On a phone, any app's share button hands the letter over/).waitFor();
    await back();
    await T('Ways to add something without opening the app.').waitFor();
  });

  await step('jot-widgets', async () => {
    await R('button', { name: 'Widgets. See how it looks' }).click();
    await T(/^On your Home Screen these come with the phone build/).waitFor();
    const before = await left();
    // A chip adds in one tap, with nothing opening. (The chips are what this circle adds most: milk, on a new day.)
    const chip = page.getByRole('button', { name: /^Add (?!something)/ }).first();
    const added = (await chip.getAttribute('aria-label')).replace(/^Add /, '');
    await chip.click();
    await T(`${added} added to Groceries`).waitFor();
    await page.getByText(`${before + 1} left`).last().waitFor();
    // A circle ticks, and the line stays where it was.
    const line = page.getByRole('checkbox').first();
    const name = await line.getAttribute('aria-label');
    await line.click();
    await R('checkbox', { name, checked: true }).waitFor();
    await page.getByText(`${before} left`).last().waitFor();
    await shot('jot-widgets');
  });

  await step('jot-lock', async () => {
    await R('button', { name: 'See the Lock Screen' }).click();
    await T('Jot it down').waitFor();
    await T(/^Press and hold to type\. \d+ added today\.$/).waitFor();
    // Alex is at the shop with the list; its lines tick from here too.
    await T('Alex is at the shop').waitFor();
    await shot('jot-lock');
    await R('button', { name: 'Use this list on the Lock Screen' }).click();
    await R('button', { name: 'Stop using this list' }).waitFor();
    await T("You're using it").waitFor();
    await shot('jot-lock-in-use');
    await R('button', { name: 'Stop using this list' }).click();
    await T('Alex is at the shop').waitFor();
    await back();
    await T(/added to Groceries$/).waitFor();
    await back();
    await T('Ways to add something without opening the app.').waitFor();
  });

  await step('jot-pinned', async () => {
    await R('button', { name: 'Pinned note. See how it looks' }).click();
    await T('pinned · The Linds').waitFor();
    // In a browser the real note can't exist: the screen says where it lives. Its line still adds for real.
    await T(/^The real note lives in your phone's notifications/).waitFor();
    await L('Add anything').fill('Stamps');
    await L('Add anything').press('Enter');
    await page.getByText('Stamps', { exact: true }).last().waitFor();
    await L('Add anything').fill('Call the plumber tomorrow at 9');
    await shot('jot-pinned');
    await L('Add anything').fill('');
    const saved = () => page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith('/jot-ways') && r.ok());
    await Promise.all([saved(), R('switch', { name: 'Pinned note' }).click()]);
    await R('switch', { name: 'Pinned note', checked: false }).waitFor();
    await Promise.all([saved(), R('switch', { name: 'Pinned note' }).click()]);
    await R('switch', { name: 'Pinned note', checked: true }).waitFor();
    // The tile does the same from any screen: it opens the jot bar.
    await R('button', { name: 'Jot. Open the jot bar' }).waitFor();
    await back();
    await T('Ways to add something without opening the app.').waitFor();
  });

  await step('jot-leave', async () => {
    // Back from the ways in to the bar, and Close leaves the bar for Home.
    await back();
    await R('button', { name: 'Close', exact: true }).click();
    await page.getByRole('tab', { name: 'Home' }).last().waitFor();
  });

  await ctx.signOut();
};
