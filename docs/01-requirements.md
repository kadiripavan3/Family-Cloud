# What it does

> **Status:** first draft, for your review. Nothing here is decided until you say so. · **Updated:** 11 Nov 2026

## In one line

One private place for what a family, or a group of friends, keeps together: notes, photos and videos, the calendar, bills and budgets, goals, and the passwords everyone needs. Each thing is yours alone until you choose who sees it.

## Who it is for

- **A family:** two adults, children who may or may not have a phone, grandparents who join for the photos.
- **A couple**, **housemates**, or **a group of friends** who travel or split costs together.
- One person can be in several of these at once. Each group is a **circle**, with its own Home.

## What makes it different

Plenty of apps do one of these. The reasons to put them in one place:

1. **One sharing rule for everything.** A page, a photo, a bill and a password are shared the same way, with the same chip and the same sheet.
2. **Things know about each other.** A bill links to its login in the Vault and its invoice in Files. An event has its checklist, its budget and an album that fills itself. A goal reads its number from a sheet. A passport warns you it runs out before the trip.
3. **It hides things as well as it shares them.** A birthday plan hidden from one child. A sitter who gets four things for one evening. A password someone can use and never see.
4. **A spreadsheet made for a phone.** Typed columns, rows that open as cards, formulas you can read.
5. **It belongs with Journey.** See [The two apps, together](04-journey-link.md).

## How it is laid out

The top row of Home is where things live: seven places. One tap moves between them, the way Airbnb's top row does.

| Place | What is in it |
|---|---|
| **Today** | What is on, what is due and what is new, across everything |
| **Plan** | Calendar, reminders, shared lists, goals |
| **Lore** (was Notes) | Spaces, folders inside folders, pages, checklists, templates, keepsakes |
| **Library** | Every photo, video and document, from everyone |
| **Money** | Bills, subscriptions, sheets, splitting costs |
| **Health** | Medicines, visits, sick days, an emergency card, moving together |
| **Vault** | Passwords, cards, IDs, Wi‑Fi and door codes |

The bottom bar has the same shape as Journey's: **Home · People · + · Activity · You**.

The seven places and the way sharing works are the same in every circle. What a circle is offered inside them depends on its kind.

## A circle's kind shapes it

Added on 12 Nov. The kind chosen at setup (and changeable later) decides the words the app uses, who sees what to begin with, the starter spaces, and which templates, keepsakes and small rituals are offered. Changing the kind deletes nothing, and every template can still be found under All.

| | Family | Couple | Housemates | Friends |
|---|---|---|---|---|
| **Called** | the family | the two of you | the flat | the crew |
| **To begin with** | Only you, until shared | Shared with both | Shared with the flat | Shared with the crew |
| **Roles** | Owner, Adult, Teen, Child, Guest | None: equals | None: equals, decisions by everyone | None: equals |
| **Starter spaces** | Home · Kids · Trips | Our place · Money · Trips · Someday | The flat · Bills · Landlord | Trips · Plans · The dictionary |
| **Its templates** | Meal plan, chore wheel, house manual, babysitter notes… | Date ideas, who pays what, moving in, the wedding, names… | Cleaning rota, bills by nights, move-in photos, repair log, house rules… | When can everyone?, Secret Santa, where next?, who brings what… |
| **Keepsakes** | Time capsule, Open when…, birthday interview, Things they said, Same spot, Grandma's stories, good things jar, doorframe | Our story, tucked notes, the anniversary questions | Heard in the kitchen, the guest book, everyone who's lived here | The dictionary, predictions, the awards |
| **Fair and fun** | Whose turn?, piggy bank, secret missions, Saturday jar, Sleeps until…, Where is it? | Mystery date, both said yes, the fair share | The kitty, a fairer split, heads-up | Find a date, Secret Santa, where next? |
| **Health leans to** | Children's medicines, visits, vaccinations, habits | Doing it together; each other's medicines if you choose | Each person's own; nothing shared by default | Moving together, checking in |

A person can be in several circles of different kinds. Nora is in a family, a couple and a group of friends.

## Who can see what

