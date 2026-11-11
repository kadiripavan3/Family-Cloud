(function () {
  'use strict';
  var app = document.querySelector('.app');

  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }
  // Scroll a horizontal strip so the given item sits in its middle.
  function center(strip, item) {
    if (strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollLeft += item.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - item.offsetWidth) / 2;
  }

  /* ---------- screen theme (Auto follows the viewer's own setting) ---------- */
  function setScreens(v) {
    if (['auto', 'light', 'dark'].indexOf(v) < 0) v = 'auto';
    app.dataset.screens = v;
    each('[data-set-screens]', function (b) { b.setAttribute('aria-pressed', String(b.dataset.setScreens === v)); });
    save('family-cloud-hub-screens', v);
  }
  each('[data-set-screens]', function (b) { b.addEventListener('click', function () { setScreens(b.dataset.setScreens); }); });
  setScreens(load('family-cloud-hub-screens') || 'auto');

  /* ---------- the name: every candidate can be tried on every screen ---------- */
  // The build sets data-name to the chosen name (or my pick while none is chosen).
  // The saved preference is keyed by that value, so choosing a name resets everyone's view to it.
  var names = {}, baseName = app.dataset.name, nameKey = 'family-cloud-hub-name:' + baseName;
  each('[data-set-name]', function (b) { names[b.dataset.setName] = true; });
  function setName(v) {
    if (!names[v]) v = baseName;
    app.dataset.name = v;
    each('[data-set-name]', function (b) { b.setAttribute('aria-pressed', String(b.dataset.setName === v)); });
    save(nameKey, v);
  }
  each('[data-set-name]', function (b) { b.addEventListener('click', function () { setName(b.dataset.setName); }); });
  setName(load(nameKey) || baseName);

  /* ---------- phone sizes: 4 or 2 columns on wide screens, a swipeable row on phones ---------- */
  // Every group's gallery has the same width, so one measurement sizes all of them.
  function fit() {
    var gallery = document.querySelector('#view-screens .gallery'), w = gallery ? gallery.clientWidth : 0, z, cols;
    if (!w) return;
    if (w <= 720) { cols = 1; z = Math.min(0.9, (w - 24) / 410); }
    else { cols = w >= 1180 ? 4 : 2; z = Math.min(0.8, ((w - (cols - 1) * 28) / cols) / 410); }
    app.style.setProperty('--z', z.toFixed(3));
    app.style.setProperty('--cols', String(cols));
  }

  /* ---------- views: #overview, #screens ... or the id of anything inside a view ---------- */
  var views = {}, current = null, nav = document.querySelector('.nav');
  each('.view', function (s) { views[s.dataset.view] = s; });
  function route() {
    var h = (location.hash || '').slice(1), name = h, target = null;
    try { h = decodeURIComponent(h); } catch (e) { }
    if (!views[h]) {
      var el = h ? document.getElementById(h) : null, v = el && el.closest('.view');
      if (v) { name = v.dataset.view; target = el; } else name = 'overview';
    } else name = h;
    var changed = name !== current;
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
    each('.nav a', function (a) {
      if (a.getAttribute('href') === '#' + name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    current = name;
    if (name === 'screens') fit();
    if (target) target.scrollIntoView();
    else if (changed) window.scrollTo(0, 0);
    var on = nav && nav.querySelector('[aria-current]');
    if (on) center(nav, on);
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', function () { if (current === 'screens') fit(); });
  route();

  /* ---------- Screens page: highlight the group being read in the sticky group bar ---------- */
  var sgNav = document.querySelector('.sg-nav'), sgLinks = {}, seen = {};
  each('.sg-nav a', function (a) { sgLinks[a.getAttribute('href').slice(1)] = a; });
  if (sgNav && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { seen[e.target.id] = e.isIntersecting; });
      var first = null;
      each('.sg', function (s) { if (!first && seen[s.id]) first = s.id; });
      Object.keys(sgLinks).forEach(function (k) {
        if (k === first) sgLinks[k].setAttribute('aria-current', 'true'); else sgLinks[k].removeAttribute('aria-current');
      });
      var on = first && sgLinks[first];
      if (on) center(sgNav, on);
    }, { rootMargin: '-130px 0px -55% 0px' });
    each('.sg', function (s) { io.observe(s); });
  }

  /* ---------- comment buttons: open claude.ai's own comment box on a screen or page ---------- */
  // Shown only where this view can comment (the owner, and people the hub is shared with to comment).
  var cbtns = document.querySelectorAll('[data-comment-for]');
  function hideComments() { Array.prototype.forEach.call(cbtns, function (b) { b.hidden = true; }); }
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('comments').then(function (c) {
      if (!c || typeof c.openComposer !== 'function') return;
      Array.prototype.forEach.call(cbtns, function (b) {
        b.hidden = false;
        b.addEventListener('click', function () {
          var t = document.getElementById(b.dataset.commentFor);
          if (!t) return;
          // A whole page is anchored at its title, so the comment pin sits where the page starts.
          if (t.classList.contains('view')) t = t.querySelector('h1') || t;
          c.openComposer({ element: t }).catch(function (e) {
            var code = e && e.code;
            if (['unavailable', 'forbidden', 'not_granted', 'capability_disabled', 'capability_removed'].indexOf(code) >= 0) hideComments();
          });
        });
      });
    }, function () { });
  }
})();
