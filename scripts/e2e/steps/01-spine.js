// Milestone 1, the spine, as far as it is built: welcome, how it works, signing in with a new email and the
// test code, creating a profile with a photo, the stand-in for setting up a circle (a circle of one), Home
// with its six places and the sheet that changes circles, the other tabs, You, appearance, logging out;
// then signing in again as the same person, the notification settings, and deleting the account. Last, as
// Nora with the sample circles: changing circles, a thing opened by its address, and the audience sheet.
const path = require('path');

exports.run = async function run(ctx) {
  const { page, T, R, L, shot, step, tag, WEB_URL, IMG, CODE } = ctx;
  const email = `nora.${tag}@example.com`;

  /** From the sign-in screen to the moment the code is in: the same for a new person and for one coming back. */
  const signInByEmail = async () => {
    await R('button', { name: 'Continue with email' }).click();
    await L('Email', { exact: true }).fill(email);
    await R('button', { name: 'Send code' }).click();
    await T('Check your email').waitFor();
    await L('6-digit code').fill(CODE);
  };

  await step('welcome', async () => {
    await page.goto(WEB_URL + '/');
    await T('Everything your people keep, together.').waitFor({ timeout: 20000 });
    await T('One account with Journey').waitFor();
    await shot('welcome');
    await R('button', { name: 'Get started' }).click();
  });

  await step('how-it-works', async () => {
    // Three cards, and Skip is there on each of them.
    await T('One home for what you share').waitFor();
    await R('button', { name: 'Skip' }).waitFor();
    await shot('how-it-works');
    await R('button', { name: 'Next', exact: true }).click();
    await T('Shared with exactly who you choose').waitFor();
    await shot('how-it-works-you-choose');
    await R('button', { name: 'Next', exact: true }).click();
    await T('Six places, one tap apart').waitFor();
    await shot('how-it-works-six-places');
    await R('button', { name: 'Next', exact: true }).click();
  });

  await step('sign-in', async () => {
    await T('Log in or sign up').waitFor();
    await T('Your Journey account works here too.').waitFor();
    await shot('sign-in');
    // Apple is switched on with the real services; until then the screen says so instead of doing nothing.
    await R('button', { name: 'Continue with Apple' }).click();
    await T('Apple sign-in is switched on later. Use your email for now.').waitFor();
    await R('button', { name: 'Continue with email' }).click();
    await T("What's your email?").waitFor();
    await L('Email', { exact: true }).fill(email);
    await shot('email');
    await R('button', { name: 'Send code' }).click();
    await T('Check your email').waitFor();
    await T(email).waitFor();
    await shot('code');
    await L('6-digit code').fill(CODE);
  });

  await step('create-profile', async () => {
    await T('Create your profile').waitFor();
    await L('Name', { exact: true }).fill('Nora Lind');
    // Accounts are for people aged 13 and over: Continue waits for the tick.
    if ((await R('button', { name: 'Continue', exact: true }).getAttribute('aria-disabled')) !== 'true') throw new Error('Continue did not wait for the age confirmation');
    await R('checkbox', { name: "I'm 13 or older" }).click();
    await R('checkbox', { name: "I'm 13 or older", checked: true }).waitFor();
    // A photo from the phone: it goes up when the profile is saved.
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), R('button', { name: 'Add a photo' }).click()]);
    await chooser.setFiles(path.join(IMG, 'av-me.jpg'));
    await R('button', { name: 'Change your photo' }).waitFor();
    await shot('create-profile');
    await R('button', { name: 'Continue', exact: true }).click();
  });

  await step('setup', async () => {
    // Setting up a circle is still to be built: its place offers a circle of one, and Home opens on it.
    await T('Set up a circle').waitFor({ timeout: 20000 });
    await shot('setup');
    await R('button', { name: 'Just me for now' }).click();
  });

  await step('home', async () => {
    // The search pill, the row of six places with Today chosen, and Today under it.
    await R('tab', { name: 'Home' }).waitFor({ timeout: 20000 });
    await R('tab', { name: 'Today', selected: true }).waitFor();
    await T('Find anything').waitFor();
    for (const place of ['Plan', 'Notes', 'Library', 'Money', 'Vault']) await R('tab', { name: place, selected: false }).waitFor();
    await shot('home');
    // The place that is showing is part of the address, and the pill says what a search from there finds.
    await R('tab', { name: 'Money' }).click();
    await R('tab', { name: 'Money', selected: true }).waitFor();
    await T('Search money').waitFor();
    await page.waitForURL(/[?&]place=money/);
    await shot('home-money');
    await R('tab', { name: 'Today' }).click();
    await T('Find anything').waitFor();
    await page.waitForURL((url) => !url.search.includes('place='));
    // Losing the connection shows a calm strip across the top; it goes when the connection is back.
    await page.context().setOffline(true);
    await T("You're offline").waitFor();
    await shot('offline');
    await page.context().setOffline(false);
    await T("You're offline").waitFor({ state: 'detached' });
  });

  await step('circle-switch', async () => {
    // The round button in the pill is the circle you are in: here the circle of one.
    await R('button', { name: 'Just me. Change circle' }).click();
    await T('Your circles').waitFor();
    await T('New circle').waitFor();
    await shot('circle-switch');
    await R('button', { name: /^Just me/ }).click();
    await T('Your circles').waitFor({ state: 'detached' });
  });

  await step('tabs', async () => {
    await R('tab', { name: 'People' }).click();
    await R('heading', { name: 'People' }).waitFor();
    await shot('people');
    await R('tab', { name: 'Activity' }).click();
    await R('heading', { name: 'Activity' }).waitFor();
    await shot('activity');
    // The + button opens over the tab it was pressed on, and closes back to it.
    await R('button', { name: 'Add something' }).click();
    await R('heading', { name: 'Add something' }).waitFor();
    await shot('plus');
    await R('button', { name: 'Close' }).click();
    await R('heading', { name: 'Activity' }).waitFor();
  });

  await step('you', async () => {
    await R('tab', { name: 'You' }).click();
    await R('heading', { name: 'Nora', exact: true }).waitFor();
    await T('Nora Lind', { exact: true }).waitFor();
    await T('Your circles').waitFor();
    await shot('you');
  });

  await step('appearance', async () => {
    await R('button', { name: /^Appearance/ }).click();
    await T('Theme').waitFor();
    await shot('appearance');
    // The whole app changes at once, and the row on You says which one is chosen.
    const other = ctx.scheme === 'dark' ? 'Light' : 'Dark';
    await R('button', { name: new RegExp(`^${other}\\.`) }).click();
    await shot(`appearance-${other.toLowerCase()}`);
    await R('button', { name: 'Back' }).click();
    await R('button', { name: `Appearance. ${other}` }).waitFor();
    await shot(`you-${other.toLowerCase()}`);
    await R('button', { name: /^Appearance/ }).click();
    await R('button', { name: /^Automatic\./ }).click();
    await R('button', { name: 'Back' }).click();
    await R('button', { name: 'Appearance. Automatic' }).waitFor();
  });

  await step('log-out', async () => {
    await R('button', { name: 'Log out' }).click();
    await T('Get started').waitFor({ timeout: 20000 });
    await shot('after-log-out');
  });

  await step('sign-in-again', async () => {
    // Someone with an account goes straight to signing in, and straight to Home after it: no profile to make.
    await R('button', { name: 'I already have an account' }).click();
    await T('Log in or sign up').waitFor();
    await signInByEmail();
    await R('tab', { name: 'Home' }).waitFor({ timeout: 20000 });
    await T('Find anything').waitFor();
    await R('tab', { name: 'You' }).click();
    await T('Nora Lind', { exact: true }).waitFor();
  });

  await step('notification-settings', async () => {
    await R('button', { name: 'Notifications', exact: true }).click();
    await T('Tell me about').waitFor();
    // A browser can't have notifications: the page says so in a sentence.
    await T(/^Notifications arrive on your phone\./).waitFor();
    // A switch shows its new state and is saved: it is still off after the page is opened again.
    await R('switch', { name: 'The Sunday summary', checked: true }).waitFor();
    const [saved] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith('/v1/me/settings')),
      R('switch', { name: 'The Sunday summary' }).click(),
    ]);
    if (!saved.ok()) throw new Error(`saving the switch gave ${saved.status()}`);
    await R('switch', { name: 'The Sunday summary', checked: false }).waitFor();
    await shot('notification-settings');
    await R('button', { name: 'Back' }).click();
    await R('button', { name: 'Notifications', exact: true }).click();
    await T('Tell me about').waitFor();
    await R('switch', { name: 'The Sunday summary', checked: false }).waitFor();
    await R('switch', { name: 'What happens in your circles', checked: true }).waitFor();
    await R('button', { name: 'Back' }).click();
  });

  await step('delete-account', async () => {
    await R('button', { name: 'Delete account' }).click();
    await T('Delete your account?').waitFor();
    await shot('delete-account');
    await R('button', { name: 'Delete my account' }).click();
    await T('Get started').waitFor({ timeout: 20000 });
    await shot('after-delete');
  });

  // As Nora, who is in three circles of three kinds (the sample people).
  let nora;
  await step('nora-circles', async () => {
    await ctx.signIn('nora@example.com');
    // Home opens on her first circle, the family.
    await R('button', { name: 'The Linds. Change circle' }).click();
    await R('button', { name: 'The Linds. Family · 4 people and Biscuit. You are here' }).waitFor();
    await R('button', { name: 'Nora and Alex. Couple · 2 people' }).waitFor();
    await shot('circle-switch-nora');
    // Another circle is another Home, and it stays the current one on every tab.
    await R('button', { name: 'Lisbon crew. Friends · 5 people' }).click();
    await R('button', { name: 'Lisbon crew. Change circle' }).waitFor();
    await R('tab', { name: 'People' }).click();
    await R('tab', { name: 'Home' }).click();
    await R('button', { name: 'Lisbon crew. Change circle' }).click();
    await R('button', { name: /^The Linds\./ }).click();
    await R('button', { name: 'The Linds. Change circle' }).waitFor();
    nora = (await ctx.api(null, 'POST', '/local-auth/token', { email: 'nora@example.com', code: CODE })).accessToken;
  });

  // (This loads the app afresh, so it comes last.)
  await step('a-thing-by-its-address', async () => {
    const circles = await ctx.api(nora, 'GET', '/v1/circles');
    const linds = circles.find((circle) => circle.name === 'The Linds');
    const pages = (await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/pages`)).items;
    const wifi = pages.find((one) => one.chip.audience === 'some');
    // A thing is at /<its kind>/<its id>. Until its place builds that screen, it says what it is and waits.
    await page.goto(`${WEB_URL}/page/${wifi.id}`);
    await R('heading', { name: wifi.title }).waitFor({ timeout: 20000 });
    await T(/^This is a page\. It opens here once Notes is built/).waitFor();
    await shot('thing-to-come');
    // Its chip says who sees it, and opens the one sheet that changes that.
    await R('button', { name: /^Seen by: Alex, Mia and you/ }).click();
    await T('Who can see this?').waitFor();
    await R('radio', { name: /^Some people/, checked: true }).waitFor();
    await R('button', { name: 'Alex: Can edit. Change' }).waitFor();
    await R('button', { name: 'Mia: Can view. Change' }).waitFor();
    await R('button', { name: "Leo: Can't see it. Change" }).waitFor();
    await shot('audience');
    await R('button', { name: 'Done' }).click();
    await T('Who can see this?').waitFor({ state: 'detached' });
    // An address that is no thing's has no screen.
    await page.goto(`${WEB_URL}/page/nothing-here`);
    await T("There's nothing at this address").waitFor({ timeout: 20000 });
    await R('button', { name: 'Go to Home' }).click();
    await R('button', { name: 'The Linds. Change circle' }).waitFor({ timeout: 20000 });
    await ctx.signOut();
  });
};
