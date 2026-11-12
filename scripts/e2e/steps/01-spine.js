// Milestone 1, the spine, as far as it is built: welcome, how it works, signing in with a new email and the
// test code, creating a profile with a photo, the stand-in for setting up a circle, Home and the other tabs,
// You, appearance, logging out; then signing in again as the same person, the notification settings, and
// deleting the account.
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
    // Setting up a circle is still to be built: its place ends sign-up with one button.
    await T('Set up a circle').waitFor({ timeout: 20000 });
    await shot('setup');
    await R('button', { name: 'Go to Home' }).click();
  });

  await step('home', async () => {
    await R('tab', { name: 'Home' }).waitFor();
    await R('heading', { name: 'Home' }).waitFor();
    await shot('home');
    // Losing the connection shows a calm strip across the top; it goes when the connection is back.
    await page.context().setOffline(true);
    await T("You're offline").waitFor();
    await shot('offline');
    await page.context().setOffline(false);
    await T("You're offline").waitFor({ state: 'detached' });
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
    await R('heading', { name: 'Home' }).waitFor({ timeout: 20000 });
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
};
