// Milestone 7, Keepsakes: Open when…, the birthday interview, Things they said, Same spot every year,
// Grandma's stories (with her own page, opened as someone with no account), the good things jar and the
// doorframe. Where a keepsake keeps something from someone it is walked as two people: Sam, who joins
// Nora's family through the API, opens a letter written for them (and Nora sees that it was opened), and
// sees the jar's count go up without being able to read what Nora dropped in.
//
// It can be run again and again on the same data: what an earlier run left is taken back through the API first.
const path = require('path');
const { soundFile } = require('../sound');

exports.run = async function run(ctx) {
  const { page, T, R, L, shot, step, tag, WEB_URL, IMG, CODE } = ctx;
  let nora;
  let linds;
  let sam;
  const asNora = (method, address, body) => ctx.api(nora, method, address, body);
  /** Puts the sheet that is up away, the way a person does: by tapping the dimmed page above it. */
  const closeSheet = (phone) => phone.R('button', { name: 'Close', exact: true }).click({ position: { x: 24, y: 24 } });
  const sampleBoard = async (template) => {
    const boards = (await asNora('GET', `/v1/circles/${linds.id}/boards?template=${template}&limit=50`)).items;
    return asNora('GET', `/v1/boards/${boards[boards.length - 1].id}`);
  };
  /** From the gallery: a template's card, and the board of it the circle has already. */
  const openFromGallery = async (card, row) => {
    await page.goto(WEB_URL + '/templates');
    await R('button', { name: card }).click();
    await T('In The Linds already').waitFor();
    await R('button', { name: row }).click();
  };
  const more = () => R('button', { name: 'More', exact: true });

  await step('open-when', async () => {
    await ctx.signIn('nora@example.com');
    nora = (await ctx.api(null, 'POST', '/local-auth/token', { email: 'nora@example.com', code: CODE })).accessToken;
    linds = (await asNora('GET', '/v1/circles')).find((circle) => circle.name === 'The Linds');
    // An earlier run's letter and its board for Sam are taken away first.
    const boards = (await asNora('GET', `/v1/circles/${linds.id}/boards?template=open_when&limit=50`)).items;
    for (const board of boards) {
      const whole = await asNora('GET', `/v1/boards/${board.id}`);
      if (whole.view.forPerson?.name !== 'Mia') await asNora('DELETE', `/v1/things/${board.id}`);
      else for (const letter of whole.view.letters) if (letter.when.startsWith('you need a laugh')) await asNora('DELETE', `/v1/board-entries/${letter.id}`);
    }

    await openFromGallery(/^Open when…\. Does work/, /^Open when…\. \d+ letters/);
    await R('heading', { name: 'Open when…' }).waitFor({ timeout: 20000 });
    // The chip says who the letters are for; the writer sees which were opened, and when.
    await R('button', { name: 'Seen by: For Mia. Change who can see this' }).waitFor();
    await T('Letters for Mia, from you').waitFor();
    await R('button', { name: "…you can't sleep. Sealed" }).waitFor();
    await R('button', { name: /^…you've had a bad day\. Mia opened it on \d+ \w+, at \d\d:\d\d$/ }).waitFor();
    await T('Sealed · with a voice message').waitFor();
    await T('Sealed · comes forward when Mia is on a journey').waitFor();
    await T("Mia sees the envelopes, not what's inside. Once opened, a letter is Mia's to keep.").waitFor();
    await shot('open-when');
    // The writer reads her own letter; a child without a phone opens it with her.
    await R('button', { name: "…you can't sleep. Sealed" }).click();
    await T(/^Count the stars on your ceiling/).waitFor();
    await R('button', { name: 'Open it with Mia' }).waitFor();
    await shot('open-when-letter');
    await closeSheet(ctx);
    await T(/^Count the stars on your ceiling/).waitFor({ state: 'detached' });
  });

  await step('open-when-write', async () => {
    await R('button', { name: 'Write another' }).click();
    await L('Open when…').fill('you need a laugh');
    await R('radio', { name: 'Trophy' }).click();
    await L('The letter').fill('Ask Dad to do the robot.');
    await shot('open-when-write');
    await R('button', { name: 'Seal the envelope' }).click();
    await R('button', { name: '…you need a laugh. Sealed' }).waitFor({ timeout: 20000 });
  });

  let lettersId;
  await step('open-when-two-people', async () => {
    // Sam joins Nora's family through the API (the join link is in the circle for its owner), on a second phone.
    sam = await ctx.second('Sam Demo');
    const code = (await asNora('GET', `/v1/circles/${linds.id}`)).joinUrl.split('/').pop();
    await ctx.api(sam.token, 'PUT', `/v1/join/${code}`);
    // Sam's phone still thinks Sam is in no circle: the invitation's own address opens the circle there.
    await sam.page.goto(`${WEB_URL}/join/${code}`);
    await sam.R('button', { name: 'Open The Linds' }).click();
    await sam.R('button', { name: 'The Linds. Change circle' }).waitFor({ timeout: 20000 });

    // Nora starts letters for Sam from the gallery: the template asks who they are for.
    await page.goto(WEB_URL + '/templates');
    await R('button', { name: /^Open when…\. Does work/ }).click();
    await T('Who are the letters for?').waitFor();
    if ((await R('button', { name: 'Start another' }).getAttribute('aria-disabled')) !== 'true') throw new Error('letters could be started for nobody');
    await R('button', { name: 'Sam', exact: true }).click();
    await R('button', { name: 'Seen by Only you. Change' }).click();
    await R('button', { name: 'Seen by The Linds. Change' }).waitFor();
    await shot('open-when-start');
    await R('button', { name: 'Start another' }).click();
    await T('Letters for Sam').waitFor({ timeout: 20000 });
    await R('button', { name: 'Seen by: For Sam. Change who can see this' }).waitFor();
    lettersId = page.url().match(/\/board\/([0-9a-f-]{36})/)[1];
    const secret = `You found the walk-through's letter, ${tag}.`;
    await R('button', { name: 'Write the first letter' }).click();
    await L('Open when…').fill('you are walked through');
    await L('The letter').fill(secret);
    await R('button', { name: 'Seal the envelope' }).click();
    await R('button', { name: '…you are walked through. Sealed' }).waitFor({ timeout: 20000 });

    // Sam sees the envelope and not the words, until Sam opens it.
    await sam.page.goto(`${WEB_URL}/board/${lettersId}`);
    await sam.T('Letters for you').waitFor({ timeout: 20000 });
    await sam.R('button', { name: 'Seen by: For you. Change who can see this' }).waitFor();
    const sealed = (await ctx.api(sam.token, 'GET', `/v1/boards/${lettersId}`)).view.letters[0];
    if (sealed.text !== null || !sealed.canOpen) throw new Error('the API hands a sealed letter to its reader before it is opened');
    await sam.shot('open-when-reader');
    await sam.R('button', { name: '…you are walked through. Sealed' }).click();
    await sam.T("It's sealed. Open it when the moment has come: it can only be opened once.").waitFor();
    if (await sam.page.getByText(secret).count()) throw new Error('the reader sees the words before opening the letter');
    await sam.R('button', { name: 'Open it', exact: true }).click();
    await sam.T('Open it now? It can only be opened once, and whoever wrote it is told that you did.').waitFor();
    await sam.R('button', { name: 'Yes, open it' }).click();
    await sam.T(secret).waitFor({ timeout: 20000 });
    await sam.shot('open-when-opened-reader');
    await closeSheet(sam);
    await sam.R('button', { name: /^…you are walked through\. You opened it on / }).waitFor();

    // ...and Nora, who wrote it, sees that it was opened.
    await page.goto(`${WEB_URL}/board/${lettersId}`);
    await R('button', { name: /^…you are walked through\. Sam opened it on \d+ \w+, at \d\d:\d\d$/ }).waitFor({ timeout: 20000 });
    await shot('open-when-opened-writer');
  });

  await step('birthday-interview', async () => {
    await openFromGallery(/^The birthday interview\. Does work/, /^Mia's birthday interview\./);
    await R('heading', { name: "Mia's birthday interview" }).waitFor({ timeout: 20000 });
    await T('Ten questions, every 4 December').waitFor();
    await R('button', { name: /^Seen by: Alex and you/ }).waitFor();
    // The answers line up by age, the newest round marked; a recording plays in her own voice.
    await T('A vet', { exact: true }).waitFor();
    await T('A vet with a horse').waitFor();
    await T('A marine biologist. With a horse.').waitFor();
    await R('button', { name: "Play Mia's answer at 8" }).waitFor();
    // The API's own line about the next birthday.
    await T(/^Mia's 10th is in \d+ days$/).waitFor();
    await T('The questions are ready').waitFor();
    await shot('birthday-interview');
    await R('button', { name: "Play Mia's answer at 8" }).click();
    await R('button', { name: "Stop. Play Mia's answer at 8" }).waitFor();
  });

  await step('birthday-interview-answer', async () => {
    // This year's answer to one of the ten.
    await R('button', { name: /^What makes you laugh the most\?/ }).click();
    await L('What Mia says').fill(`When Dad does the robot (${tag}).`);
    await shot('birthday-interview-answer');
    await R('button', { name: 'Keep the answer' }).click();
    await T(`When Dad does the robot (${tag}).`).waitFor({ timeout: 20000 });
    // "Get ready" lists the questions; another can be added there.
    await R('button', { name: 'Get ready' }).click();
    await R('heading', { name: 'The questions' }).waitFor();
    await R('button', { name: /^What do you want to be\?\. Answered/ }).waitFor();
    await L('Add a question').waitFor();
    await shot('birthday-interview-questions');
    await closeSheet(ctx);
    await R('heading', { name: 'The questions' }).waitFor({ state: 'detached' });
  });

  await step('said', async () => {
    // Quotes an earlier run wrote down are taken out first.
    const quotes = await sampleBoard('said');
    for (const found of (await asNora('GET', `/v1/boards/${quotes.id}/entries?kind=quote&q=walk-through&limit=50`)).items) await asNora('DELETE', `/v1/board-entries/${found.id}`);

    await openFromGallery(/^Things they said\. Does work/, /^Things they said\. \d+ quotes/);
    await R('heading', { name: 'Things they said' }).waitFor({ timeout: 20000 });
    await R('button', { name: /^Everyone, \d+$/ }).waitFor();
    await T("“I'm not tired. My eyes are just heavy.”").waitFor();
    await T(/^Leo, 6 years and \d+ months?/).first().waitFor();
    await R('button', { name: "Play Leo's voice" }).waitFor();
    await shot('said');
    // One person's, only those with a voice, and a search of the words: each is the API's own list.
    // (Two rows have her name: the chips that choose whose quotes to show, and the row that says who said a new one.)
    await page.getByRole('button', { name: 'Mia', exact: true }).first().click();
    await T('“Can we get a second dog so Biscuit has someone to talk to?”').waitFor();
    await T("“I'm not tired. My eyes are just heavy.”").waitFor({ state: 'detached' });
    await R('button', { name: 'With a voice' }).click();
    await T("“I'm not tired. My eyes are just heavy.”").waitFor();
    await T('“Can we get a second dog so Biscuit has someone to talk to?”').waitFor({ state: 'detached' });
    await R('button', { name: 'Search what they said' }).click();
    await L('Search what they said').fill('batteries');
    await T("“I can't tidy up. My legs are out of batteries.”").waitFor();
    await shot('said-search');
    await R('button', { name: 'Close search' }).click();
    await R('button', { name: /^Everyone, \d+$/ }).click();
  });

  await step('said-add', async () => {
    const total = async () => Number((await R('button', { name: /^Everyone, \d+$/ }).getAttribute('aria-label')).match(/\d+/)[0]);
    const before = await total();
    // Who said it, the words, and a clip of it: a picked sound file stands in for the microphone.
    await R('button', { name: 'Mia', exact: true }).click();
    const [sounds] = await Promise.all([page.waitForEvent('filechooser'), R('button', { name: 'Add a recording' }).click()]);
    await sounds.setFiles(soundFile(ctx.out, 'said-clip', 6));
    await T('Recording attached · 0:06').waitFor();
    await L('What did they just say?').fill('This walk-through is taking ages.');
    await shot('said-add');
    await R('button', { name: 'Add', exact: true }).click();
    await T('“This walk-through is taking ages.”').waitFor({ timeout: 20000 });
    // The age is worked out from her birthday, and the count went up by one.
    await T(/^Mia, 9 years and \d+ months? · today$/).waitFor();
    await R('button', { name: `Everyone, ${before + 1}` }).waitFor();
    await page.getByRole('button', { name: "Play Mia's voice" }).first().click();
    await R('button', { name: "Stop. Play Mia's voice" }).waitFor();
    await R('button', { name: "Stop. Play Mia's voice" }).click();
    await shot('said-added');
    // More holds who can see it, where the bar has no room for the chip.
    await more().click();
    await R('button', { name: /^Who can see this/ }).click();
    await T('Who can see this?').waitFor();
    await R('button', { name: 'Done' }).click();
  });

  await step('same-spot', async () => {
    // This year's photo from an earlier run is taken away, so the spot is still to be taken.
    const spot = await sampleBoard('same_spot');
    for (const year of spot.view.years) if (year.year === spot.view.thisYear) await asNora('DELETE', `/v1/board-entries/${year.id}`);

    await openFromGallery(/^Same spot, every year\. Does work/, /^First day of school\./);
    const year = spot.view.thisYear;
    await R('heading', { name: `First day of school · ${year}` }).waitFor({ timeout: 20000 });
    // Last year's photo lies faintly where the camera would be; the strip holds every year.
    await T('Last year, faintly. Line it up.').waitFor();
    for (const earlier of spot.view.years.filter((one) => one.year !== year)) await R('button', { name: `Show ${earlier.year}` }).waitFor();
    await R('button', { name: `${year}, this year` }).waitFor();
    await shot('same-spot');
    await R('button', { name: `Show ${year - 2}` }).click();
    await R('heading', { name: `First day of school · ${year - 2}` }).waitFor();
    await shot('same-spot-year');
    await R('button', { name: `${year}, this year` }).click();
    // A picked photo stands in for the camera: it lies under last year's, to line the two up, and is kept.
    const [photos] = await Promise.all([page.waitForEvent('filechooser'), R('button', { name: "Pick this year's photo" }).click()]);
    await photos.setFiles(path.join(IMG, 'mum-kid-street.jpg'));
    await R('button', { name: `Keep it as the photo for ${year}` }).waitFor();
    await T('Last year, faintly. Line it up.').waitFor();
    await shot('same-spot-lined-up');
    await R('button', { name: `Keep it as the photo for ${year}` }).click();
    await T(`${year} is taken. The button takes it again.`).waitFor({ timeout: 20000 });
    await shot('same-spot-taken');
    // The camera itself is the phone's: the button says so.
    await R('button', { name: 'Turn the camera round' }).click();
    await T(/^The camera arrives with the phone app\./).waitFor();
    await R('button', { name: 'OK' }).click();
  });

  await step('stories', async () => {
    await openFromGallery(/^Grandma's stories\. Does work/, /^Astrid's stories\./);
    await R('heading', { name: "Astrid's stories" }).waitFor({ timeout: 20000 });
    await T(/^One question a week · \d+ told so far$/).waitFor();
    await T("This week's question").waitFor();
    await T('Already told').waitFor();
    await R('button', { name: /^How did you meet Grandpa\?\. 4 min 40 s · with 3 photos/ }).waitFor();
    await R('button', { name: /^Were you ever in trouble at school\?\. Mia's question · goes out on / }).waitFor();
    await T('Make it a book').waitFor();
    await shot('stories');
    // A story that was told: her voice played back, its photos, and what is said about typing it out.
    await R('button', { name: /^How did you meet Grandpa\?/ }).click();
    await T("Typing out Astrid's words needs a speech service, which isn't connected yet. The recording is kept as it is.").waitFor();
    await R('button', { name: 'Play the answer to: How did you meet Grandpa?' }).click();
    await R('button', { name: 'Stop. Play the answer to: How did you meet Grandpa?' }).waitFor();
    await shot('stories-story');
    // (The sample recordings are a moment long: they are left to end by themselves.)
    await closeSheet(ctx);
    // The book and telling it elsewhere are still to come, and say so.
    await R('button', { name: 'Book', exact: true }).click();
    await T(/^Turning the stories into a book arrives with a later update/).waitFor();
    await R('button', { name: 'OK' }).click();
  });

  await step('stories-ask-and-answer', async () => {
    const question = `What was your first bicycle like? (${tag})`;
    await more().click();
    await R('button', { name: 'Ask a question' }).click();
    await L('The question').fill(question);
    await shot('stories-ask');
    await R('button', { name: 'Add it to the queue' }).click();
    // It waits its turn; "Send it now" makes it this week's question, with the link that is hers alone.
    await R('button', { name: new RegExp(`^What was your first bicycle like\\? \\(${tag}\\)\\. Nora's question · goes out on `) }).click();
    await R('button', { name: 'Send it now' }).click();
    await R('button', { name: 'Send it to Astrid' }).waitFor({ timeout: 20000 });
    await T(/\/s\//).waitFor();
    await shot('stories-waiting');
    // A browser has no share sheet: the link is there to copy.
    await R('button', { name: 'Send it to Astrid' }).click();
    await T('This browser has no share sheet. Copy the link and send it yourself.').waitFor();
    await R('button', { name: 'Copy the link' }).click();
    await R('button', { name: 'Copied' }).waitFor();

    // Her page, opened as someone with no account: the question, and one button to talk. A sound file answers.
    const stories = await sampleBoard('stories');
    const link = stories.view.thisWeek.link;
    if (stories.view.thisWeek.text !== question || !link) throw new Error('the question that was sent is not this week\'s, or has no link');
    await ctx.webPage(link, question, 'stories-her-page');
    await ctx.webPage(link, 'Thank you', 'stories-her-thanks', async (web) => {
      await web.getByText(question).first().waitFor();
      await web.locator('#file').setInputFiles(soundFile(ctx.out, 'astrid-answer', 8));
    });

    // Back in the app the answer is there, in her voice.
    await page.goto(`${WEB_URL}/board/${stories.id}`);
    await R('button', { name: `Play the answer to: ${question}` }).waitFor({ timeout: 20000 });
    await T(/^Astrid answered (just now|\d+ min ago), by talking\.$/).waitFor();
    await R('button', { name: `Play the answer to: ${question}` }).click();
    await R('button', { name: `Stop. Play the answer to: ${question}` }).waitFor();
    await shot('stories-answered');
    await R('button', { name: `Stop. Play the answer to: ${question}` }).click();
  });

  await step('good-jar', async () => {
    // What an earlier run dropped in is taken out first, so the sample slips are the newest again.
    const jar = await sampleBoard('good_jar');
    for (const slip of (await asNora('GET', `/v1/boards/${jar.id}/entries?kind=slip&filter=${jar.view.year}&limit=20`)).items) if (slip.mine && (slip.text || '').includes('walk-through')) await asNora('DELETE', `/v1/board-entries/${slip.id}`);

    await openFromGallery(/^The good things jar\. Does work/, /^The good things jar\. \d+ good things/);
    await R('heading', { name: /^\d+ good things$/ }).waitFor({ timeout: 20000 });
    await T("The jar opens on New Year's Eve. Until then nobody can read it, only add to it.").waitFor();
    // Someone else's slip is folded: who put it in and when, and nothing more.
    await R('button', { name: /^Alex added one from Reine\. .*\. Folded$/ }).waitFor();
    await shot('good-jar');
    await R('button', { name: /^Alex added one from Reine\./ }).click();
    await T(/^It stays folded until the jar opens on 31 December\./).waitFor();
    await R('button', { name: 'OK' }).click();
  });

  await step('good-jar-two-people', async () => {
    const count = async (phone) => Number((await phone.R('heading', { name: /^\d+ good things$/ }).innerText()).match(/\d+/)[0]);
    const before = await count(ctx);
    const secret = `The walk-through went well, ${tag}.`;
    // Nora drops a slip in: the count goes up, and she can read her own.
    await L('Something good from this week').fill(secret);
    await R('button', { name: 'Add', exact: true }).click();
    await R('heading', { name: `${before + 1} good things` }).waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: 'Nora put in a good thing. Today', exact: true }).first().click();
    await T(secret).waitFor();
    await shot('good-jar-own-slip');
    await closeSheet(ctx);

    // Sam sees the count go up, and that Nora put something in, and can't read it.
    const jarId = page.url().match(/\/board\/([0-9a-f-]{36})/)[1];
    await sam.page.goto(`${WEB_URL}/board/${jarId}`);
    await sam.R('heading', { name: `${before + 1} good things` }).waitFor({ timeout: 20000 });
    await sam.page.getByRole('button', { name: 'Nora put in a good thing. Today. Folded', exact: true }).first().click();
    await sam.T(/^It stays folded until the jar opens on 31 December\./).waitFor();
    if (await sam.page.getByText(secret).count()) throw new Error("Sam can read Nora's slip before the jar opens");
    const forSam = (await ctx.api(sam.token, 'GET', `/v1/boards/${jarId}`)).view.latest[0];
    if (forSam.text !== null || !forSam.sealed) throw new Error("the API hands Nora's slip to Sam before the jar opens");
    await sam.shot('good-jar-other');
    // Sam drops one in too, with a picture.
    await sam.R('button', { name: 'OK' }).click();
    const [photos] = await Promise.all([sam.page.waitForEvent('filechooser'), sam.R('button', { name: 'Add a photo or a drawing' }).click()]);
    await photos.setFiles(path.join(IMG, 'canoe.jpg'));
    await sam.R('button', { name: 'Choose another picture' }).waitFor();
    await sam.L('Something good from this week').fill('A canoe, a lake, nobody fell in.');
    await sam.R('button', { name: 'Add', exact: true }).click();
    await sam.R('heading', { name: `${before + 2} good things` }).waitFor({ timeout: 20000 });
    await sam.R('button', { name: 'Sam put in a photo. Today', exact: true }).waitFor();
    await sam.shot('good-jar-second-person');
    // (Sam's slip goes with this run.)
    const mine = (await ctx.api(sam.token, 'GET', `/v1/boards/${jarId}`)).view.latest.find((slip) => slip.mine);
    if (mine) await ctx.api(sam.token, 'DELETE', `/v1/board-entries/${mine.id}`).catch(() => undefined);
  });

  await step('doorframe', async () => {
    // A mark an earlier run made is rubbed out first.
    const door = await sampleBoard('doorframe');
    for (const mark of door.view.marks) if (mark.heightMm === 1201) await asNora('DELETE', `/v1/board-entries/${mark.id}`);

    await openFromGallery(/^The doorframe\. Does work/, /^The doorframe\. Mia \d+/);
    await R('heading', { name: 'The doorframe' }).waitFor({ timeout: 20000 });
    // The ruler with every mark, a card for each child, and the lines the API words.
    await T(/^138 Mia · \w+ \d\d$/).waitFor();
    await T(/^105 Leo · \w+ \d\d$/).waitFor();
    await T('138 cm').waitFor();
    await T('119 cm').waitFor();
    await T("Up to Grandma Astrid's shoulder").waitFor();
    await T('Tall enough for the big slide').waitFor();
    await T(/^Mia was Leo's height in /).waitFor();
    await shot('doorframe');
    await R('button', { name: 'Add a mark' }).click();
    await R('button', { name: 'Leo', exact: true }).click();
    await L('Height in cm').fill('120.1');
    await shot('doorframe-add');
    await R('button', { name: 'Mark it' }).click();
    await T('120.1 cm').waitFor({ timeout: 20000 });
    await T(/^120\.1 Leo · \w+ \d\d$/).waitFor();
    await shot('doorframe-added');
  });

  await step('keepsakes-end', async () => {
    // The letters started for Sam go with this run; Sam's phone is put away and the account deleted.
    if (lettersId) await asNora('DELETE', `/v1/things/${lettersId}`);
    await sam.close();
    await page.goto(WEB_URL + '/');
    await R('tab', { name: 'Home' }).waitFor({ timeout: 20000 });
    await ctx.signOut();
  });
};
