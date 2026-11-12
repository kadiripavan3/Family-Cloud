# The Vault: how it is protected

> **Status:** built on both sides. The API is tested end to end with real keys (`VaultProtocolTest`); the app's cryptography (`apps/mobile/src/features/vault/crypto/`) is tested against the published test vectors of each algorithm and against a second implementation, and the two sides are walked together in a browser (`scripts/e2e/steps/06-vault.js`). **Not yet looked at by anyone outside**: the review named in [Tech and costs](02-tech-stack.md) has to happen before real passwords go in. **Not yet run on a phone**: everything was run in the browser preview and under the tests. · **Updated:** 12 Nov 2026
>
> This is the contract between the app and the API, and the text an outside reviewer checks. Where the code and this document disagree, one of them has a bug.

## In one paragraph

Everything secret in the Vault is scrambled on the phone before it leaves it. Each person has a key pair made on their phone; each item has its own random key; an item's key is kept wrapped, once for each person who may open it, with that person's public key. The API stores scrambled text and public keys. It decides who is handed which scrambled piece and when (only people an item is shared with, a share that vanishes after one look, a trusted person after a wait, a helper during a recovery), and it holds no key that opens any of it. A person gets back in on a new phone with their Vault key, 24 characters shown once and never sent anywhere, or with the help of two people they chose. What the API can see is said plainly below: titles, kinds, who shares with whom, and when.

## Words used here

| Word | Meaning |
|---|---|
| **The phone** | The app, on a device its owner has unlocked. All scrambling and unscrambling happens here. |
| **The API** | The server and its database. It never sees a key that opens anything, or anything unscrambled. "The service" means the API and whoever runs it. |
| **Sealed** | Scrambled so that only the holder of one key can read it, and so that any change to it is noticed. |
| **Wrapped** | A key that has been sealed. "The item key wrapped for Alex" is the item key, sealed so that only Alex's private key opens it. |
| **Item** | One thing in the Vault: a login, a card, an ID, a Wi‑Fi network, a code, a secret note. |
| **Grant** | One person's permission to open one item, and their wrapped copy of its key. |
| **Vault key** | 24 characters, such as `KT4M 9QXZ PL2A 77HD VB3N E8RW`. It opens a person's private key on a new phone. |
| **Member** | A person's place in one circle. Things are shared with members. |

## What is protected, and from whom

| Who | What they cannot do | What they can do |
|---|---|---|
| **The service**: the API, its database, its backups, its logs, anyone who works there, anyone who steals a copy of the database | Read what is inside an item, a note for the family, a door code on a guest pass, anyone's private key or Vault key | See everything in "What is not protected" below. Refuse to serve. Delete. |
| **Someone on the network** | Read or change anything (the connection is encrypted, and the secret parts are sealed underneath it) | See that a phone is talking to the API |
| **Someone in your circle an item is not shared with** | Learn that it exists | Nothing |
| **Someone an item is shared with** | Change who it is shared with; change it, unless they were given "can change" | Read it. With "can use" the app doesn't show it to them, but see the next section. |
| **Someone you removed** | Be handed anything from then on | Keep whatever they saw or copied while they had it |
| **Your trusted person, before the wait is over** | Be handed anything, or learn what would open | Know that you chose them. Ask. |
| **One helper alone** | Rebuild your Vault key | Know they are your helper |
| **A guest with a pass** | See anything that isn't on the pass, or a show-once card a second time | Read what is on the pass while it runs |
| **Someone with your sign-in but not your phone or your Vault key** (they got into your email, say) | Read anything in your Vault | See what the API can see. Delete things. Start a recovery (you are told on every phone; your helpers have to agree). Switch your emergency access off. |

## What is not protected

Said plainly, because a password manager is a promise.

1. **Titles and labels are in the clear.** An item's title ("Netflix"), its kind (login), its site or label ("netflix.com", "home"), the day an ID runs out, who it is about and the phone's verdict on the password (ok, weak, reused, leaked) are stored unscrambled. Search, reminders ("Mia's passport runs out in 23 days") and a person's page need them. So don't put a secret in a title. The service can read all of these.
2. **Who shares what with whom, and when.** The API knows which members hold a grant for which item, with which permission, when each person was last handed an item, when it was changed and how big it is. It knows who your trusted person and your helpers are, and how many things would open to them.
3. **"Can use, can't keep" is a rule of the app, not of the mathematics.** A phone that can fill a password in holds that password for that moment. The app never shows it and offers only "fill in" or "copy once"; a person with a modified app, a debugger or a rooted phone can get it out. The app says "can't see", never "can't get". The same is true of "gone after it's opened once" and "stops working on Sunday": the API stops handing the item out, but what a phone was handed, its holder may have kept.
4. **A phone that is unlocked in someone else's hands.** The Vault locks itself after two minutes and asks for Face ID, which is the phone's own protection. Until it locks, whoever holds the phone holds the Vault.
5. **A service that turns bad on purpose.** The design protects against a service that is curious, careless, broken into or made to hand over its database. It does not yet protect against a service that actively lies to phones. Three places, each an open question for the review:
   - *Public keys.* A phone seals for Alex with the public key the API says is Alex's. A lying API could hand out its own key instead, and read whatever is shared after that moment (never what is "only you", and nothing shared before).
   - *The guest page.* A guest has no app. The page that opens a sealed card is code the API sends. A lying API could send code that reads the key.
   - *Timing rules.* The wait before emergency access opens, "once", "stops at" and "only during a recovery" are kept by the API's code. The pieces involved are already sealed for the person who will get them; it is the API that holds them back. A lying API together with your trusted person could skip the wait; a lying API together with two helpers could rebuild your Vault key without you. The service alone still can do neither.
6. **Rolling back.** The API could hand a phone an older version of an item. The phone can't tell unless it remembers the newer one.
7. **Nothing is signed.** A ciphertext proves that whoever wrote it had the item key, not which of the people with that key wrote it. The API's record of who saved last is the API's word.
8. **Erased is not erased from backups.** When a once-only key is used or a share stops, its wrapped key is erased from the database. A database backup taken before keeps it until the backup itself expires. It stays useless to anyone without the person's private key.

