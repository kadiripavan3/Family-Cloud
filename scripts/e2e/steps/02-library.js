// Milestone 2, the Library, as two people where sharing matters. Nora, with the sample library: the wall
// (loading more as it scrolls, the strip of years, the months), a year, the people in photos, the lake
// moment, a photo (a heart, who is in it, a comment, where and when, who sees it, a copy, its neighbours),
// a video, an album made from the moment and albums made by hand, places, adding photos from files (and the
// same file again), selecting many, files, a scan with its words typed in, the passport's page with a
// reminder made in Plan, and what is kept. Sam, a second new person who joins her circle by its link, must not find a
// photo she keeps to herself: not on the wall, not in search, not by its address; and finds it once it is
// shared. Everything the walk makes it takes away again, so the sample circle is left as it was found.
const fs = require('fs');
const os = require('os');
const path = require('path');

/** The id of a thing from the address of its screen: "/photo/<id>?…". */
const idIn = (url) => url.split('?')[0].split('/').pop();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A sheet is closed by pressing the dimmed page above it. */
const ABOVE_THE_SHEET = { position: { x: 195, y: 60 } };

exports.run = async function run(ctx) {
  const { page, T, R, L, shot, step, tag, WEB_URL, IMG, CODE } = ctx;
  const now = new Date();
  /** Today as the wall writes it: "12 Nov". */
  const today = `${now.getDate()} ${MONTHS[now.getMonth()]}`;
  const isoToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Files to pick, as a person's own photos would be: pictures of the hub with a few bytes after their end,
  // so each run brings files the Library has never seen. (A JPEG ends where it says; what follows is ignored.)
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'homeport-library-'));
  const fresh = (from, name) => {
    const file = path.join(folder, name);
    fs.writeFileSync(file, Buffer.concat([fs.readFileSync(path.join(IMG, from)), Buffer.from(`homeport walk-through ${tag} ${name}`)]));
    return file;
  };
  const harbour = fresh('fog.jpg', `harbour-${tag}.jpg`);
  const hill = fresh('lake.jpg', `hill-${tag}.jpg`);
  const card = fresh('desk.jpg', `library-card-${tag}.jpg`);

  // Nora's token for the API: to look things up the screens don't show (a join code), to stand in for
  // screens of other places (linking a trip to a passport), and to tidy up after the walk.
  const nora = (await ctx.api(null, 'POST', '/local-auth/token', { email: 'nora@example.com', code: CODE })).accessToken;
  const linds = (await ctx.api(nora, 'GET', '/v1/circles')).find((circle) => circle.name === 'The Linds');
  const lib = (query) => ctx.api(nora, 'GET', `/v1/circles/${linds.id}/library?${query}`);
  const gone = (id) => ctx.api(nora, 'DELETE', `/v1/things/${id}`).catch(() => undefined);

  /** The sample's own reminder for the passport, while it is off it. */
  let sampleReminder = null;
  /** Takes away what a walk made: today's photos of Nora's, albums and documents named with a run's tag, what was linked to the passport. */
  const tidy = async () => {
    const mine = (await lib(`by=${linds.myMemberId}&limit=100`)).items.filter((item) => item.takenLocal.startsWith(isoToday));
    for (const item of mine) await gone(item.id);
    const albums = (await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/albums?limit=100`)).items.filter((album) => /^(Lake day|Garden|Walk) [a-z0-9]{5}$/.test(album.title) || (album.title === 'Leo' && album.origin === 'person') || album.title === 'Saturday at Lake Bled');
    for (const album of albums) await gone(album.id);
    const files = (await ctx.api(nora, 'GET', `/v1/circles/${linds.id}/files?limit=100`)).items;
    for (const file of files.filter((one) => /^Library card [a-z0-9]{5}$/.test(one.title))) await gone(file.id);
    const passport = files.find((one) => one.title === "Mia's passport");
    if (passport) {
      for (const linked of await ctx.api(nora, 'GET', `/v1/things/${passport.id}/links`)) {
        // A reminder an earlier walk made goes. The sample's own reminder ("Renew Mia's passport") is only
        // taken off the passport, so that "Remind me" can be pressed in this walk; it stays in Plan, and
        // `putBack` links it again at the end. The trip the passport is needed for is the sample's own.
        if (linked.kind === 'reminder' && linked.title.startsWith("Mia's passport:")) await gone(linked.id);
        else if (linked.kind === 'reminder') {
          sampleReminder = linked.id;
          await ctx.api(nora, 'DELETE', `/v1/things/${passport.id}/links/${linked.id}`);
        }
      }
    }
    // The lake's first two photos are as the sample has them: Nora's heart on the canoe, nobody tagged and nothing said on the next.
    const [first, second] = (await lib('limit=2')).items;
    await ctx.api(nora, 'PUT', `/v1/library/${first.id}/love`);
    await ctx.api(nora, 'PUT', `/v1/things/${second.id}/about`, { memberIds: [] });
    for (const comment of (await ctx.api(nora, 'GET', `/v1/library/${second.id}/comments`)).items) if (comment.body.startsWith('What a morning ')) await ctx.api(nora, 'DELETE', `/v1/library/comments/${comment.id}`);
    return passport;
  };
  // A walk that stopped half-way last time may have left things behind.
  const passport = await tidy();
  const lake = (await lib('limit=3')).items;
  const canoe = lake[0];

  let sam;
  let secret;
  /** A step on the second phone: when it fails, a picture of that phone is kept too (the walk's own picture is of Nora's). */
  const onSams = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      await sam.page.screenshot({ path: `${ctx.out}/${ctx.scheme}-FAILED-${name}-second-phone.png` }).catch(() => undefined);
      console.log(`ON THE SECOND PHONE (${sam.page.url()}): ${await sam.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(-500)).catch(() => '(could not be read)')}`);
      throw error;
    }
  };
  try {
    await step('library', async () => {
      await ctx.signIn('nora@example.com');
      await R('tab', { name: 'Library' }).click();
      // The lenses, and the newest day: a moment three people photographed, named by its place.
      for (const lens of ['Wall', 'Albums', 'People', 'Places', 'Files']) await R('button', { name: lens, exact: true }).waitFor();
      await T('Saturday at Lake Bled').waitFor({ timeout: 20000 });
      await T('7 Nov · Lake Bled · 51 from 3 people').waitFor();
      await R('button', { name: "Mia's first time steering. Photo added by Alex" }).waitFor();
      await R('button', { name: 'Video, 0:42, added by Alex' }).waitFor();
      await R('button', { name: 'November 2026. Jump to a month' }).waitFor();
      await shot('library');
    });

    await step('library-scrolls', async () => {
      // Scrolling brings the next page, and the bubble beside the strip follows the wall.
      const more = page.waitForResponse((answer) => /\/library\?/.test(answer.url()) && answer.url().includes('cursor=') && answer.ok(), { timeout: 30000 });
      await page.mouse.move(180, 560);
      for (let turn = 0; turn < 16; turn += 1) {
        await page.mouse.wheel(0, 2400);
        await page.waitForTimeout(200);
      }
      await more;
      await R('button', { name: /^(?!November 2026)[A-Z][a-z]+ \d{4}\. Jump to a month$/ }).waitFor();
      await shot('library-further-down');
      await page.mouse.wheel(0, -200000);
      await R('button', { name: 'November 2026. Jump to a month' }).waitFor();
    });

    await step('library-jump', async () => {
      // The strip jumps to a year: the wall starts there and goes back from there.
      await R('button', { name: 'Jump to 2025' }).click();
      await page.waitForURL(/[?&]until=2025-12-31/);
      await R('button', { name: /^[A-Z][a-z]+ 2025\. Jump to a month$/ }).waitFor();
      await shot('library-2025');
      await R('button', { name: 'Jump to 2026' }).click();
      await page.waitForURL((url) => !url.search.includes('until='));
      await T('Saturday at Lake Bled').waitFor();
      // The bubble opens the months of the year, each with what it holds.
      await R('button', { name: 'November 2026. Jump to a month' }).click();
      await T('Jump to a month of 2026').waitFor();
      await R('button', { name: /^November\. \d+ photos and \d+ videos?$/ }).waitFor();
      await shot('library-months');
      await R('button', { name: /^October\. \d+ photos?$/ }).click();
      await page.waitForURL(/[?&]until=2026-10-31/);
      await R('button', { name: 'October 2026. Jump to a month' }).waitFor();
    });

    await step('wall-years', async () => {
      await R('button', { name: 'October 2026. Jump to a month' }).click();
      await R('button', { name: 'See all of 2026' }).click();
      await R('heading', { name: '2026' }).waitFor();
      await T(/^\d+ photos · \d+ videos$/).waitFor();
      await T('Pinch: days, months, years').waitFor();
      for (const month of ['November', 'October', 'September', 'August']) await T(month, { exact: true }).waitFor();
      await shot('wall-years');
      // The chips narrow the year: to videos, to what one person added.
      await R('button', { name: 'Videos', exact: true }).click();
      await R('button', { name: /^November, 3\. Show it on the wall$/ }).waitFor();
      await T('October', { exact: true }).waitFor({ state: 'detached' });
      await R('button', { name: 'By Alex', exact: true }).click();
      await R('button', { name: /^November, \d+\. Show it on the wall$/ }).waitFor();
      await shot('wall-years-by-alex');
      await R('button', { name: 'Everyone', exact: true }).click();
      await T('October', { exact: true }).waitFor();
      // The year at the top offers the others.
      await R('button', { name: '2026. Choose another year' }).click();
      await T('Years', { exact: true }).waitFor();
      await R('button', { name: /^2019\. 1 photo$/ }).click();
      await R('heading', { name: '2019' }).waitFor();
      await T('September', { exact: true }).waitFor();
      await R('button', { name: '2019. Choose another year' }).click();
      await R('button', { name: /^2026\. / }).click();
      await R('heading', { name: '2026' }).waitFor();
      // A month's line shows that month on the wall.
      await R('button', { name: /^September, \d+\. Show it on the wall$/ }).click();
      await page.waitForURL(/[?&]until=2026-09-30/);
      await R('button', { name: 'September 2026. Jump to a month' }).waitFor();
      await R('button', { name: 'Jump to 2026' }).click();
      await T('Saturday at Lake Bled').waitFor();
    });

    await step('people-in-photos', async () => {
      // The people in photos, from who was tagged by hand. Choosing one narrows the wall to them.
      await R('button', { name: 'People', exact: true }).click();
      await T('People in your photos').waitFor();
      await shot('library-people');
      const narrowed = page.waitForResponse((answer) => /\/library\?/.test(answer.url()) && answer.url().includes('about=') && answer.ok());
      await R('button', { name: /^Mia\. \d+ photos$/ }).click();
      const answer = await (await narrowed).json();
      if (answer.items.length === 0) throw new Error('the wall narrowed to Mia is empty');
      await R('button', { name: 'Mia', exact: true }).waitFor();
      await shot('library-of-mia');
      await R('button', { name: 'Wall', exact: true }).click();
      await R('button', { name: 'People', exact: true }).waitFor();
    });

    await step('moment', async () => {
      await R('button', { name: /^Saturday at Lake Bled\./ }).click();
      await R('heading', { name: 'Saturday at Lake Bled' }).waitFor();
      await T('Sat 7 Nov · Lake Bled').waitFor();
      await T('Three of you were here').waitFor();
      await T('48 photos and 3 videos from Nora, Alex and Mia, put together by time and place.').waitFor();
      for (const chip of ['All 51', 'You, 21', 'Alex, 19', 'Mia, 11']) await R('button', { name: chip, exact: true }).waitFor();
      await shot('moment');
      // One person's photos: the wall is asked for what they added, and only that comes back.
      const byMia = page.waitForResponse((answer) => /\/library\?/.test(answer.url()) && answer.url().includes('by=') && answer.ok());
      await R('button', { name: 'Mia, 11', exact: true }).click();
      const hers = await (await byMia).json();
      if (hers.items.length !== 11 || hers.items.some((item) => item.addedBy.name !== 'Mia')) throw new Error(`Mia's photos of the moment came back as ${hers.items.length}, not all hers`);
      await shot('moment-by-mia');
      await R('button', { name: /^All \d+$/ }).click();
      // Its other button drafts a journey from it: that is walked in 10-journey.
      await R('button', { name: 'Journey', exact: true }).waitFor();
    });

    await step('viewer', async () => {
      await R('button', { name: "Mia's first time steering. Photo added by Alex" }).click();
      await page.waitForURL(new RegExp(`/photo/${canoe.id}`));
      await T('1 of 51').waitFor();
      await T('Sat 7 Nov · 11:42 · Lake Bled').waitFor();
      await R('heading', { name: "Mia's first time steering" }).waitFor();
      await T('Added by Alex · everyone in The Linds can see it').waitFor();
      await T('2 loves · 3 comments').waitFor();
      await shot('viewer');
      // Her heart is on it already: taking it back and giving it again shows at once.
      await R('button', { name: 'Remove your heart', exact: true }).click();
      await T('1 love · 3 comments').waitFor();
      await R('button', { name: 'Give it a heart', exact: true }).click();
      await T('2 loves · 3 comments').waitFor();
      await R('button', { name: 'Remove your heart', exact: true }).waitFor();
    });

    await step('viewer-neighbours', async () => {
      // Stepping from the strip, and by swiping along the photo.
      await R('button', { name: 'The one before it', exact: true }).click();
      await T('2 of 51').waitFor();
      await page.waitForURL(new RegExp(`/photo/${lake[1].id}`));
      await R('button', { name: 'The one after it', exact: true }).click();
      await T('1 of 51').waitFor();
      await page.mouse.move(300, 320);
      await page.mouse.down();
      await page.mouse.move(90, 326, { steps: 8 });
      await page.mouse.up();
      await T('2 of 51').waitFor();
    });

    await step('viewer-who-is-in-it', async () => {
      // Tagging by hand: nobody is tagged on this one yet; Mia is in it.
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Who is in it. Nobody tagged yet' }).click();
      await T('Who is in it?').waitFor();
      await R('checkbox', { name: 'Mia', checked: false }).click();
      await R('checkbox', { name: 'Mia', checked: true }).waitFor();
      await shot('viewer-who-is-in-it');
      await R('button', { name: 'Save', exact: true }).click();
      await T('Who is in it?').waitFor({ state: 'detached' });
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Who is in it. Mia' }).waitFor();
      await shot('viewer-menu');
      // Where and when, in full.
      await R('button', { name: 'Where and when', exact: true }).click();
      await T('Lake Bled, Slovenia').waitFor();
      await T(/^Sat 7 Nov, 11:\d\d$/).waitFor();
      await shot('viewer-where-and-when');
      await R('button', { name: 'Close' }).click(ABOVE_THE_SHEET);
      await T('Lake Bled, Slovenia').waitFor({ state: 'detached' });
    });

    await step('viewer-comments', async () => {
      await R('button', { name: /Open the comments$/ }).click();
      await T('No comments yet. Say something nice.').waitFor();
      await L('Add a comment').fill(`What a morning ${tag}`);
      await R('button', { name: 'Send', exact: true }).click();
      await T(`What a morning ${tag}`).waitFor();
      await R('heading', { name: '1 comment' }).waitFor();
      await shot('viewer-comments');
      // Her own comment can be taken away again.
      await R('button', { name: 'Remove the comment by Nora' }).click();
      await R('button', { name: 'Remove comment', exact: true }).click();
      await T(`What a morning ${tag}`).waitFor({ state: 'detached' });
      await R('button', { name: 'Close the comments' }).click();
      await R('button', { name: '0 comments. Open the comments' }).waitFor();
    });

    await step('viewer-audience-and-copy', async () => {
      // Who can see it: the same sheet as everywhere.
      await R('button', { name: /Who can see this$/ }).click();
      await T('Who can see this?').waitFor();
      await R('radio', { name: /^Everyone in The Linds/, checked: true }).waitFor();
      await shot('viewer-audience');
      await R('button', { name: 'Done' }).click();
      await T('Who can see this?').waitFor({ state: 'detached' });
      // A copy of the file as it was sent.
      const [download] = await Promise.all([page.waitForEvent('download'), R('button', { name: 'Download', exact: true }).click()]);
      await T('Saved to your downloads.').waitFor();
      await download.cancel().catch(() => undefined);
      await R('button', { name: 'Back', exact: true }).click();
      await R('heading', { name: 'Saturday at Lake Bled' }).waitFor();
    });

    await step('video', async () => {
      // A video opens in the same viewer, with a button that plays it.
      await R('button', { name: 'Video, 0:42, added by Alex' }).click();
      await page.waitForURL(/\/video\//);
      await R('button', { name: 'Play the video' }).waitFor();
      await T(/^\d+ of 51$/).waitFor();
      await shot('video');
      await R('button', { name: 'Back', exact: true }).click();
      await R('heading', { name: 'Saturday at Lake Bled' }).waitFor();
    });

    await step('album-from-a-moment', async () => {
      // The moment becomes an album: everything in it that she may see.
      await R('button', { name: 'Album', exact: true }).click();
      await page.waitForURL(/\/album\//);
      await T('51 photos and videos').waitFor();
      await R('button', { name: 'Seen by: Only you. Change who can see this' }).waitFor();
      await shot('album');
      // Another name for it.
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Rename', exact: true }).click();
      await L('Name', { exact: true }).fill(`Lake day ${tag}`);
      await R('button', { name: 'Save', exact: true }).click();
      await R('heading', { name: `Lake day ${tag}` }).waitFor();
      // A photo opened from the album steps along the album, and can be taken out of it.
      await R('button', { name: "Mia's first time steering. Photo added by Alex" }).click();
      await T('1 of 51').waitFor();
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: `Take it out of this album. Lake day ${tag}` }).click();
      await T('1 of 50').waitFor();
      await R('button', { name: 'Back', exact: true }).click();
      await T('50 photos and videos').waitFor();
      // And put back, from the whole wall.
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Add photos', exact: true }).click();
      await R('heading', { name: `Add to Lake day ${tag}` }).waitFor();
      await R('button', { name: "Mia's first time steering. Photo added by Alex. Not selected" }).click();
      await shot('album-add');
      await R('button', { name: 'Add 1', exact: true }).click();
      await T('51 photos and videos').waitFor();
      // The album goes; what was in it stays.
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Delete album', exact: true }).click();
      await T('What is in it stays in the Library.').waitFor();
      await R('button', { name: 'Delete album', exact: true }).click();
      await R('heading', { name: 'Saturday at Lake Bled' }).waitFor();
      await R('button', { name: 'Back', exact: true }).click();
      await R('button', { name: 'Albums', exact: true }).waitFor();
    });

    await step('albums', async () => {
      await R('button', { name: 'Albums', exact: true }).click();
      await R('tab', { name: 'Shared, 3' }).waitFor();
      await R('button', { name: 'Summer 2026. 8 · everyone adds to it' }).waitFor();
      await R('button', { name: 'Biscuit. 9 · mostly asleep' }).waitFor();
      await R('button', { name: /^Mia\. \d+ · every photo Mia is in$/ }).waitFor();
      await shot('albums');
      await R('tab', { name: 'Only you, 1' }).click();
      await R('button', { name: /^For the photo book\. 4$/ }).waitFor();
      // What was kept from Journey lands here as an album of its originals (the Journey link's own steps keep one).
      await R('tab', { name: /^From Journey, \d+$/ }).click();
      await R('button', { name: /^Iceland ring road\./ }).waitFor();
      await shot('albums-from-journey');
      // An album made by hand: empty until photos are put in.
      await R('button', { name: 'New album', exact: true }).click();
      await L('Name', { exact: true }).fill(`Garden ${tag}`);
      await shot('albums-new');
      await R('button', { name: 'Create album', exact: true }).click();
      await R('heading', { name: `Garden ${tag}` }).waitFor();
      await T('Nothing in it yet').waitFor();
      await shot('album-empty');
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Delete album', exact: true }).click();
      await R('button', { name: 'Delete album', exact: true }).click();
      await R('heading', { name: 'Albums' }).waitFor();
      // One that fills itself: every photo Leo is in, from who is tagged.
      await R('button', { name: 'New album', exact: true }).click();
      await R('radio', { name: 'Fills itself' }).click();
      await R('radio', { name: 'Leo', exact: true }).click();
      await R('button', { name: 'Create album', exact: true }).click();
      await R('heading', { name: 'Leo', exact: true }).waitFor();
      await T('It fills itself with every photo and video Leo is in. Say who is in a photo, and it shows up here.').waitFor();
      await T(/^2 photos and videos · every photo Leo is in$/).waitFor();
      await shot('album-fills-itself');
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Delete album', exact: true }).click();
      await R('button', { name: 'Delete album', exact: true }).click();
      await R('heading', { name: 'Albums' }).waitFor();
      await R('button', { name: 'Back', exact: true }).click();
    });

    await step('places', async () => {
      // On a phone this is a map; here the places are a list, each with its cover and its count.
      await R('button', { name: 'Places', exact: true }).click();
      // (How many places and countries is the sample data's business: a kept journey brings its own.)
      await T(/^\d+ places · \d+ countries$/).waitFor();
      await R('button', { name: /^Lake Bled, \d+\. Show its photos$/ }).waitFor();
      await T('3 visits · last on 7 Nov').waitFor();
      await T(/^\d+ photos and 3 videos, from Alex, Mia and you$/).waitFor();
      await shot('places');
      // The photos of one open underneath it.
      await R('button', { name: /^Lake Bled, \d+\. Show its photos$/ }).click();
      await R('button', { name: /^Lake Bled, \d+\. Its photos are showing$/ }).waitFor();
      await R('button', { name: "Mia's first time steering. Photo added by Alex" }).waitFor();
      await shot('places-open');
      await R('button', { name: 'Map layers' }).click();
      await T("The map isn't built yet. For now your places are a list.").waitFor();
      await R('button', { name: 'Back to the wall', exact: true }).click();
      await R('button', { name: 'Albums', exact: true }).waitFor();
    });

    await step('new-photos', async () => {
      // Two photos from files: in a browser the file chooser stands in for the camera roll.
      await R('button', { name: 'Add something' }).click();
      await R('button', { name: 'Photos', exact: true }).click();
      await R('heading', { name: 'Add photos' }).waitFor();
      await T('Choose photos or a video from this device. They go into The Linds, at full size.').waitFor();
      await R('button', { name: 'Seen by Only you. Change' }).waitFor();
      await shot('new-photos');
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), R('button', { name: 'Choose photos or a video' }).click()]);
      await chooser.setFiles([harbour, hill]);
      await T('2 added.').waitFor({ timeout: 30000 });
      await shot('new-photos-added');
      // The same file again is recognised by its fingerprint, and is not sent a second time.
      const [again] = await Promise.all([page.waitForEvent('filechooser'), R('button', { name: 'Choose more' }).click()]);
      await again.setFiles([harbour]);
      await T('2 added. 1 was already in your Library.').waitFor({ timeout: 30000 });
      await T('Already in your Library').waitFor();
      await shot('new-photos-already-there');
    });

    await step('a-photo-only-she-sees', async () => {
      // One of the two, opened from where it was added: hers alone, with a caption to find it by.
      await R('button', { name: `Open harbour-${tag}.jpg` }).click();
      await page.waitForURL(/\/photo\//);
      secret = idIn(page.url());
      await T('Added by you · only you can see it').waitFor();
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Add a caption', exact: true }).click();
      await L('Caption', { exact: true }).fill(`Secret harbour ${tag}`);
      await R('button', { name: 'Save', exact: true }).click();
      await R('heading', { name: `Secret harbour ${tag}` }).waitFor();
      await shot('viewer-only-you');
      await R('button', { name: 'Back', exact: true }).click();
      await R('button', { name: 'See them on the wall' }).click();
      // Both are on the wall, as today's own day.
      await T(new RegExp(`^${today} · 2 photos$`)).waitFor({ timeout: 20000 });
      await R('button', { name: `Secret harbour ${tag}. Photo added by Nora` }).waitFor();
      await shot('library-with-new-photos');
    });

    await step('only-you-is-only-you', async () => {
      // A second new person on a second phone joins the family by the link Nora sent.
      sam = await ctx.second('Sam Wall');
      await onSams('only-you-is-only-you', async () => {
        await sam.page.goto(`${WEB_URL}/join/${linds.joinUrl.split('/').pop()}`);
        await sam.R('heading', { name: 'Join The Linds?' }).waitFor({ timeout: 20000 });
        await sam.R('button', { name: 'Join', exact: true }).click();
        await sam.R('button', { name: 'The Linds. Change circle' }).waitFor({ timeout: 20000 });
        await sam.R('tab', { name: 'Library' }).click();
        await sam.T('Saturday at Lake Bled').waitFor({ timeout: 20000 });
        // What Nora keeps to herself is not on Sam's wall...
        if ((await sam.page.getByText(`Secret harbour ${tag}`).count()) || (await sam.page.getByText(new RegExp(`^${today} · `)).count())) throw new Error("Sam's wall shows a photo only Nora may see");
        await sam.shot('library-as-sam');
        // ...not in search...
        await sam.R('button', { name: 'Search the library' }).click();
        await sam.L('Search The Linds').fill(`harbour ${tag}`);
        await sam.T(`Nothing found for “harbour ${tag}”`).waitFor();
        const found = await ctx.api(sam.token, 'GET', `/v1/circles/${linds.id}/search?q=${encodeURIComponent(`harbour ${tag}`)}`);
        if (found.hits.length) throw new Error('the search found a photo only Nora may see');
        await sam.shot('search-as-sam');
        // ...and not at its address.
        ctx.expectNotFound = true;
        await sam.page.goto(`${WEB_URL}/photo/${secret}`);
        await sam.R('heading', { name: "This isn't available" }).waitFor({ timeout: 20000 });
        await sam.shot('photo-not-shared');
        ctx.expectNotFound = false;
      });
    });

    await step('shared-and-found', async () => {
      // Nora shares it with everyone in the family...
      await R('button', { name: `Secret harbour ${tag}. Photo added by Nora` }).click();
      await R('button', { name: 'Added by you · only you can see it. Who can see this' }).click();
      await T('Who can see this?').waitFor();
      await R('radio', { name: /^Everyone in The Linds/ }).click();
      await R('button', { name: 'Done' }).click();
      await T('Added by you · everyone in The Linds can see it').waitFor();
      await R('button', { name: 'Back', exact: true }).click();
      // ...and Sam finds it on the wall, as a day of its own, and can open it.
      await onSams('shared-and-found', async () => {
        await sam.page.goto(`${WEB_URL}/?place=library`);
        await sam.T(new RegExp(`^${today} · 1 photo$`)).waitFor({ timeout: 20000 });
        await sam.R('button', { name: `Secret harbour ${tag}. Photo added by Nora` }).click();
        await sam.T('Added by Nora · everyone in The Linds can see it').waitFor();
        await sam.shot('viewer-as-sam');
        // Sam may look and love, not delete: it isn't Sam's.
        await sam.R('button', { name: 'More', exact: true }).click();
        await sam.R('button', { name: 'Where and when', exact: true }).waitFor();
        if (await sam.page.getByRole('button', { name: 'Delete', exact: true }).count()) throw new Error("Sam was offered Delete on Nora's photo");
      });
      await sam.close();
      sam = null;
    });

    await step('select', async () => {
      // Pressing and holding a photo starts selecting, with that photo picked.
      await R('button', { name: `Secret harbour ${tag}. Photo added by Nora` }).click({ delay: 700 });
      await R('heading', { name: '1 selected' }).waitFor();
      // The other of today's two is the first tile that isn't picked, as the grid is read: top row first, from the left.
      const others = page.getByRole('button', { name: /^Photo added by Nora\. Not selected$/ });
      const where = await others.evaluateAll((tiles) => tiles.map((tile, index) => ({ index, top: tile.getBoundingClientRect().top, left: tile.getBoundingClientRect().left })));
      where.sort((a, b) => a.top - b.top || a.left - b.left);
      await others.nth(where[0].index).click();
      await R('heading', { name: '2 selected' }).waitFor();
      for (const action of ['Share', 'Album', 'Journey', 'Hide', 'Save', 'Delete']) await R('button', { name: action, exact: true }).waitFor();
      await shot('select');
      // Share: with everyone. It says how many it was done to.
      await R('button', { name: 'Share', exact: true }).click();
      await T('Who can see these 2?').waitFor();
      await shot('select-share');
      await R('button', { name: 'Everyone in The Linds', exact: true }).click();
      await T('2 now seen by everyone in The Linds.').waitFor();
      // Hide from one person.
      await R('button', { name: 'Hide', exact: true }).click();
      await T('Hide these 2 from…').waitFor();
      await shot('select-hide');
      await R('button', { name: 'Mia', exact: true }).click();
      await T('Hidden 2 from Mia.').waitFor();
      // Into a new album.
      await R('button', { name: 'Album', exact: true }).click();
      await T('Add to an album').waitFor();
      await R('button', { name: 'New album', exact: true }).click();
      await L('Name', { exact: true }).fill(`Walk ${tag}`);
      await shot('select-album');
      await R('button', { name: 'Create and add', exact: true }).click();
      await T(`Added 2 to Walk ${tag}.`).waitFor();
      // (The bar's Journey drafts a journey from what is picked: walked in 10-journey.)
      // Copies of both.
      const saved = [];
      const keep = (download) => saved.push(download);
      page.on('download', keep);
      await R('button', { name: 'Save', exact: true }).click();
      await T('Saved 2 to your downloads.').waitFor();
      page.off('download', keep);
      if (saved.length !== 2) throw new Error(`saving two photos gave ${saved.length} files`);
      // Delete, after asking.
      await R('button', { name: 'Delete', exact: true }).click();
      await T('Delete these 2 for good?').waitFor();
      await shot('select-delete');
      await R('button', { name: 'Delete 2', exact: true }).click();
      await T('Deleted 2.').waitFor();
      await R('heading', { name: 'Select', exact: true }).waitFor();
      await R('button', { name: 'Cancel', exact: true }).click();
      await T(new RegExp(`^${today} · `)).waitFor({ state: 'detached' });
      await T('Saturday at Lake Bled').waitFor();
    });

    await step('files', async () => {
      await R('button', { name: 'Files', exact: true }).click();
      await R('heading', { name: 'Files' }).waitFor();
      // (How many there are is the sample data's business: other places' samples add a scan or two.)
      await R('button', { name: /^All \d+$/ }).waitFor();
      for (const kind of ['IDs', 'Insurance', 'School']) await R('button', { name: kind, exact: true }).waitFor();
      // Each row says what matters about its document.
      await R('button', { name: /^Mia's passport\. ID\. Expires \d+ [A-Z][a-z]{2} \d{4}$/ }).waitFor();
      await R('button', { name: /^Car registration\. PDF\. Runs out in \d+ days$/ }).waitFor();
      await R('button', { name: /^Receipt · wardrobe\. JPG\. €349 · warranty to [A-Z][a-z]{2} \d{4}$/ }).waitFor();
      await R('button', { name: /^Home insurance\. PDF\. Renews / }).waitFor();
      await R('button', { name: "Mia's school report. PDF. 4 pages · on Mia's page" }).waitFor();
      await R('button', { name: /^Boiler manual\. PDF\. Linked from / }).waitFor();
      await R('button', { name: 'Tax 2025. Folder. 3 files' }).waitFor();
      await shot('files');
      // One kind.
      await R('button', { name: 'IDs', exact: true }).click();
      await R('button', { name: /^Home insurance\./ }).waitFor({ state: 'detached' });
      await R('button', { name: /^Passport scan, Alex\./ }).waitFor();
      await R('button', { name: /^All \d+$/ }).click();
      // A folder of files.
      await R('button', { name: 'Tax 2025. Folder. 3 files' }).click();
      await R('heading', { name: 'Tax 2025' }).waitFor();
      await T('3 files', { exact: true }).waitFor();
      await shot('files-folder');
      await R('button', { name: 'Back', exact: true }).click();
    });

    await step('new-scan', async () => {
      // A scan: a picked picture, with the words typed where a phone would read them.
      await R('button', { name: 'Scan a document' }).click();
      await R('heading', { name: 'Scan a document' }).waitFor();
      await shot('new-scan');
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), R('button', { name: 'Choose a picture or a PDF' }).click()]);
      await chooser.setFiles(card);
      await L('Name', { exact: true }).fill(`Library card ${tag}`);
      await L('The words inside it').fill(`City library, reader's card. Bookworm ${tag}. Valid until 31.12.2027`);
      await L('Pages', { exact: true }).fill('1');
      await shot('new-scan-filled');
      await R('button', { name: 'Add document', exact: true }).click();
      // It opens as a document that knows its day.
      await page.waitForURL(/\/document\//, { timeout: 30000 });
      await R('heading', { name: `Library card ${tag}` }).waitFor();
      await T('Valid until 31 Dec 2027').first().waitFor();
      await shot('document-scanned');
      await R('button', { name: 'Back', exact: true }).click();
    });

    await step('files-search', async () => {
      // A word that is only inside the scan finds it.
      await R('button', { name: /^All \d+$/ }).waitFor();
      await L('Search inside scans and PDFs').fill(`bookworm ${tag}`);
      await R('button', { name: new RegExp(`^Library card ${tag}\\.`) }).waitFor();
      await R('button', { name: /^Home insurance\./ }).waitFor({ state: 'detached' });
      await shot('files-search');
      await L('Search inside scans and PDFs').fill('nothing like this anywhere');
      await T('Nothing found for “nothing like this anywhere”').waitFor();
      await R('button', { name: 'Clear the search' }).click();
      await R('button', { name: /^Home insurance\./ }).waitFor();
      // The scan goes again, from its own page.
      await R('button', { name: new RegExp(`^Library card ${tag}\\.`) }).click();
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Delete', exact: true }).click();
      await T('Delete this document?').waitFor();
      await R('button', { name: 'Delete document', exact: true }).click();
      // (How many there are is the sample data's business: other places' samples add a scan or two.)
      await R('button', { name: /^All \d+$/ }).waitFor();
    });

    await step('document', async () => {
      // The trip it is needed for is linked to it in the sample data ("Norway 2027", in Plan).
      await R('button', { name: /^Mia's passport\. ID\./ }).click();
      await R('heading', { name: "Mia's passport" }).waitFor();
      await T('Read from the scan').waitFor();
      // Plan says when the trip is, so the page says what matters about the date: it runs out too soon after it.
      await T(/^Runs out \d+ months after Norway 2027$/).waitFor();
      await T(/A good day to see to it: /).waitFor();
      await R('button', { name: /^Needed for Norway 2027\./ }).waitFor();
      // The number stays out of sight until its eye is pressed.
      await T('•••••• 2C3').waitFor();
      await shot('document');
      await R('button', { name: 'Show the number' }).click();
      await T('L898902C3').waitFor();
      await R('button', { name: 'Hide the number' }).click();
      await T('•••••• 2C3').waitFor();
      // "Remind me" makes the reminder in Plan and links it.
      await R('button', { name: 'Remind me', exact: true }).click();
      await T(/^Reminder set for .+\. It is in Plan\.$/).waitFor();
      await T(/A reminder is set/).waitFor();
      await R('button', { name: 'Remind me', exact: true }).waitFor({ state: 'detached' });
      const linked = await ctx.api(nora, 'GET', `/v1/things/${passport.id}/links`);
      if (!linked.some((thing) => thing.kind === 'reminder' && thing.title.startsWith("Mia's passport:"))) throw new Error('no reminder is linked to the passport');
      await shot('document-reminded');
      await R('button', { name: 'More', exact: true }).click();
      await R('button', { name: 'Who can see it', exact: true }).waitFor();
      await shot('document-menu');
      await R('button', { name: 'Close' }).click(ABOVE_THE_SHEET);
      await R('button', { name: 'Back', exact: true }).click();
      // The list of files says so too.
      await R('button', { name: /^Mia's passport\. ID\. Expires .+ · reminder set$/ }).waitFor();
      await R('button', { name: 'Back', exact: true }).click();
    });

    await step('storage', async () => {
      await R('tab', { name: 'You' }).click();
      await R('button', { name: /^Storage and backup/ }).click();
      await R('heading', { name: 'Storage and backup' }).waitFor();
      await T(/^of 200 GB · shared by The Linds$/).waitFor();
      for (const kind of ['Photos', 'Videos', 'Files', 'Other']) await T(new RegExp(`^${kind} [\\d.]+ (B|KB|MB|GB)$`)).waitFor();
      await T('By person').waitFor();
      for (const person of ['You', 'Alex', 'Mia', 'Leo']) await L(new RegExp(`^${person}: [\\d.]+ (KB|MB|GB)$`)).waitFor();
      await T('This phone').waitFor();
      await shot('storage');
      // What only a phone can do is drawn, and says so when pressed.
      await R('button', { name: /^Backing up, on Wi‑Fi only\./ }).click();
      await T('Backing up a camera roll by itself needs the app on a phone. In a browser, add photos with the + button.').waitFor();
      await R('button', { name: 'Free up', exact: true }).click();
      await T('Freeing up space needs the app on a phone: a browser keeps no copies to remove.').waitFor();
      await shot('storage-needs-a-phone');
      await R('button', { name: 'Back', exact: true }).click();
      await R('tab', { name: 'Home' }).click();
    });
  } finally {
    // Whatever happened: the second person leaves the family, and what the walk made is taken away.
    if (sam) await sam.close().catch(() => undefined);
    const passportNow = await tidy().catch(() => undefined);
    // The sample is left as it was found: its reminder is on the passport again.
    if (passportNow && sampleReminder) await ctx.api(nora, 'PUT', `/v1/things/${passportNow.id}/links/${sampleReminder}`).catch(() => undefined);
    fs.rmSync(folder, { recursive: true, force: true });
  }

  await step('library-sign-out', async () => {
    await ctx.signOut();
  });
};
