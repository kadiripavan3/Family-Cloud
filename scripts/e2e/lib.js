// The walk-through's tools: the browser it drives, how a step is run and named, the screenshots, what goes
// wrong on the way (errors in the page, and answers from the API that are not a yes), and a way to make other
// people through the API. `walkthrough.js` starts it once and hands it to every milestone's steps as `ctx`.
const path = require('path');
const { chromium } = require('playwright');

/** The photos the designs use: what a person in the walk-through picks from their phone. */
const IMG = path.join(__dirname, '../../design/hub/img');
const API_URL = (process.env.API_URL || 'http://localhost:8080').replace(/\/+$/, '');
const WEB_URL = (process.env.WEB_URL || 'http://localhost:8081').replace(/\/+$/, '');
/** The phone the screens are drawn for, and how sharp its pictures are. */
const VIEWPORT = { width: 390, height: 844 };
const SHARPNESS = 2;
/** The test sign-in's code (the API's local profile). */
const CODE = '123456';

/**
 * Opens the browser and returns everything the steps use:
 *
 *   page                 the app, as one person's phone
 *   T, R, L              find by text, by role, by label: always the last match (see below)
 *   step(name, fn)       one named part of the walk; the first that fails ends it and leaves a screenshot
 *   shot(name)           a numbered screenshot of the app
 *   signIn(email)        from the welcome screen into the app, as someone who has an account (nora@example.com
 *                        is the sample person); signOut() goes back to the welcome screen
 *   second(name)         a second, new person on a second phone, signed in: { page, T, R, L, shot, signOut,
 *                        close, name, email, token }. For the steps where sharing matters: what one shares,
 *                        the other must or must not find
 *   webPage, opened      a web page the API serves: by its address, or as the tab a tap opens
 *   api(token, …)        a call to the API, as someone else or as nobody
 *   signUp(name)         another person, made through the API: signed in there, with a profile
 *   errors               what went wrong on the way; `expectNotFound = true` while a "not there" is meant
 *   tag                  a few letters that are different in every run, for emails that must be new
 *
 * Every steps file starts signed out, on the welcome screen, and ends there.
 */