## The building blocks

The app uses these. The API never runs any of them: to it, everything below is text it stores and hands back.

| For | Algorithm |
|---|---|
| Agreeing on a key with a person | X25519 |
| Sealing | XChaCha20-Poly1305 (24-byte nonce, 16-byte tag) |
| Deriving a sealing key from an agreement | HKDF-SHA-256 |
| Deriving a key from the Vault key | scrypt |
| Keys | 32 random bytes from the phone's secure random source |
| Splitting the Vault key for helpers | Shamir's secret sharing over GF(256) |
| A sealed card on a guest pass | AES-256-GCM, because a browser has it built in (Web Crypto) and the page then needs no library |
| A one-time code | TOTP (RFC 6238), worked out on the phone from a secret inside the item. Nothing is served. |

**What the app uses for them** (checked on 12 Nov 2026 on the npm registry; each is MIT, pure JavaScript with no native part, and pinned to one exact version in `apps/mobile/package.json`):

| Package | Version | Used for |
|---|---|---|
| `@noble/curves` | 2.4.0 | X25519 |
| `@noble/ciphers` | 2.4.0 | XChaCha20-Poly1305, and AES-256-GCM for a guest pass (a phone has no Web Crypto) |
| `@noble/hashes` | 2.4.0 | HKDF-SHA-256, scrypt, SHA-256, and HMAC-SHA-1 for one-time codes |

Written in the app itself, because they are small: Shamir's sharing (`crypto/shamir.ts`), one-time codes over the library's HMAC (`crypto/totp.ts`), base64url and UTF-8 (`crypto/bytes.ts`), and the layout of a sealed piece (`crypto/seal.ts`). The app's own tests hold each to its published test vectors: RFC 7748 (X25519), RFC 5869 (HKDF), RFC 7914 (scrypt), the XChaCha draft's example, the GCM standard's test case 14, RFC 4226 and RFC 6238 (one-time codes), RFC 4648 (base64). A swap of library has to pass the same tests.

**Random bytes** come from the phone's own secure source through `expo-crypto`'s `getRandomValues` (in the browser preview: `crypto.getRandomValues`). Not through its `getRandomBytes`: that one falls back to `Math.random` in a development build. A source that returns nothing (sixteen zero bytes) stops the app instead of handing out a zero key.