- **Everything starts as "Only you".** Also what you import.
- Every item carries a small **audience chip**: Only you, some people, or everyone in the circle. Tapping it opens one sheet, the same everywhere.
- "Some people" lets each person **view** or **edit**.
- **Hidden from:** share with everyone except one person, until a date. The plan for Mia's birthday opens to her the day after.
- **Roles:** Owner, Adult, Teen, Child, Guest. A child sees photos, the calendar and their own jobs; Money and the Vault stay shut. A child or a pet can be in a circle without a phone.
- **Guest pass:** chosen things for someone outside the circle, for a set time, on one phone, with no account.
- **A link for someone outside:** an album for the grandparents, with an end date and a code.
- **A person's page** gathers what the circle keeps about them: what is coming up, sizes, allergies, documents, photos.

## Lore

The place that was called Notes. A family's lore is what it knows and what it tells: how the house works, Grandma's recipes, what the children said. The same word fits a couple, a flat and a group of friends. The name is one setting (`places` in `design/tokens.json`); Pages, Handbook and Almanac are the alternatives I'd consider. A single thing you write is still a note or a page.

- **Spaces → folders → sub-folders → pages**, as deep as you like. A page can be a note, a checklist or a sheet.
- A page is built from blocks: text, checklist, photo, file, place, and live blocks from other places (a bill, an event, a sheet total, a goal, a password that copies without showing).
- Shared lists update while two people use them, and work with no signal.
- **Templates, about 50 to start:** house manual, babysitter notes, packing list, birthday planner, recipe book, medical record, pet care, home inventory, emergency plan, school year, moving house and more.
- **Templates that do work**, marked LIVE: the weekly meal plan writes the shopping list; the chore wheel rotates jobs and counts stars; the time capsule seals letters until a date.
- **Keepsakes** (added 11 Nov, after your comment on the time capsule): Open when… letters that open at a moment instead of a date; the birthday interview, the same ten questions every year; Things they said, with the age added by itself; Same spot, every year, a photo lined up with last year's; Grandma's stories, one spoken answer a week; the good things jar, opened on New Year's Eve; the doorframe, for height marks.
- **Fair and fun** (added 11 Nov, after your comment on the chore wheel): Whose turn?, which remembers who chose last; the piggy bank, pocket money in three jars with interest from the parents; secret missions, one small kindness a week; the Saturday jar, shaken for something to do; Sleeps until…, a paper-chain countdown; Where is it?, a list of where things were put.

## Library

- **The wall:** everything, newest first, edge to edge. Pinch from days to months to years; drag the strip at the side to jump.
- **Moments:** photos taken at the same time and place by people in the circle come together as one, named by the place.
- **Lenses:** albums (shared, private, and ones that fill themselves by person), people, places on a map, files.
- **Files:** scans and PDFs with the text inside searchable. A document knows its dates and sets its own reminder.
- **Sharing:** select many, then share, add to an album, hide, save, or start a Journey entry.
- Originals are kept at full size. "Free up space" removes backed-up copies from the phone.

## Plan

- One list for the day: events, reminders and bills due.
- **Type it:** "Haircut for Leo Saturday at 10, remind me an hour before" becomes an event, and shows how it was read.
- Reminders can be given to someone else, can take turns, and can wait for a place instead of a time.
- An event gathers who is coming, a checklist, a budget and an album.
- **Goals** with rings: a money goal reads a sheet, a challenge reads Journey, others are ticked by hand.
- Apple, Google and school calendars can be laid over the family's.

## Jot: adding without opening the app

Added on 11 Nov, after your comment that every app makes you open it, find the note, edit and save.

**One line that takes anything.** The same line appears in several places. Whatever is typed or said into it is read the way "Type it" reads it and filed: something to buy joins the list, a day or a time makes a reminder, a name hands it to that person, anything else becomes a note. Something that looks like a code or a password is held back until you say whether it belongs in the Vault. Every line can be undone or moved from where it was jotted.