async function start(out, scheme) {
  const tag = Math.random().toString(36).slice(2, 7);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: SHARPNESS, colorScheme: scheme, permissions: ['clipboard-read', 'clipboard-write'] });
  const errors = [];
  const ctx = { out, scheme, tag, browser, page, errors, expectNotFound: false, API_URL, WEB_URL, IMG, CODE };

  // What goes wrong on any phone of the walk is kept: errors in the page, and answers of the API that are not a yes.
  const watch = (phonePage) => {
    phonePage.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    phonePage.on('console', (m) => {
      if (m.type() === 'error' && !(ctx.expectNotFound && /404/.test(m.text()))) errors.push('console: ' + m.text().slice(0, 300));
    });
    phonePage.on('response', (r) => {
      if (r.status() >= 400 && r.url().startsWith(API_URL) && !(ctx.expectNotFound && r.status() === 404)) errors.push(`http ${r.status()} ${r.request().method()} ${r.url()}`);
    });
  };
  watch(page);

  let n = 0;
  const file = (name) => `${out}/${scheme}-${String((n += 1)).padStart(2, '0')}-${name}.png`;

  /**
   * What the steps use of one phone: the ways to find things on it, a screenshot, signing in and out.
   * Screens underneath the current one stay in the page on the web, so finding always takes the last
   * (topmost) match.
   */
  const phone = (phonePage) => {
    const T = (...a) => phonePage.getByText(...a).last();
    const R = (...a) => phonePage.getByRole(...a).last();
    const L = (...a) => phonePage.getByLabel(...a).last();
    const shot = async (name) => {
      await phonePage.waitForTimeout(900);
      await phonePage.screenshot({ path: file(name) });
      console.log('shot', name, phonePage.url());
    };
    /** From the welcome screen into the app, as someone who has an account already. Ends on Home, or on setting up a circle for someone who is in none. */
    const signIn = async (email) => {
      await R('button', { name: 'I already have an account' }).click();
      await R('button', { name: 'Continue with email' }).click();
      await L('Email', { exact: true }).fill(email);
      await R('button', { name: 'Send code' }).click();
      await T('Check your email').waitFor();
      await L('6-digit code').fill(CODE);
      await phonePage.getByRole('tab', { name: 'Home' }).or(phonePage.getByRole('button', { name: 'Just me for now' })).last().waitFor({ timeout: 20000 });
    };
    /** From anywhere under the tabs back to the welcome screen. */
    const signOut = async () => {
      await R('tab', { name: 'You' }).click();
      await T('Export and leaving').waitFor();
      const logOut = phonePage.getByRole('button', { name: 'Log out' });
      // Log out is on You, or one page further in, under "Export and leaving".
      if (!(await logOut.last().isVisible().catch(() => false))) await R('button', { name: /^Export and leaving/ }).click();
      await logOut.last().click();
      await T('Get started').waitFor({ timeout: 20000 });
    };
    return { page: phonePage, T, R, L, shot, signIn, signOut };
  };
  Object.assign(ctx, phone(page));

  // A failure names its step and the line of the steps file that was waiting, and leaves a screenshot.
  ctx.step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      await page.screenshot({ path: `${out}/${scheme}-FAILED-${name}.png` }).catch(() => undefined);
      const [, where, line] = String(e.stack).match(/steps[\\/]([\w-]+\.js):(\d+)/) || [];
      // Where the screenshot can't be looked at (a CI log), say what was on the screen and what went wrong on the way.
      const seen = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(-700)).catch(() => '(the page could not be read)');
      console.log(`WHEN IT FAILED the address was ${page.url()}`);
      console.log(`ON THE SCREEN (the end of it): ${seen}`);
      console.log(`ERRORS SO FAR: ${JSON.stringify(errors.slice(-12))}`);
      throw new Error(`${name}${where ? ` (${where}, line ${line})` : ''}: ${e.message.split('\n')[0]}`);
    }
  };

  /**
   * A second, new person on a second phone: made through the API (an account and a profile), then signed in
   * through the screens of their own browser. They are in no circle yet, so they land on setting one up;
   * `await them.page.goto(WEB_URL + '/join/<code>')` takes them to an invitation. `close()` puts their
   * phone away and deletes their account, so a run leaves nobody behind in the sample circles.
   */
  ctx.second = async (name) => {
    const who = await ctx.signUp(name);
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SHARPNESS, colorScheme: scheme, permissions: ['clipboard-read', 'clipboard-write'] });
    const theirs = await context.newPage();
    watch(theirs);
    const them = phone(theirs);
    await theirs.goto(WEB_URL + '/');
    await them.T('Get started').waitFor({ timeout: 20000 });
    await them.signIn(who.email);
    const close = async () => {
      await context.close();
      await ctx.api(who.token, 'DELETE', '/v1/me').catch(() => undefined);
    };
    return { ...who, ...them, close };
  };

  // The web pages the API serves (an invitation, the legal pages) open in a tab of their own.
  const webShot = async (web, expected, name) => {
    await web.waitForLoadState();
    await web.getByText(expected).first().waitFor();
    await web.screenshot({ path: file(name), fullPage: true });
    console.log('shot', name, web.url());
  };
  const signedOut = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SHARPNESS, colorScheme: scheme });
  /** A web page by its address, as someone who is not signed in. */
  ctx.webPage = async (url, expected, name) => {
    const web = await signedOut.newPage();
    await web.goto(url);
    await webShot(web, expected, name);
    await web.close();
  };
  /** The web page a tap in the app opens. */
  ctx.opened = async (open, expected, name) => {
    const [web] = await Promise.all([page.context().waitForEvent('page'), open()]);
    await webShot(web, expected, name);
    await web.close();
  };

  /** A call to the API from outside the app. `token` says who is asking; null for nobody. */
  ctx.api = async (token, method, address, body) => {
    const response = await fetch(API_URL + address, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`${method} ${address} gave ${response.status}`);
    return response.status === 204 ? null : response.json();
  };

  /**
   * Another person, made through the API instead of through the screens: signed in with the test code and
   * given a profile. For the steps that need someone else to share with or to hide from. Returns their
   * email and their token, to go on with `api(token, …)`.
   */
  ctx.signUp = async (name) => {
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.${tag}@example.com`;
    const token = (await ctx.api(null, 'POST', '/local-auth/token', { email, code: CODE })).accessToken;
    await ctx.api(token, 'PUT', '/v1/me/profile', { displayName: name, ageConfirmed: true });
    return { name, email, token };
  };

  return ctx;
}

module.exports = { start, API_URL, WEB_URL, VIEWPORT };