**Text on the wire.** Every sealed piece and every key travels as **base64url without padding** (`A–Z a–z 0–9 - _`). The API refuses anything else with a sentence, so a password sent in the clear by mistake is turned away rather than stored. It also bounds the length of each kind (see [Limits](#limits)).

### Sealing with a key both sides hold

Used for an item (with its item key) and for the private key (with the key made from the Vault key).

```
sealed = 0x01 || nonce || XChaCha20-Poly1305(key, nonce, plaintext, associated data)
```

- `0x01` is the version of this layout.
- `nonce` is 24 random bytes, new for every sealing.
- The associated data is the text `homeport/vault/v1/` followed by the **purpose** (table below), so that something sealed for one use doesn't open as another.

### Sealing for a person

Used whenever only one person may open something: a wrapped item key, a share for a helper, a note for the trusted person. The sender needs only the recipient's public key `P`.

```
(e, E)  = a fresh X25519 key pair, used once and thrown away
shared  = X25519(e, P)                      refuse an all-zero result
key     = HKDF-SHA-256(input = shared, salt = E || P, info = "homeport/vault/v1/" + purpose, 32 bytes)
sealed  = 0x01 || E || nonce || XChaCha20-Poly1305(key, nonce, plaintext, associated data = info)
```

The recipient computes `shared = X25519(p, E)` with their private key `p` and opens it the same way. For a 32-byte key the result is 105 bytes, 140 characters.

### Purposes

| Purpose | What is sealed | For whom |
|---|---|---|
| `private-key` | A person's private key | The key made from their Vault key |
| `item` | An item's secret part | Its item key |
| `item-key` | An item key (a grant) | One person |
| `escrow-key` | An item key, for emergency access | The trusted person |
| `escrow-note` | The note for the family | The trusted person |
| `own-note` | The same note, so its writer can read it again | The writer |
| `helper-share` | One share of the Vault key | One helper |
| `recovery-share` | The same share, passed on during a recovery | The temporary key of the new phone |
| `pass-key` | A guest pass's key, kept for its maker's other phone | The pass's maker |
| `this-device` | A person's private key as a phone or browser keeps it between unlocks, when it is kept behind a passcode. **Never sent anywhere.** | A key made from that passcode |

### The Vault key

- 24 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `I`, `O`, `0` or `1`, which are easy to confuse), each chosen at random: 120 bits. Shown in six groups of four.
- Shown once, on the phone, to save or print. **Never sent to the API**, in any form.
- Before it is used, it is put in upper case and the spaces are taken out (the app takes out line breaks too: the key is shown on two lines).
- `wrapping key = scrypt(Vault key, salt, N, r, p, 32 bytes)` with a random 16-byte salt. The app uses N = 32768, r = 8, p = 1 unless the review says otherwise. The salt and the three numbers are stored next to the wrapped private key, so a new phone can do the same sum. They are not secret. (The API accepts N from 2^14 to 2^22 as a power of two, r 1 to 32, p 1 to 16; a phone should refuse numbers so large they would freeze it. The app refuses, before doing any of the sum, a record that asks for more than 128 MB (N × r above 2^20) or more than eight times its own work (N × r × p above 2^21).) The sum is done in slices of about 12 milliseconds, so the screen keeps drawing and shows how far it is.
- `wrapped private key = seal(wrapping key, private key, "private-key")`.
- After unwrapping, the phone works out the public key from the private key and checks it against the one in the record. If they differ, it stops.

### Splitting the Vault key for helpers

The secret is the Vault key's 24 characters (upper case, no spaces) as 24 bytes. For "any two helpers together":

- For each byte `s` of the secret, pick a random byte `a`. Helper number `x` (1, 2, 3 … up to 255, each helper a different number) gets `s XOR (a × x)`, where `×` is multiplication in GF(256) with the polynomial x⁸ + x⁴ + x³ + x + 1 (the one AES uses).
- A share is the helper's number followed by those 24 bytes: 25 bytes.
- Two shares give the secret back: for shares at `x₁` and `x₂` with bytes `y₁` and `y₂`, `s = (y₁ × x₂ XOR y₂ × x₁) ÷ (x₁ XOR x₂)`.
- One share says nothing about the secret. Shares from two different splits don't fit together, so all the shares a person's helpers hold are replaced at once.
- Each share is sealed for its helper (`helper-share`).

### A sealed card on a guest pass

```
pass key = 32 random bytes, made by the phone that makes the pass
card     = nonce (12 random bytes) || AES-256-GCM(pass key, nonce, the text to show as UTF-8)   (the tag is the last 16 bytes)
link     = the pass's address + "#" + base64url(pass key)
```

The part of an address after `#` is never sent by a browser: not in the request, not in a log, not as a referrer.

## Every key, and where it lives

| Key | Made by | Where it lives | The API holds |
|---|---|---|---|
| **A person's private key** | Their phone, when they set up their Vault | In the phone's secure storage. Nowhere else in the clear. | It wrapped with the key made from the Vault key |
| **A person's public key** | The same moment | Their phone, the API, and the phones of people in their circles | It, as it is |
| **The Vault key** | Their phone | On paper or in a PDF the person saved. **The app does not keep it:** it is held in memory from the moment it is made until the person says "I've saved my key" or the Vault locks, and typed again when it is needed (see [question 9](#open-questions-for-the-review)). | Nothing. For someone with helpers: shares of it, each sealed for one helper. |
| **The key made from the Vault key** | Any phone that is given the Vault key | Only in memory, while unwrapping | Nothing (the salt and the numbers to derive it) |
| **An item key** | The phone that creates the item, or that gives it a new key | In memory while an item is open | One wrapped copy for each person with a grant, and one for the trusted person if the item is in the escrow |
| **A temporary key pair** | A new phone, for one recovery | That phone, until the recovery ends | The public half |
| **A guest pass's key** | The phone that makes the pass | In the link that is sent to the guest; on its maker's phone | Nothing, or it sealed for its maker's Vault |

## On the phone

What the app does with all of the above between the API and the screen. None of it reaches the API.

**Unlocked means: the private key is in memory.** It is nowhere else in the clear. It is overwritten and let go of when the Vault locks:

- after two minutes without a touch on a Vault screen (or the time chosen under "Lock the Vault after" on Privacy and security);
- when the app goes to the background;
- when the person locks it by hand;
- when they sign out, however the sign-in ends.

A screen of the Vault that is open when it locks is replaced by the locked page, and starts afresh after unlocking: nothing it held outlives the lock. (JavaScript gives no promise that no copy of a key is left in memory; see the questions.)

**Between unlocks the private key is kept wrapped**, one of two ways:

| Way | Where | What opens it |
|---|---|---|
| Behind Face ID or a fingerprint | The phone's secure storage (Keychain, Keystore), stored with the option that requires authentication | The phone, after it has recognised its owner. When the faces or fingerprints on the phone change, the phone throws the entry away, and the Vault key is typed again. |
| Behind a passcode | The secure storage of a phone without Face ID (and of Expo Go on an iPhone, which can't ask for it). **In the browser preview: the browser's own storage.** | A passcode of at least 8 characters the person chose, through scrypt with the numbers above, then `seal(…, "this-device")` |

The key that comes out is checked against the public key in the person's record before it is used. Signing out locks the Vault; the wrapped key stays on the phone under that account's name, where another account doesn't find it.

**The browser preview is for trying things out, not for real secrets,** and it says so where the passcode is chosen. A browser has no secure storage and no Face ID: whoever can read that browser's storage can keep guessing passcodes, and any script that gets into the page while the Vault is unlocked can read what the page can.

**What is never written anywhere:** anything a phone has opened (a password, a note, a share, a key), the Vault key, a passcode. Not to the app's data layer (what it has loaded and what it remembers of a change), not to what it keeps on the phone to open without a connection (nothing of the Vault is kept there at all, not even titles and sealed pieces), not to a log, and not into an error's own words. A test searches the data layer for each of these after an item was opened, shown and copied (`NothingSecretIsKept.test.tsx`).

**Copying** puts a value on the clipboard, which other apps can read. An iPhone is told to remove it after 60 seconds and not to pass it to the person's other devices. On Android it is marked as sensitive and the app empties the clipboard after 60 seconds if it still holds the value and the app is in front. A browser page empties it after 60 seconds if the browser lets it. What was pasted somewhere stays there.

**The Vault key on screen** is also drawn as a QR code and can be handed to the browser's print dialog as a page of its own ("Save as PDF"). Both are made on the phone from the text on the screen.

## The messages

Every route needs a signed-in person unless it says otherwise. "Sealed" fields are base64url text. Problems come back with a `code` and a sentence a person can read. The exact shapes are in `apps/api/openapi.json`; what follows is what each message is for and what the API checks.

### 1. A person's Vault

A Vault belongs to a person, not to a circle.

| Message | Sends | The API |
|---|---|---|
| `PUT /v1/vault` | `publicKey`, `wrappedPrivateKey`, `salt`, `kdf {n, r, p}` | Stores them. A person has one Vault: a second, different public key is refused (`vault_exists`). The very same again is fine. |
| `GET /v1/vault` | | Answers `setUp`, `publicKey`, `wrappedPrivateKey`, `salt`, `kdf`, `keyVersion`, `keySaved`. This is all a new phone needs besides the Vault key. Only ever your own. |
| `PUT /v1/vault/key-saved` | | Notes that the person said "I've saved my key". |
| `PUT /v1/vault/key` | `wrappedPrivateKey`, `salt`, `kdf` | A new Vault key for the same key pair: the private key wrapped afresh. The public key stays, so nothing shared has to change. `keyVersion` goes up, `keySaved` is false again, **every helper's share is thrown away** and an open recovery is closed. |
| `GET /v1/circles/{id}/vault-keys` | | `people`: the members of the circle who have a Vault, each with their `publicKey`. `without`: the members who can't be shared with yet, each with why (`no_vault`: hasn't set one up; `no_phone`: a child or someone without their own sign-in). |
| `GET /v1/vault/people` | | Everyone with their own sign-in across your circles, with `hasVault` and `publicKey`: for choosing a trusted person or a helper. |
| `GET /v1/vault/attention` | | What needs you now: your trusted person asked, a recovery of your Vault is open, someone asks you to be a helper, someone you help needs your share, a Vault you asked for, how many people wait for a key from you, whether your helpers' shares need making again. The app asks when it opens, so nothing depends on a push arriving. |

### 2. Items

An item is a thing like any other in the app (`vault_item`, in the place `vault`), so the one sharing rule decides who knows it exists and sees its title, and the general routes work on it: `DELETE /v1/things/{id}`, `/v1/things/{id}/about`, `/v1/things/{id}/links`.

**In the clear:** `title`, `category` (`login`, `card`, `id`, `wifi`, `code`, `secret`), `site`, `expiresOn` (an ID only), `about` (members), `health` (`ok`, `weak`, `reused`, `leaked`: the phone's verdict; the API can't know, and nothing sets `leaked` yet).

**Sealed:** everything else, as one `ciphertext` = `seal(item key, plaintext, "item")`. What the plaintext looks like is the app's business. It should repeat the title and the site inside, so a phone can notice if the clear labels were changed to point at something else.

*What the app seals* is JSON as UTF-8: `{"v": 1, "title", "site", "category", "fields": {…}}`, with the fields of its drawer (`username`, `password`, `totp`, `notes` for a login; `holder`, `number`, `expires`, `code`, `pin` for a card; `number` for an ID; `network`, `password` for Wi‑Fi; `code`; `text` for a secret note). When an item is opened and the labels inside are not the ones the API showed, the screen says so and shows the inside ones.

*The `health` word* is worked out on the phone when an item is saved: `weak` for a password shorter than 10 characters, or shorter than 16 with fewer than three kinds of character, or with fewer than five different characters; `reused` when another item the person opened since unlocking holds the same password (the phone compares keyed fingerprints that never leave memory); otherwise `ok`. Nothing sets `leaked`.

| Message | Sends | The API |
|---|---|---|
| `POST /v1/vault/items` | `clientId`, `circleId`, the clear fields, `ciphertext`, `wrappedKey` (the item key sealed for yourself, `item-key`) | Creates it as **yours alone**, whatever the circle's kind: a password is never shared by default. Stores your grant. Sending the same `clientId` again makes nothing new. Needs a Vault. |
| `GET /v1/vault/items/{id}` | | The clear part, `version`, your own standing (`myAccess`, `myState`, `once`, `stopsAt`), and `people`: who can use it. **Never the ciphertext.** |
| `GET /v1/circles/{id}/vault` | | The Vault's home: six drawers with how many items you may see in each, how many passwords need a look, and what others shared with you. |
| `GET /v1/circles/{id}/vault/items` | `category`, `mine`, `look`, `cursor`, `limit` | A page of items you may see in that circle. |
| `GET /v1/vault/items` | `cursor`, `limit` | Every item you own, across your circles. |
| `POST /v1/vault/items/{id}/open` | | **The only way anyone is handed a ciphertext.** Answers `ciphertext`, `version`, your own `wrappedKey`, `access`, `once`. See the rule below. |
| `PATCH /v1/vault/items/{id}` | Any clear field; or `ciphertext` with the `version` the phone read | Saves a change. Needs the item to be yours, or "can change". A new ciphertext is sealed with the **same** item key; it is refused (`changed_meanwhile`) if someone else saved since that version. |

**The rule for being handed an item.** The API hands a person an item's ciphertext and their own wrapped key only if both are true:

1. the sharing rule lets them see the thing (they are in the circle and it is theirs, or shared with them, and not hidden from them today; a teen or a child only if it was shared with them by name; a guest of the circle likewise); and
2. they hold a grant that is **ready** (see [the states of a grant](#a-grant)).

Each time it does, it writes down who and when. A grant marked `once` is used up in the same transaction: its wrapped key is erased as it is handed out, and of two phones asking at the same moment one gets it.

### 3. Sharing an item

Only the owner changes who an item is shared with.

| Message | Sends | The API |
|---|---|---|
| `GET /v1/vault/items/{id}/sharing` | | Everyone in the circle: their `publicKey` (or why there is none), their `access` and the `state` of their grant. `openedAt` only for the owner. |
| `PUT /v1/vault/items/{id}/sharing` | `audience` (`me`, `some`, `circle`), `everyone` (with `circle`: what people get who aren't named), `people [{memberId, access, once, stopsAt, wrappedKey}]`, optionally `hiddenFrom`, optionally `rotation` | In one transaction: changes the audience through the same code every thing is shared with (so the chip and the sheet stay true), and stores each person's grant. See below. |
| `PUT /v1/vault/items/{id}/keys` | `keys [{memberId, wrappedKey}]` | Hands keys to people who were waiting. Never replaces a key, never revives one that was used up or has stopped. |
| `GET /v1/vault/waiting` | | For the owner's phone: people who should be able to open one of your items and have no key yet, each with their `publicKey`. |

What `PUT …/sharing` does and checks:

- `access` is `use`, `see` or `change`. `change` also lets the person save changes; `use` and `see` differ only in what the app shows (see "What is not protected").
- Everyone in `people` is shared with by name. With `circle`, that is also how a teen or a guest of the circle is let in.
- A `wrappedKey` is taken only for someone the audience now includes, who has a Vault. Otherwise the whole request is refused and nothing changes (`not_in_audience`, `no_vault`).
- Someone named without a `wrappedKey` (they have no Vault yet), and with `circle` anyone who joins later, is **waiting for a key**. The owner's phone asks `GET /v1/vault/waiting` when it is open, wraps the item key for each and sends `PUT …/keys`.
- Whoever is no longer named (or, with `circle`, no longer included) loses their grant.
- `once` can't go with `change`. `stopsAt` has to be in the future.
- **`rotation`** gives the item a new key at the same moment: `{version, ciphertext, myWrappedKey, emergencyWrappedKey}`. The phone seals the item again with a fresh item key and wraps that key for itself and for each person who keeps access. Every wrapped key that isn't replaced in this request is dropped (its holder waits for a new one). If the item is part of the owner's escrow, the new key wrapped for the trusted person has to come along, or the request is refused (`escrow_key_needed`). **The app should do this whenever it removes someone**, because that person may have kept the old item key.

*What the app does when the sheet is saved:* someone new, someone who was waiting, and someone whose key was used up or had stopped gets the item key wrapped for them (if they have a Vault). Someone who holds a working key keeps it. When someone who has had the key is taken off, it sends a `rotation` in the same request. Keys for people who wait are handed over when the owner presses "Hand over" in their unlocked Vault, not silently.

The general audience sheet (`PUT /v1/things/{id}/audience`) also works on a Vault item, because it works on every thing. It hands nobody a key: people it adds wait for one, and people it removes are handed nothing from that moment.

### 4. If something happens

A person names one other person, a wait, the items that open and a note. The escrow is made on the owner's phone: each chosen item's key sealed for the trusted person (`escrow-key`), the note sealed for them (`escrow-note`) and once more for the owner (`own-note`).

| Message | Who | Sends | The API |
|---|---|---|---|
| `GET /v1/vault/emergency` | Owner | | `state`, `trusted`, `waitHours`, `items` (titles), `noteMine`, the times |
| `PUT /v1/vault/emergency` | Owner | `trustedMemberId`, `waitHours` (24 to 168, 48 if left out), `items [{id, wrappedKey}]`, `note`, `noteMine` | Turns it on or replaces it. The trusted person has to be in one of your circles, with their own sign-in and a Vault. Only your own items. The old escrow is thrown away. **A request that was running ends.** |
| `DELETE /v1/vault/emergency` | Owner | | Switches it off. The escrow is deleted. |
| `POST /v1/vault/emergency/refusal` | Owner | | Says no to the request that is running. |
| `GET /v1/vault/entrusted` | Trusted | | The people who named you, with the `state` of each. Nothing of what would open. |
| `GET /v1/vault/entrusted/{id}` | Trusted | | The same for one; once it is **open**, also `note` and the items' titles. |
| `POST /v1/vault/entrusted/{id}/ask` | Trusted | | Starts the wait. The owner is told on every phone, and it shows in their app. |
| `POST /v1/vault/entrusted/{id}/items/{itemId}/open` | Trusted | | Once it is open: that item's current `ciphertext` and its `wrappedKey` from the escrow. Written down. |

- The escrow holds item keys as they were when it was made. An item added to the Vault later is not in it until the owner's phone adds it. An item that gets a new key brings its new escrow key along (see `rotation`).
- Emergency access opens only what was chosen, through this door only: it changes nothing about who the items are shared with.
- If the two people are no longer in any circle together, the trusted person can neither ask nor read.
- If either deletes their account, the arrangement and the escrow are deleted with it.

### 5. Helpers and getting back in

| Message | Who | Sends | The API |
|---|---|---|---|
| `GET /v1/vault/helpers` | Owner | | Your helpers, each `asked`, `accepted` or `declined`; whether enough hold a share (`ready`); whether your phone should split the key again (`sharesDue`) |
| `POST /v1/vault/helpers` | Owner | `clientId`, `memberId` | Asks someone from your circles who has a Vault. Five at most. They are told. |
| `DELETE /v1/vault/helpers/{id}` | Owner | | Takes a helper off the list, with their share. |
| `PUT /v1/vault/helpers/shares` | Owner | `shares [{helperId, sealedShare}]` | Replaces **all** shares with those of a new split, one for each helper who said yes. At least two, or it is refused: one helper alone must never be enough. |
| `GET /v1/vault/helping` | Helper | | Who asked you, and who of them has a recovery open |
| `PUT /v1/vault/helping/{id}` | Helper | `accept` | Yes or no. Someone who said yes can step down later; their share is thrown away. |
| `POST /v1/vault/recoveries` | Owner, on a new phone | `clientId`, `tempPublicKey` | Starts a recovery. Needs two helpers who hold a share. Only one can be open. **The owner is told on every phone**, so one they didn't start doesn't go unnoticed; the helpers are told too. It lapses after 7 days. |
| `GET /v1/vault/helping/{id}/share` | Helper | | **Only while a recovery is open:** your own `sealedShare`, the `tempPublicKey` and the `recoveryId`. At any other time: refused. |
| `PUT /v1/vault/helping/{id}/share` | Helper | `recoveryId`, `resealedShare` | The share, opened on the helper's phone and sealed again for the temporary key (`recovery-share`). Refused unless that recovery is open. |
| `GET /v1/vault/recoveries/{id}` | Owner | | Who has helped; once two have, their `resealedShare`s |
| `POST /v1/vault/recoveries/{id}/finish` | Owner | | Closes it. The passed-on shares are deleted. |
| `DELETE /v1/vault/recoveries/{id}` | Owner, on any phone | | Cancels it. |

The new phone opens the two shares with its temporary private key, joins them into the Vault key, fetches `GET /v1/vault`, unwraps the private key and checks it against the public key. It should then have the person choose a new Vault key (`PUT /v1/vault/key`) and split that one for the helpers.

**A helper should check that it is really them** before helping: call, or ask in person. The app should show both people the same short check words worked out from the temporary public key (the first bytes of its SHA-256), so a recovery started by someone else doesn't look the same. The API can't do this check for them.

*What the app does:* three words, one for each of the first three bytes of that SHA-256, from a list of 256 everyday words (24 bits). They are shown on the new phone, on the helper's phone before the button that passes the share on, and on any other phone of the owner's next to the button that cancels. The temporary private key stays in the new phone's secure storage until the recovery ends; in the browser preview it is held in memory only, so closing the page means starting again. After getting back in, the app offers a new Vault key at once and splits it for the helpers.

### 6. A door code on a guest pass

A guest has no account and no key.

| Message | Who | Sends | The API |
|---|---|---|---|
| `POST /v1/circles/{id}/guest-passes` | An adult of the circle | As before, plus `cards [{label, ciphertext, once, thingId}]` and `keyForMaker` | Stores up to ten sealed cards. `label` is in the clear ("Front door code"). `keyForMaker` is the pass key sealed for the maker's own Vault (`pass-key`), so their other phone can build the whole link; it is shown only to the maker. |
| `POST /v1/guest-passes/{id}/cards` | An adult of the circle | `clientId`, `label`, `ciphertext`, `once`, `thingId` | Adds a card later. |
| `DELETE /v1/guest-passes/{id}/cards/{cardId}` | An adult of the circle | | Takes one off. |
| `GET /g/{token}`, `POST /g/{token}` | The guest, no sign-in | The four-digit code | The page. Once the code was right on this phone, it carries each card's label and ciphertext. |
| `POST /g/{token}/cards/{id}/shown` | The page's script | | Notes that the card was shown. A show-once card **loses its ciphertext here**: the API has nothing left to hand out. Only the phone the pass is open on can say so. |

- The API's address for a pass ends before the `#`. The phone adds `#` and the key and gives the person the whole link to send.
- *What the app does:* every pass made by someone with a Vault gets a key of its own at the moment it is made, sent as `keyForMaker`. A card is added from the pass's page: the phone opens the Vault item, seals what a guest should read with the pass's key, and sends the card. The link with the key is only shown while the maker's Vault is unlocked.
- The page runs one script, `/share/guest.js`. It reads the key from the address, shows a card only after a tap, hides it again after 30 seconds, and for a show-once card tells the API first and shows it only when the API has answered. Without the part after `#`, or with a wrong one, it says the link is incomplete.
- The page's `Content-Security-Policy` allows that script and the API's own style sheets, and nothing else: no script written into the page, nothing loaded from or sent to another address.
- A Vault item put on a pass as a thing shows its title and "Kept in the Vault. Not shown on a pass." Only a sealed card carries a secret to a guest.
- The first screen can't match its drawing in one respect ([build plan](06-build-plan.md)): a web page can't join a Wi‑Fi network for someone. The guest is shown the password.

## The state machines

### A grant

Where one person stands with one item they may see. Worked out from the stored row; nothing moves it but the events named.

| State | Means | How it gets there | Is the item handed out? |
|---|---|---|---|
| `waiting` | They should have a key, and the owner's phone hasn't made one | Shared with them without a key; joined later; the item got a new key | No (`no_key_yet`) |
| `ready` | The API holds their wrapped key | The owner's phone sent it | **Yes** |
| `used` | It was for one look, and that look has happened | Being handed a `once` grant | No (`opened_once`) |
| `stopped` | It was shared until a moment that has passed | The clock | No (`stopped_working`) |

Out of `used` and `stopped` there is one way: the owner shares it with them again, with a new wrapped key.

### Emergency access

`EmergencyState` in the code, with every step and every refusal tested (`VaultRulesTest`, `VaultEmergencyTest`).

| State | Owner turns on or changes | Owner switches off | Owner says no | Trusted asks | Trusted reads | The wait is over |
|---|---|---|---|---|---|---|
| **off** | → ready | stays off | refused: nobody asked | refused: not there | refused: not there | nothing |
| **ready** | → ready | → off | refused: nobody asked | → **asked** (owner told; clock starts) | refused: ask first | nothing |
| **asked** | → ready (request ends) | → off | → ready (trusted told) | stays asked; **the clock doesn't start again** | refused: not yet | → **open** (both told) |
| **open** | → ready (nothing more is handed) | → off | refused: already open | stays open | **handed** | nothing |

- A no ends that request, not the arrangement: the trusted person can ask again another day, and the wait starts afresh.
- Anything the owner does ends a running request. Whoever is at their phone doesn't need emergency access.
- The clock opens a request whether or not anyone is looking: a job checks every half minute, and every read checks first.

### A helper

| State | Owner asks | Helper says yes | Helper says no |
|---|---|---|---|
| **asked** | stays asked | → accepted | → declined |
| **accepted** | stays accepted | stays accepted | → declined (their share is thrown away) |
| **declined** | → asked | refused: ask again first | stays declined |

Only an accepted helper can be given a share.

### A recovery

| State | A helper passes a share on | Owner finishes | Owner cancels | Seven days pass |
|---|---|---|---|---|
| **open** | accepted | → done | → cancelled | → lapsed |
| **done**, **cancelled**, **lapsed** | refused | refused (finishing what is done, and cancelling what is cancelled, change nothing) | refused | nothing |

Only an open recovery lets a helper's share out. Ending it, in any way, deletes the shares that were passed on.

## What the API enforces, and what the mathematics does

| The promise | Kept by |
|---|---|
| Nobody without the item key reads an item | **Mathematics** |
| The service can't read an item, a note, a share or a door code | **Mathematics** (it never holds a key that opens them) |
| A wrapped key opens only for the person it was wrapped for | **Mathematics** |
| One helper alone learns nothing about the Vault key | **Mathematics** |
| A changed ciphertext is noticed | **Mathematics** |
| Without the Vault key or two helpers there is no way back in | **Mathematics**. There is no reset, and nobody can make one. |
| Who knows an item exists | **The API** (the one sharing rule) |
| Who is handed a ciphertext | **The API** (the rule and a ready grant) |
| "Once", "stops on Sunday" | **The API** stops handing it out, and erases the key. What was handed out before is out. |
| "Can use, can't see" | **The app** |
| The wait before emergency access | **The API** |
| A share leaves only during a recovery its owner started | **The API** |
| Only the owner shares; only "can change" changes | **The API** |
| A guest sees a show-once card once | **The API** forgets it; the page hides it |
| The Vault locks after two minutes, Face ID | **The phone** |

## When someone leaves a circle

When a person leaves a circle, is removed from it or deletes their account:

- **Every grant they held in that circle is deleted at that moment** (in the database itself, whoever marks them as gone), and what was shared with them by name stops being shared. They are handed nothing from then on.
- If they come back, they see what "everyone" sees again, but hold no key until an owner's phone makes one.
- Their own items in that circle stay where they are when they leave: what they shared, the others can still open; what was theirs alone, nobody can. (What should become of them is decided with the "leaving" screen, in a later milestone.) When they delete their account, their items are deleted, and with them every grant and escrow entry that pointed at them.
- A trusted person or a helper who is no longer in any circle with you can't ask, read or help.

**What they already opened, they may have copied.** No system can take a password back out of someone's head or their screenshots. The honest answer after someone leaves is the one the app should offer on each item they had: **"Change this password"**, at the site itself, and then save the new one. The app should also give the item a new key (`rotation`) so the key they may have kept opens nothing that is stored from now on.

## The sample data

Local mode starts with the people of the screens. A seed can't scramble the way a phone does: the sample people have no keys. So the Vault's sample items (about a dozen across the six drawers of The Linds: Netflix from Alex, the front door code for everyone, the passports, the Wi‑Fi) hold a fixed marker in place of a ciphertext, `sample-item-not-scrambled`, and **nobody holds a grant**. Their titles, drawers, sites and expiry dates are real, so lists, counts, search and a person's page look like the drawings.

The API marks such an item (`sample: true`), refuses to open, change or share it (`sample_item`), and refuses the marker from a phone. The app shows it as "sample item: add your own to see the real thing". The sample people have no Vault either: signed in as one of them, the app sets one up like for anyone new.

## Limits

| What | Limit |
|---|---|
| An item's ciphertext | 64 KB (87,382 characters) |
| A wrapped key, a wrapped private key, a share | 512 characters |
| A public key | Exactly 32 bytes (43 characters) |
| A note for the family | About 16 KB (22,000 characters) |
| A sealed card on a guest pass | 4,096 characters; 10 cards a pass |
| Items a person owns | 2,000 |
| People one item is shared with | 50 |
| Items in an escrow | 200 |
| Helpers | 5; any 2 rebuild the key |
| The wait before emergency access | 24 to 168 hours |
| A recovery | Open for 7 days |
| A request to the Vault | 128 KB (other requests: 64 KB) |

## How this was checked

- `VaultProtocolTest` plays every flow above against the API with real keys: a Vault opened on a new phone, an item shared and opened by a second person, a removed grant, once, stops-at, a late joiner, emergency access, a recovery with three helpers of whom two help, a guest pass. After each test it reads back **every request that was sent and every row the API stored** and fails if any holds a password, a note, an item key, a private key, a share or a Vault key, in any spelling.
- Its stand-in for the phone uses what Java has: X25519, HKDF-SHA-256, AES-GCM and Shamir's sharing are the real thing. Two are stand-ins: ChaCha20-Poly1305 with a 12-byte nonce in place of XChaCha20, and PBKDF2 in place of scrypt. The API never looks inside, so this proves the protocol can be built, **not** that the app's cryptography is right. That needs the app's own tests against published test vectors, and the review.
- **The app's cryptography** has tests of its own next to it (`apps/mobile/src/features/vault/crypto/__tests__/`): each algorithm against its published test vectors (listed under "The building blocks"), and each of this document's layouts against a second implementation written from this document on Node's OpenSSL (`src/test/vaultReference.ts`), in both directions: what one seals, the other opens. Shamir's sharing is checked for every pair of shares, for all 255 helper numbers, and for the property that one share fits every possible secret equally well.
- **Both sides together** are walked in a browser as several people on several phones (`scripts/e2e/steps/06-vault.js`): setting up, sharing three ways, taking it back, one look, locking, a new phone with the typed Vault key, emergency access with the clock moved in the database, helpers and a recovery, a new Vault key, and a guest pass whose page opens a code the app sealed. Along the way the walk reads the database and fails if any row holds the password, the one-time code secret, the note, a Vault key or a passcode, in any common spelling.
- The guest page's script is also run in the app's tests on what the app's `sealForGuest` makes.
- The guest page's script was run in a real browser (Chromium) against the API: the key stays in the address through the code form, a card opens after a tap and hides after 30 seconds, a show-once card is gone after loading again, a missing or wrong key says "incomplete", the key reaches the server in no request, and the page's security policy blocks nothing it needs.

## Not built yet

- **Filling a password in inside other apps** is phone work that comes after the first version. Copying, and opening a site, come first.
- **Checking for leaks** needs an outside service that isn't connected. The word `leaked` exists; nothing sets it yet.
- **Face ID** is written and tested against a stand-in for the phone's secure storage, and has **never run on a phone**. The two-minute lock, the passcode way and everything else ran in the browser preview.
- **How long scrypt takes on a phone** is not known. With the document's numbers it takes about a quarter of a second in a desktop browser and under the tests; a phone's JavaScript engine without a compiler will be several times slower. See the questions.
- **"Save as PDF" on a phone** needs a part of the phone build that isn't in the app; in the browser it is the print dialog.
- **Taking one card off a guest pass** has a route and no button yet.
- **Children** are profiles without a sign-in in this build, so nothing can be sealed for them. "Mia can use Netflix" needs a child who has a device of her own.
- **Sharing with someone outside the circle** (the sitter, a friend) is a guest pass with a sealed card. A grant always goes to a member of the item's circle.
- **Starting over.** Someone who lost their Vault key and has no helpers can't set up a new Vault today; a second key pair is refused. See the questions.

## Open questions for the review

1. **Are public keys trustworthy enough?** A phone takes a person's public key from the API. Should people be able to compare a short fingerprint, should keys be signed by a key the circle already trusts, or is a log of key changes enough? Until one exists, a service that lies could read what is shared after it starts lying.
2. **Handing keys to people who wait.** The owner's phone wraps an item key for whoever the API says is waiting, without asking. Should it ask the owner first? Should an item's sealed part carry the list of people its owner agreed to, so a phone refuses anyone else?
3. **Is "can use" worth offering,** given that it is a courtesy? Is the wording honest enough?
4. **The emergency wait is the API's promise.** Is 24 hours a safe minimum? Should the owner get an email as well as a push? Should the trusted person have to be confirmed by a second person?
5. **Should a recovery wait too,** a day perhaps, before any share leaves, so the owner has time to cancel one they didn't start? Today the only brakes are the notice on every phone and the helpers' own check.
6. **Check words for a recovery** are the app's to show. Is the first part of a SHA-256 of the temporary key the right thing to compare, and how many words?
7. **Two helpers and the service together** can rebuild a Vault key. Is two of up to five the right threshold? Should the owner choose it?
8. **Replacing the Vault key needs no proof** that the caller holds the private key. Someone with the sign-in alone could replace the wrapped private key with rubbish: they read nothing, but the owner could no longer get in on a new phone. Should that request be signed with a key only the Vault holds? The same question for switching emergency access off and removing helpers.
9. **Does the phone keep the Vault key?** It needs it to split the key again when a helper is added. Keeping it (in secure storage, behind Face ID) is convenient; not keeping it means typing 24 characters each time. *The app as built does not keep it, and asks for it to be typed when the key is split.*
10. **Scrypt's numbers.** N = 32768, r = 8, p = 1 on phones of the last five years. With 120 random bits in the Vault key, is that the right trade?
11. **Nothing is signed and old versions can be replayed.** Does an item need a version inside its sealed part, or a signature of whoever saved it?
12. **A new item key whenever someone is removed** is recommended to the app, not demanded by the API. Should the API refuse a removal that comes without one?
13. **Titles in the clear.** Should a person be able to mark one item's title as private, at the price of it not being found by search?
14. **The guest page** is code the service sends. Is a sealed card on a web page the right tool for a door code, or should guests who need codes be asked to install the app?
15. **The link to a guest pass carries the key.** Whoever sees the message sees the key. They still need the four-digit code, and the pass works on the first phone only. Is that enough?
16. **Pushes name people** ("Alex asked to open your Vault") and show on a lock screen. Should they say less?
17. **Backups.** How long are database backups kept, given that erased keys live on in them?
18. **Starting over** after losing everything: should there be a way to delete a Vault and set up a new one, and what should it take?
19. **Which library** the app uses for these algorithms: the `@noble` family, at the versions under "The building blocks". Are these the right ones, and is pinning exact versions with the lockfile's hashes enough against a bad release? Of what the app uses, the library's own notes say SHA-1 (used here only for one-time codes) was outside its 2022 audit.

Added while building the app:

20. **Keys in JavaScript memory.** The private key and item keys are bytes the app overwrites when it lets go of them, but the engine may have made copies, and a typed Vault key, a passcode and an opened password are strings, which can't be overwritten at all. Is that acceptable for a first version, or does secret entry and key handling belong in native code?
21. **scrypt in JavaScript on a phone.** N = 32768 has not been timed on a phone. If it takes several seconds there, should N go down (the Vault key has 120 random bits; a passcode has far fewer), or should the phone build bring a native scrypt? The same numbers are used for both today.
22. **The passcode way.** A passcode of 8 or more characters, stretched with scrypt, is all that stands between the wrapped key and whoever can read the storage it is in: on a phone that is the secure storage, in the browser preview it is the page's own storage. Nothing can limit guesses made away from the phone. Is 8 characters the right floor? Should the browser preview be barred from real Vaults altogether?
23. **A page in a browser** runs whatever script reaches it. The preview shares that weakness with the guest page (question 14), for a whole Vault instead of one door code. Should a production web build exist for the Vault at all?
24. **Opening an item opens all of it.** The app asks for the scrambled piece as soon as an item's page is shown, to draw the user name and the one-time code, and the API notes an opening each time. Should the secret fields be sealed apart and opened only on "show" or "copy"?
25. **One-time code secrets live next to the password** they are the second factor for. Convenient, and it means the Vault alone is both factors. Should the app say so where the secret is typed?
26. **What the `health` word tells the service.** `weak` and `reused` are in the clear by design (the nudge on the Vault's home needs them). `reused` on two items says they share a password. Acceptable?
27. **The clear labels are checked only when an item is opened.** A list shows the title the API sent. Should lists be checked too, at the price of opening everything?
28. **The clipboard.** Clearing after 60 seconds is the system's promise on an iPhone and best effort elsewhere; a clipboard manager or a keyboard that keeps a history has it for good. Should copying be offered at all for "can use" items, where the app otherwise never shows the value?
29. **The Vault key as a QR code and a printed page.** A screenshot, a print queue, a PDF in a synced folder: each is a copy the app can't follow. Should the screen warn about each, or is "save or print" enough?
30. **What the phone shows when it is put away.** The Vault locks when the app goes to the background, but the picture the phone keeps for its app switcher may be taken before that. Should Vault screens be blanked the moment the app stops being in front?
31. **Check words are 24 bits** from a list of 256 words. They tie a phone call to one recovery; they are not meant to stop someone who can try many temporary keys. Enough?
32. **A pass's key is made for every pass** by someone with a Vault, sealed for them, whether or not a code is ever added. Is a sealed key the API holds for no reason a cost?
