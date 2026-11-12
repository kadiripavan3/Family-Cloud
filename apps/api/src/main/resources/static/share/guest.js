/*
 * The guest pass page's one script. It opens sealed cards: a door code or a Wi‑Fi password that the phone of
 * whoever made the pass scrambled with a key the server never had.
 *
 * The key is the part of the link after the #. A browser keeps that part to itself: it is not in the request,
 * not in the server's log, not in a Referer. A card holds base64url(nonce (12 bytes) + AES-256-GCM ciphertext
 * with its tag). Nothing here needs a library: the browser's own Web Crypto opens it.
 *
 * A card is shown only after a tap and hidden again after half a minute. A show-once card is reported to the
 * server before it is shown; the server then forgets its ciphertext, so loading the page again shows nothing.
 */
(function () {
  'use strict';

  var SHOWN_FOR_MS = 30000;
  var keyText = (location.hash || '').replace(/^#/, '');

  // The code form sends to the same address; keep the key on it so it is still in the link afterwards.
  var form = document.querySelector('form[data-keep-key]');
  if (form && keyText) {
    form.setAttribute('action', form.getAttribute('action') + '#' + keyText);
  }

  // The whole link pasted in after a first try without its end: start again with the key.
  window.addEventListener('hashchange', function () {
    location.reload();
  });

  var cards = document.querySelectorAll('article.sealed[data-sealed]');
  if (!cards.length) {
    return;
  }

  function fromBase64Url(text) {
    var plain = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    var bytes = new Uint8Array(plain.length);
    for (var i = 0; i < plain.length; i++) {
      bytes[i] = plain.charCodeAt(i);
    }
    return bytes;
  }

  var key = null;
  function theKey() {
    if (!key) {
      key = crypto.subtle.importKey('raw', fromBase64Url(keyText), { name: 'AES-GCM' }, false, ['decrypt']);
    }
    return key;
  }

  function open(sealed) {
    var bytes = fromBase64Url(sealed);
    return theKey()
      .then(function (k) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, k, bytes.slice(12));
      })
      .then(function (plain) {
        return new TextDecoder().decode(plain);
      });
  }

  function say(card, words) {
    var problem = card.querySelector('.problem');
    problem.textContent = words;
    problem.hidden = false;
  }

  var INCOMPLETE =
    'This link is incomplete: the part after the # is missing or was changed, and that part is the key. ' +
    'Ask the person who sent it for the whole link again.';

  Array.prototype.forEach.call(cards, function (card) {
    var button = card.querySelector('button');
    var secret = card.querySelector('.secret');
    var once = card.getAttribute('data-once') === 'true';
    var timer = null;

    if (!keyText) {
      say(card, INCOMPLETE);
      return;
    }
    if (!window.crypto || !crypto.subtle || !window.TextDecoder) {
      say(card, "This browser can't open what is scrambled here. Try the phone's own browser, over a secure connection.");
      return;
    }
    button.hidden = false;

    function hide() {
      clearTimeout(timer);
      secret.textContent = '';
      secret.hidden = true;
      if (once) {
        card.removeAttribute('data-sealed');
        card.querySelector('.eyebrow').textContent = 'Shown once';
        var hint = card.querySelector('.meta');
        if (hint) {
          hint.hidden = true;
        }
        say(card, 'It is hidden for good now. Ask the person who sent the pass if you need it again.');
      } else {
        button.textContent = 'Show again';
        button.hidden = false;
      }
    }

    function show(text) {
      secret.textContent = text;
      secret.hidden = false;
      button.hidden = true;
      timer = setTimeout(hide, SHOWN_FOR_MS);
    }

    function tellServer() {
      return fetch(location.pathname.replace(/\/$/, '') + '/cards/' + card.getAttribute('data-card') + '/shown', {
        method: 'POST',
        credentials: 'same-origin'
      });
    }

    button.addEventListener('click', function () {
      button.disabled = true;
      card.querySelector('.problem').hidden = true;
      open(card.getAttribute('data-sealed'))
        .then(
          function (text) {
            if (!once) {
              tellServer().catch(function () {});
              show(text);
              return;
            }
            // Shown once: the server forgets it first. If it can't be told, nothing is shown and it can be tried again.
            return tellServer().then(function (answer) {
              if (!answer.ok) {
                throw new Error('not marked');
              }
              show(text);
            }).catch(function () {
              say(card, "We couldn't reach the server, so it stays hidden for now. Check your connection and tap Show again.");
            });
          },
          function () {
            say(card, INCOMPLETE);
          }
        )
        .then(function () {
          button.disabled = false;
        });
    });
  });
})();