| Way in | iPhone | Android |
|---|---|---|
| **A note pinned in notifications** | A notification with a line to type in when pressed and held. Apple doesn't allow a permanent notification, so it returns after each add and every morning. | Stays at the top of the shade with the line always showing. It can be swiped away since Android 14, and comes straight back. |
| **Widgets** | One-tap chips for the things you add most, and lists you tick, right on the Home Screen and Lock Screen. | The same |
| **Typing from a widget** | Neither platform allows typing inside a widget. The line opens the app straight onto a bare bar with the keyboard up. | The line opens a small bar floating over the Home Screen; the app itself never shows. |
| **A list in use** | A Live Activity on the Lock Screen with ticks, for up to 8 hours | Part of the pinned note |
| **Voice** | Siri, or hold any mic. One sentence can hold several things. | Hold any mic |
| **A button** | Action Button or Back Tap | A quick-settings tile, or a long press on the icon |
| **Share** | From any app's share button | The same |
| **Email** | Forward a booking, a bill or a school letter to the circle's own address | The same |

What I believe is unusual here is the combination: one line, in every one of those places, that sorts shopping from reminders from notes from secrets, and hands a job to another person. I have not surveyed every app, so treat "nobody else has this" as a goal, not a finding.

## Money

- **Bills:** what is due, who pays, what it usually costs, where the login and the invoice are. Scan a letter to add one.
- **Subscriptions** with renewal dates.
- **Sheets:** a real spreadsheet. Columns have a kind (text, person, money, date, tick). Totals sit on top as tiles. Every row opens as a card. Formulas are built from named chips, shown as a sentence, and can be asked for in words. Excel and CSV in and out.
- **Sheet templates:** monthly budget, trip budget, loan planner, savings plan, net worth, debt payoff, tax checklist, car costs, renovation, allowance.
- **Splitting costs** in a circle of friends, with the fewest payments to settle up.
- **Not a bank.** It keeps count; it does not move money or read accounts.

## Health

Added on 12 Nov, for every kind of circle.

- **One line per person** saying only what needs doing: a medicine, a check-up that slipped, a booster that is due. Pets too.
- **A health page per person:** what they take now, allergies, vaccinations, their doctor, their insurance card (kept in the Vault), growth.
- **Who gave the medicine?** Each dose is ticked by whoever gave it and seen by the other parent at once. A second tick within four hours is stopped. It works from the pinned note and the widgets.
- **A sick day, written down:** temperatures, doses and notes from both parents on one line through the days, sent to the doctor as one page.
- **A visit to the doctor:** the questions you meant to ask, what was said, and what it sets up: the medicine, the next check-up, the fee in Money.
- **The emergency card:** what a stranger would need and nothing else. It goes in a guest pass, to school as a link, or prints as a code.
- **Moving together:** a circle's walking and running adds up along a real route. Steps come from each phone's health app; only weekly totals are shared, never routes.
- **Small habits:** charts a child can fill in, with stars that go to the piggy bank. A missed day is a gap, never a reset.
- **How's your weather?** One tap a week instead of "I'm fine", seen only by the people you choose.
- **What runs in the family:** the family's health history, filled in once for the question every doctor asks.
- **Yours first.** Nothing in Health is shared until that one thing is shared. Children's health is looked after by their parents until it becomes theirs. Records, visits and medicines are kept like the Vault.
- **Not a health service.** It keeps records and reminders. It does not diagnose, advise or watch anyone.

## Vault

- Logins, cards, IDs, Wi‑Fi, door codes and secret notes.
- Scrambled on the phone with a key only the person holds. The service stores it and cannot read it.
- Share one item three ways: **use without seeing**, see, or change. It can vanish after one look, or stop working on a date.
- **If something happens:** a trusted person can ask for access; you have 48 hours to say no.
- **No reset.** A printed Vault key, and helpers who can together let you back in.

## Not in the first version

| Left out | Why |
|---|---|
| Chat | Families already have a chat app. Comments on a photo or a page are enough. |
| Bank connections and payments | Regulated, expensive, and different in every country |
| Sharing live location | A different kind of app, with a different kind of worry |
| A web or desktop version | Phones first, like Journey. Shared links open as web pages. |
| Filling passwords into other apps | Needs native code on each platform. Copy and "open signed in" come first. |
| Recognising faces | The "by person" albums start from who took a photo and who is tagged. See the questions below. |
| Medical advice of any kind | The app keeps what you tell it and reminds you. Suggesting a dose, a diagnosis or a risk would make it a medical product, with the rules that go with one. |

## Calls I made for this draft

These are choices I made so the draft could exist. Each one is yours to overturn.

