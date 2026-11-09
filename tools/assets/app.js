(function () {
  var root = document.documentElement;
  var base = root.getAttribute('data-base');
  var noResults = root.getAttribute('data-none');
  var body = document.body;
  var byId = function (id) { return document.getElementById(id); };
  var norm = function (s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  var EASE = 'cubic-bezier(.2,.8,.2,1)';
  var reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  var moving = function () { return !reducedMotion.matches; };
  var store = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* private window */ } },
  };

  // Theme: applied before first paint by the inline head script.
  var themeBtn = byId('theme');
  function setTheme(next) {
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) { /* private window */ }
  }
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      if (!document.startViewTransition || !moving()) { setTheme(next); return; }
      var r = themeBtn.getBoundingClientRect();
      var x = r.left + r.width / 2, y = r.top + r.height / 2;
      var radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      // Named parts would be excluded from the circle, so they are unnamed for this transition.
      root.classList.add('theme-vt');
      var vt = document.startViewTransition(function () { setTheme(next); });
      vt.ready.then(function () {
        root.animate({ clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + radius + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: 280, easing: EASE, pseudoElement: '::view-transition-new(root)' });
      }).catch(function () {});
      vt.finished.finally(function () { root.classList.remove('theme-vt'); });
    });
  }

  // A single element that slides to the current item. The rect can be carried across pages.
  function makeSlider(box, find, key, bar) {
    var ind = document.createElement('span');
    ind.className = 'slide-ind';
    ind.setAttribute('aria-hidden', 'true');
    box.insertBefore(ind, box.firstChild);
    box.classList.add('has-slider');
    function draw(rect, animate) {
      ind.style.transition = animate ? '' : 'none';
      ind.style.transform = 'translate(' + (bar ? 0 : rect.x) + 'px,' + rect.y + 'px)';
      if (!bar) ind.style.width = rect.w + 'px';
      ind.style.height = rect.h + 'px';
    }
    function current() {
      var el = find();
      if (!el || !el.offsetHeight) return null;
      var clip = el.closest('.collapse-clip');
      if (clip && getComputedStyle(clip).visibility === 'hidden') return null;
      return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
    }
    function update(animate) {
      var rect = current();
      ind.style.opacity = rect ? 1 : 0;
      if (rect) draw(rect, animate && moving());
    }
    var saved = key && store.get(key);
    if (saved && moving() && find()) {
      draw(JSON.parse(saved), false);
      ind.style.opacity = 1;
      void ind.offsetWidth;
      update(true);
    } else {
      update(false);
    }
    if (key) {
      addEventListener('pagehide', function () {
        var rect = current();
        store.set(key, rect ? JSON.stringify(rect) : '');
      });
    }
    return update;
  }

  // Language menu.
  var langBtn = byId('langBtn'), langMenu = byId('langMenu');
  function closeLang() { if (langMenu) { langMenu.hidden = true; langBtn.setAttribute('aria-expanded', 'false'); } }
  if (langBtn) {
    langBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var open = langMenu.hidden;
      langMenu.hidden = !open;
      langBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', closeLang);
  }

  // Tree drawer on small screens.
  var treeBtn = byId('treeBtn');
  function setTree(open) {
    body.classList.toggle('tree-open', open);
    if (treeBtn) treeBtn.setAttribute('aria-expanded', String(open));
  }
  if (treeBtn) treeBtn.addEventListener('click', function () { setTree(!body.classList.contains('tree-open')); });
  var scrim = byId('scrim');
  if (scrim) scrim.addEventListener('click', function () { setTree(false); });

  // Tree position survives navigation, and the marker follows the current item.
  var tree = byId('tree'), updateTreeMark = null;
  if (tree) {
    var savedScroll = store.get('tree:scroll');
    if (savedScroll) tree.scrollTop = Number(savedScroll);
    addEventListener('pagehide', function () { store.set('tree:scroll', String(tree.scrollTop)); });
    updateTreeMark = makeSlider(tree, function () { return tree.querySelector('a[aria-current]'); }, 'slide:tree');
  }
  var dock = document.querySelector('.dock');
  if (dock) makeSlider(dock, function () { return dock.querySelector('a[aria-current]'); }, 'slide:dock');

  // Keeps the marker glued to its item while sections open and close above it.
  function followTree() {
    if (!updateTreeMark) return;
    var until = performance.now() + 340;
    (function step() {
      updateTreeMark(false);
      if (performance.now() < until) requestAnimationFrame(step);
    })();
  }

  // Collapsible panels: CSS animates the height from aria-expanded, so rapid toggling just reverses.
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-toggle]');
    if (!btn) return;
    var opening = btn.getAttribute('aria-expanded') !== 'true';
    // Only one section of the tree stays open at a time.
    if (opening && btn.classList.contains('tree-head')) {
      document.querySelectorAll('.tree-head[aria-expanded="true"]').forEach(function (other) { other.setAttribute('aria-expanded', 'false'); });
    }
    btn.setAttribute('aria-expanded', String(opening));
    if (btn.classList.contains('tree-head')) followTree();
  });

  // Keeps the tree in step with the category chosen on a list page.
  function markTreeCategory(cat) {
    var wanted = location.pathname + (cat ? '?cat=' + cat : '');
    var links = Array.prototype.slice.call(document.querySelectorAll('.tree a'));
    if (!links.some(function (a) { return a.getAttribute('href') === wanted; })) return;
    links.forEach(function (a) {
      if (a.getAttribute('href') === wanted) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (updateTreeMark) updateTreeMark(true);
  }

  // Search.
  var box = byId('q'), out = byId('results'), index = null, resultMark = null;
  function openSearch() {
    body.classList.add('search-open');
    box.focus();
  }
  function closeSearch() {
    body.classList.remove('search-open');
    out.hidden = true;
  }
  function highlighted(text, q) {
    var frag = document.createDocumentFragment();
    var at = norm(text).indexOf(q);
    if (at < 0 || norm(text).length !== text.length) { frag.appendChild(document.createTextNode(text)); return frag; }
    frag.appendChild(document.createTextNode(text.slice(0, at)));
    var mark = document.createElement('mark');
    mark.textContent = text.slice(at, at + q.length);
    frag.appendChild(mark);
    frag.appendChild(document.createTextNode(text.slice(at + q.length)));
    return frag;
  }
  function render(term) {
    var q = norm(term.trim());
    if (!q) { out.hidden = true; return; }
    var hits = index.filter(function (e) { return e.n.indexOf(q) !== -1; })
      .sort(function (a, b) { return a.n.indexOf(q) - b.n.indexOf(q) || a.t.length - b.t.length; })
      .slice(0, 14);
    out.textContent = '';
    out.classList.remove('has-slider');
    resultMark = null;
    if (!hits.length) {
      var p = document.createElement('p'); p.textContent = noResults; out.appendChild(p);
    }
    var groups = {};
    hits.forEach(function (e) { (groups[e.s] = groups[e.s] || []).push(e); });
    Object.keys(groups).forEach(function (name) {
      var h = document.createElement('h6'); h.textContent = name; out.appendChild(h);
      groups[name].forEach(function (e) {
        var a = document.createElement('a'); a.href = base + e.u;
        a.appendChild(highlighted(e.t, q));
        out.appendChild(a);
      });
    });
    out.hidden = false;
  }
  if (box) {
    box.addEventListener('input', function () {
      if (index) { render(box.value); return; }
      fetch(base + 'search.json').then(function (r) { return r.json(); }).then(function (d) {
        index = d.map(function (e) { e.n = norm(e.t); return e; });
        render(box.value);
      });
    });
    box.addEventListener('keydown', function (ev) {
      var links = Array.prototype.slice.call(out.querySelectorAll('a'));
      var at = links.findIndex(function (a) { return a.classList.contains('on'); });
      if (ev.key === 'Escape') { box.blur(); closeSearch(); }
      if (ev.key === 'Enter' && links.length) { location.href = (links[at] || links[0]).href; }
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (at >= 0) links[at].classList.remove('on');
        at = ev.key === 'ArrowDown' ? Math.min(at + 1, links.length - 1) : Math.max(at - 1, 0);
        if (links[at]) {
          links[at].classList.add('on');
          links[at].scrollIntoView({ block: 'nearest' });
          if (!resultMark) resultMark = makeSlider(out, function () { return out.querySelector('a.on'); });
          else resultMark(true);
        }
      }
    });
    document.addEventListener('click', function (ev) {
      if (ev.target.closest('.searchbox') || ev.target.closest('#dockSearch') || ev.target.closest('[data-open-search]')) return;
      out.hidden = true;
      body.classList.remove('search-open');
    });
    document.addEventListener('keydown', function (ev) {
      var typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
      if ((ev.key === 'k' && (ev.ctrlKey || ev.metaKey)) || (ev.key === '/' && !typing)) {
        ev.preventDefault();
        openSearch();
      }
    });
    var dockSearch = byId('dockSearch'), searchClose = byId('searchClose');
    if (dockSearch) dockSearch.addEventListener('click', openSearch);
    if (searchClose) searchClose.addEventListener('click', closeSearch);
    document.querySelectorAll('[data-open-search]').forEach(function (b) { b.addEventListener('click', openSearch); });

    // On the home page the top bar search stays hidden while the big one is in view.
    var bigSearch = document.querySelector('.homesearch');
    if (bigSearch && 'IntersectionObserver' in window) {
      body.classList.add('home-top');
      new IntersectionObserver(function (entries) {
        body.classList.toggle('home-top', entries[0].isIntersecting);
      }, { rootMargin: '-64px 0px 0px 0px' }).observe(bigSearch);
    }
  }

  // "On this page": the current section is the last heading above the reading line.
  var tocBox = document.querySelector('.toc');
  var toc = tocBox ? Array.prototype.slice.call(tocBox.querySelectorAll('a')) : [];
  var spots = toc.map(function (a) { return { a: a, el: byId(a.getAttribute('href').slice(1)) }; }).filter(function (s) { return s.el; });
  if (spots.length) {
    var updateToc = makeSlider(tocBox, function () { return tocBox.querySelector('a[aria-current]'); }, null, true);
    var topbar = document.querySelector('.topbar');
    var currentSpot = null, lockUntil = 0, syncPending = false;
    var markSpot = function (spot, animate) {
      if (spot === currentSpot) return;
      currentSpot = spot;
      toc.forEach(function (a) {
        if (a === spot.a) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
      updateToc(animate);
    };
    var spotNow = function () {
      var page = document.documentElement;
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= page.scrollHeight - 2) return spots[spots.length - 1];
      var line = (topbar ? topbar.offsetHeight : 0) + 32;
      var found = spots[0];
      spots.forEach(function (s) { if (s.el.getBoundingClientRect().top <= line) found = s; });
      return found;
    };
    var syncToc = function () {
      syncPending = false;
      if (Date.now() >= lockUntil) markSpot(spotNow(), true);
    };
    var askSync = function () {
      if (syncPending) return;
      syncPending = true;
      setTimeout(syncToc, 50);
    };
    window.addEventListener('scroll', askSync, { passive: true });
    window.addEventListener('resize', askSync);
    // A clicked link stays marked even when its section is too short to reach the reading line.
    spots.forEach(function (s) {
      s.a.addEventListener('click', function () {
        lockUntil = Date.now() + 800;
        markSpot(s, true);
      });
    });
    markSpot(spotNow(), false);
  }

  // Rows slide to their new place (only those near the screen); new ones fade in.
  function flip(rows, change) {
    if (!moving()) { change(); return; }
    var limit = innerHeight + 200, first = new Map();
    rows.forEach(function (r) {
      if (r.hidden) return;
      var b = r.getBoundingClientRect();
      if (b.bottom > -200 && b.top < limit) first.set(r, b.top);
    });
    change();
    var moved = 0;
    rows.forEach(function (r) {
      if (r.hidden || moved >= 40) return;
      var b = r.getBoundingClientRect();
      if (b.bottom < -200 || b.top > limit) return;
      moved++;
      if (first.has(r)) {
        var dy = first.get(r) - b.top;
        if (dy) r.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 240, easing: EASE });
      } else {
        r.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: EASE });
      }
    });
  }

  // Lists: text filter, category chips and sorting, all kept in the URL.
  document.querySelectorAll('[data-list]').forEach(function (wrap) {
    var table = wrap.querySelector('table');
    var tbody = table.tBodies[0];
    var rows = Array.prototype.slice.call(tbody.rows);
    var text = wrap.querySelector('[data-filter]');
    var chipBox = wrap.querySelector('[data-cat]');
    var pills = Array.prototype.slice.call(wrap.querySelectorAll('[data-cat] .pill'));
    var params = new URLSearchParams(location.search);
    var cat = params.get('cat') || '';
    var sort = params.get('sort') || '';
    if (text && params.get('q')) text.value = params.get('q');
    rows.forEach(function (r) { r._t = norm(r.cells[0].textContent); });

    function saveUrl() {
      var p = new URLSearchParams();
      if (cat) p.set('cat', cat);
      if (sort) p.set('sort', sort);
      if (text && text.value.trim()) p.set('q', text.value.trim());
      var qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    }
    function apply() {
      var q = text ? norm(text.value.trim()) : '';
      rows.forEach(function (r) {
        r.hidden = !!((q && r._t.indexOf(q) === -1) || (cat && r.getAttribute('data-c') !== cat));
      });
      pills.forEach(function (p) { p.setAttribute('aria-pressed', String(p.getAttribute('data-v') === cat)); });
      markTreeCategory(cat);
    }
    function applySort() {
      var match = /^(.*)-(asc|desc)$/.exec(sort);
      if (!match) return;
      var th = table.querySelector('th[data-key="' + match[1] + '"]');
      if (!th) return;
      var dir = match[2] === 'asc' ? 1 : -1;
      var i = th.cellIndex;
      var numeric = th.getAttribute('data-sort') === 'n';
      table.querySelectorAll('th').forEach(function (h) { h.removeAttribute('aria-sort'); });
      th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending');
      rows.sort(function (a, b) {
        var x = a.cells[i].getAttribute('data-v') || a.cells[i].textContent;
        var y = b.cells[i].getAttribute('data-v') || b.cells[i].textContent;
        return dir * (numeric ? (parseFloat(x) || 0) - (parseFloat(y) || 0) : x.localeCompare(y));
      });
      rows.forEach(function (r) { tbody.appendChild(r); });
    }
    apply();
    applySort();
    var updateChips = chipBox ? makeSlider(chipBox, function () { return chipBox.querySelector('.pill[aria-pressed="true"]'); }) : null;
    if (text) text.addEventListener('input', function () { flip(rows, apply); saveUrl(); });
    pills.forEach(function (p) {
      p.addEventListener('click', function () {
        cat = p.getAttribute('data-v');
        flip(rows, apply);
        if (updateChips) updateChips(true);
        saveUrl();
      });
    });
    table.querySelectorAll('th[data-sort]').forEach(function (th, n) {
      if (!th.getAttribute('data-key')) th.setAttribute('data-key', 'c' + n);
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-key');
        sort = key + (th.getAttribute('aria-sort') === 'ascending' ? '-desc' : '-asc');
        flip(rows, applySort);
        saveUrl();
      });
    });
  });

  if (moving()) {
    // Very light parallax on the home art. It only moves up, so no gap can open at the top.
    var heroImg = document.querySelector('.hero-img');
    if (heroImg) {
      var ticking = false;
      addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          if (scrollY < 700) heroImg.style.transform = 'translate3d(0,' + (-scrollY * .06).toFixed(1) + 'px,0)';
        });
      }, { passive: true });
    }

    // Entrance cascade: only what is on screen at load, at most 12 pieces.
    var shown = 0;
    document.querySelectorAll('main tbody tr, main .ledger-row, main .card, main .shortcuts a, main .box, main .facts div').forEach(function (el) {
      if (shown >= 12 || el.hidden) return;
      var r = el.getBoundingClientRect();
      if (r.height && r.bottom > 0 && r.top < innerHeight) {
        el.style.setProperty('--i', shown++);
        el.classList.add('enter');
      }
    });

    // Article sections below the fold rise once as they scroll in.
    // The class is only added here, so content stays visible if this script fails.
    if ('IntersectionObserver' in window) {
      var reveal = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.remove('pre');
          reveal.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -8% 0px' });
      document.querySelectorAll('.art-body > section').forEach(function (s) {
        if (s.getBoundingClientRect().top > innerHeight) { s.classList.add('pre'); reveal.observe(s); }
      });
    }
  }
})();
