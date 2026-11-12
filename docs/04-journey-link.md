# The two apps, together

> **Status:** proposal for your review. · **Updated:** 11 Nov 2026
>
> The screens for this are group 10, "With Journey".

## The idea in one line

**Journey is the story you tell. This app is where your people keep things.** So two verbs join them: **Keep** brings a journey home, and **Tell** turns something kept into a journey.

Everything below follows from that. A person never has to think "which app has my photos": the photos are theirs, one app keeps them and the other tells stories with them.

## What you'd see

### 1. One account

Sign in to one and you are signed in to the other. On a phone that already has Journey, the first button here is "Continue as Nora". Your name, photo and the people you know carry over, so inviting Alex to a circle, or to a journey, never means typing his name twice.

### 2. A switch between the apps

Hold the **You** tab in either app and a sheet offers the other one, already signed in. The two bottom bars have the same shape (Home, a second tab, +, Activity, You), the same gold + button and the same glass, so moving between them feels like changing rooms, not changing apps.

### 3. Keep a journey

When a journey is finished, Journey's recap gets one more button: **Keep in Porchlight** (or whatever the name becomes). You choose what comes home:

- **The story as a book.** One page in Notes, laid out by itself: cover, the numbers, then each day with its words and photos. It stays linked, so an entry added later appears too.
- **The originals.** Journey shows a lighter copy of each photo. Here the full-size files are matched to what your phone already backed up, so the Library has the real thing.
- **The route.** Drawn on your Places map.
- **The comments and likes**, if you want the kind words kept.

This can also be automatic: "Keep every journey I finish".

### 4. Tell it as a journey

The other direction. Pick a moment or an album in the Library and choose **Journey**. The app drafts it: photos sorted into days by when and where they were taken, a title suggested, the Trip template chosen. You fix what you like and continue in Journey.

Before anything leaves, one screen stands in the way: **Before it leaves home.** These photos were private, so by default it leaves out photos showing a child's face, shows the town instead of the exact spot, and skips anything taken at home. Files, bills and the Vault can never be sent. The new journey starts as Private.

### 5. A trip that plans here and is told there

A trip gets a space with three stages:

1. **Plan** here: the day-by-day page, the packing list, the budget sheet, the passports.
2. **Go:** on the first day the space offers to become a journey. Title, dates, route and co-authors are already filled in. You post from the road in Journey.
3. **Keep:** when it ends, it comes back as a **trip book**: the journey, the map, and what it really cost next to what you planned.

This is the feature I would lead with. Neither app could do it alone.

### 6. Journey, at home

- When someone in the circle is on a journey, Today shows it: "Alex is on a journey · Day 6 of 9". The family can follow without having Journey installed.
- **On this day** mixes kept journeys with ordinary photos: "2 years ago: Day 22, sunrise over Bromo".

### 7. Goals and challenges

A goal here can be a challenge there. "Family 10K" is a goal with a ring in Plan and a 30-day challenge in Journey; each check-in in Journey moves the ring at home.

### 8. A circle as an audience in Journey

Today a private journey is shared by inviting people one at a time. With a circle, Journey can offer **"Only The Linds"**: one tap, and the family can follow a journey nobody else can see.

### 9. One Sunday summary

Journey already sends a weekly digest. With both apps, there is one message: the household's week, then the journeys.

### 10. Goodnight from far away

Added on 11 Nov. When someone is on a journey and has children in a circle, Journey offers one small thing at the children's bedtime: record a goodnight. The clip goes to the circle only and is never part of the journey other people see. At home it is waiting on Today.

### Smaller ties in the new keepsakes

- An **Open when…** letter marked "when I'm away" comes forward by itself while its writer is on a journey.
- **Grandma's stories** can become a journey told in parts, with her voice.
- A slip can be dropped into **the good things jar** from Journey's composer.
- A **secret mission** can be completed from the road.

### Ties in the other kinds of circle

Added on 12 Nov.

- **Friends: Where next?** The place that wins the vote becomes a trip space, and on the day you leave it becomes a shared journey with all five as authors.
- **Friends: a goal you walk together.** The crew's shared distance can also be a challenge in Journey, if they want the day count to be public. The kilometres are typed in either way.
- **Couples: Our story.** Journeys the two of you kept appear on the timeline by themselves.
- **Any circle: the awards and the trip shelf.** Kept journeys are what "Photo of the year" is chosen from.

## What they must never share

| Rule | Why |
|---|---|
| Nothing private goes to Journey without the "Before it leaves home" screen | A family album and a public feed are different promises |
| Journey never learns what is in a circle, only that it exists and who is in it | A social app's database should not hold a household's bills |
| The Vault is invisible to Journey, always | It is scrambled on the phone; even this app's own server can't read it |
| Blocking in Journey does not remove someone from a circle, and leaving a circle does not unfollow | The two relationships are different; each app keeps its own |

## What it needs, in each codebase

| Link | In Journey | Here | Size |
|---|---|---|---|
| One account | Nothing: it already uses Supabase sign-in | Use the same Supabase project | Small |
| Switch between apps | A sheet on the You tab and a link that opens the other app | The same | Small |
| Keep a journey | A "Keep" button on the recap, and one new API answer: a journey's whole story for its author | A page template for the book in Notes, a matcher from Journey's photos to Library originals | Medium |
| Tell it as a journey | Accept a prepared draft (title, days, photos) from this app | Sort photos into days; the privacy screen | Medium |
| Trip space | Accept a draft with dates, route and co-authors | The space with three stages; the trip book | Medium, after the two above |
| Journey at home | An answer listing a person's active journeys for people allowed to see them | A card on Today; On this day | Small |
| Goals and challenges | Tell this app when a check-in is posted | Link a goal to a challenge | Small |
| Circle as audience | A new visibility, "a circle", checked against this app | Answer "is this person in that circle?" | Medium, and it touches Journey's privacy rules, so it needs care and tests |
| One summary | Let the digest be composed with this app's part | Supply the household's week | Small |
| Goodnight from far away | At the circle's bedtime, offer to record a clip that is sent here instead of posted | Show it on Today; a reply clip | Small to medium |

One detail matters for "the originals". Journey deliberately does not keep the file the phone sent: it makes clean, smaller copies and discards the rest. So originals come from this app's own backup of the phone, matched by a fingerprint the phone computes when it posts. A photo that was never backed up here is kept at Journey's largest size, and the screen says how many matched ("201 of 214").

## In what order

1. **With the first version:** one account, the switch, Journey at home. Cheap, and they make the pair feel real from day one.
2. **Next:** Keep a journey. It is the one people will show their friends.
3. **Then:** Tell it as a journey, with the privacy screen.
4. **Later:** the trip space, goals and challenges, circle as audience, one summary.