| # | Call | Why | Easy to change? |
|---|---|---|---|
| 1 | Seven places in Home's top row; People, +, Activity and You in the bottom bar | Seven things don't fit a tab bar, and Airbnb's pattern is the one Journey already borrows. The bar matches Journey's. | Yes: it is a layout |
| 2 | "Circle" is the word for a group | Works for family and for friends | Yes |
| 3 | Everything starts as "Only you" | The safe default for an app holding bills and passwords | Yes, per kind of circle (a couple could default to shared) |
| 4 | Only the Vault is scrambled so the service can't read it | Search inside scans, reminders from documents and "moments" need the service to read the rest. Scrambling everything would switch those off. | Hard to change later. Worth a real conversation. |
| 5 | Money does not connect to banks | Cost, regulation, and trust | Can be added later |
| 6 | Children and pets can be members without a phone | It is how families work | Yes |
| 7 | The name on the screens is Porchlight, with a switch to try others | You asked for a better name. See [The name](03-name.md). | Yes: one setting |
| 8 | The same account, look and stack as Journey | You asked for this | No, and it shouldn't be |
| 9 | Euros and a family in Slovenia in the examples | Made-up people need a currency and a place | Yes |
| 10 | Jot is shown with each phone's real limits | An iPhone can't keep a notification for ever or take typing in a widget; an Android phone can do more. The screens show what each can really do, and say so. | The limits are Apple's and Google's |
| 11 | The new groups sit at the end of the screens for now | So the numbers of the screens you have already reviewed don't move. They go into their proper places once you've seen them. | Yes |
| 12 | Notes is now called Lore | You asked for something catchier. Lore is what a family, a flat or a crew knows and tells. | Yes: one setting |
| 13 | Health is the seventh place, in every kind of circle | You asked for it for all groups | The row holds seven; an eighth would not fit |
| 14 | Health is private per person, and its records are kept like the Vault | It is the most sensitive thing in the app after passwords | Hard to loosen later, easy to keep |
| 15 | The kind of circle changes what is offered, never how the app works | Seven places and one sharing rule everywhere, so moving between circles never feels like changing apps | Yes |
| 16 | Nobody is in charge of a flat or a group of friends | Splits, rules and guests are agreed by everyone or not at all | Yes |

## Questions for you

1. **The top row.** Are these the right seven places, in the right order? Is anything you use daily more than one tap away?
2. **What is the first version?** All seven places is a big build. My suggestion is below.
3. **How private is private?** Call 4 above. If you want the service unable to read notes and photos too, some features have to go or move onto the phone.
4. **Will it cost money?** Storing a family's full-size photos and videos has a real monthly cost. A free amount with a paid family plan is the usual answer.
5. **Faces.** Grouping photos by who is in them is what makes "every photo of Mia" magic. It is also sensitive, most of all with children. On the phone only, off by default, or not at all?
6. **Lore.** Does the new name for Notes sit right? Pages, Handbook and Almanac are the others I'd consider.
7. **Health and the law.** Health details are a protected kind of personal data in Europe and elsewhere, and app stores have their own rules for them. Before Health is built it needs a proper check by someone qualified. Is Health in the first version, or after it?
8. **Forwarding an email in.** It needs a service that receives mail for the app, which Journey doesn't have. Worth it for the first version, or later?
9. **Which keepsakes and perks first?** Thirty-one are drawn across the four kinds of circle. They are templates, so they can arrive a few at a time. Tell me your favourites.

## A suggested order

| Step | What | Why first |
|---|---|---|
| 1 | Sign-in shared with Journey, circles, roles, the audience chip | Everything else stands on it |
| 2 | Library: the wall, backup, moments, albums, sharing | It is why people open the app every day |
| 3 | Plan: calendar, reminders, lists, and Jot (the pinned note and the widgets) | The second daily habit, and Jot is what makes it effortless |
| 4 | Lore: spaces, pages, checklists, the first ten templates for each kind of circle | |
| 5 | Money: bills, then sheets | Sheets are the largest single piece |
| 6 | Vault | Needs a security review before anyone trusts it with real passwords |
| 6b | Health | Shares the Vault's way of keeping things, so it follows the Vault, and needs its own legal check |
| 7 | With Journey: Keep, then Tell | The switch and "Journey at home" can come with step 1 |

Each step is useful on its own and can go to a few test families before the next begins.
