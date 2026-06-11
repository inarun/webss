/* ============================================
   Nusayb Nurani — v6
   Nav · Theme · Covers · Scroll · Resume Overlay
   ============================================ */

(function () {
    'use strict';

    // ─── NAV ─────────────────────────────────
    const tog = document.querySelector('.nav-toggle');
    const links = document.querySelector('.nav-links');
    if (tog && links) {
        tog.addEventListener('click', () => { tog.classList.toggle('open'); links.classList.toggle('open'); });
        links.querySelectorAll('.nav-link').forEach(a =>
            a.addEventListener('click', () => { tog.classList.remove('open'); links.classList.remove('open'); })
        );
    }

    // ─── THEME TOGGLE ────────────────────────
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
        });
    }

    // ─── NAV PROXIMITY FADE (per-link) ─────
    // Live-queries .nav-link on every tick so any link added dynamically
    // (see conditional Writing nav below) participates in the fade without
    // a re-init. Per-link state is stashed on the element itself.
    const navLinksRoot = document.querySelector('.nav-links');
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (navLinksRoot && !isTouch) {
        const threshold = 250;
        const minOpacity = 0.25;
        let rafNav = null;

        function getLinks() { return navLinksRoot.querySelectorAll('.nav-link'); }

        function initLink(link) {
            if (link._proxInit) return;
            link._proxInit = true;
            link._proxCurrent = minOpacity;
            link._proxTarget = minOpacity;
            link.style.opacity = minOpacity;
            link.style.transition = 'none';
        }

        function tickNav() {
            let done = true;
            getLinks().forEach(link => {
                initLink(link);
                const d = link._proxTarget - link._proxCurrent;
                if (Math.abs(d) < 0.005) { link._proxCurrent = link._proxTarget; }
                else { link._proxCurrent += d * 0.14; done = false; }
                link.style.opacity = link._proxCurrent;
            });
            if (!done) rafNav = requestAnimationFrame(tickNav);
            else rafNav = null;
        }
        function goNav() { if (!rafNav) rafNav = requestAnimationFrame(tickNav); }

        document.addEventListener('mousemove', e => {
            getLinks().forEach(link => {
                initLink(link);
                const rect = link.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const dist = Math.sqrt(Math.pow(e.clientX - cx, 2) + Math.pow(e.clientY - cy, 2));
                const t = Math.max(0, Math.min(1, 1 - (dist / threshold)));
                link._proxTarget = minOpacity + t * (1 - minOpacity);
            });
            goNav();
        });

        document.addEventListener('mouseleave', () => {
            getLinks().forEach(link => { initLink(link); link._proxTarget = minOpacity; });
            goNav();
        });

        // Set initial state, override CSS
        getLinks().forEach(initLink);
    }

    // ─── COVER LOADING ──────────────────────
    //
    // Strategy (ordered by reliability):
    //   1. bookcover.longitood.com — fetches from Goodreads by title+author
    //      Returns a direct Goodreads CDN image URL. Most accurate for popular books.
    //   2. Same API but by ISBN (less reliable for older ISBNs)
    //   3. Open Library by ISBN (-L size)
    //   4. Styled fallback card
    //
    // Why not Google Books? Their volume IDs are unstable across editions,
    // zoom=0 often returns a generic grey placeholder, and the search API
    // frequently returns graphic novel editions instead of the novel.

    const BCAPI = 'https://bookcover.longitood.com/bookcover';
    const OL = (isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;

    // Wrapped in a function so the bookshelf renderer (block 9) can call it
    // against a freshly-rendered subtree. Behavior identical to pre-refactor.
    function initCoverLoader(root) {
        const scope = root || document;
        const covers = scope.querySelectorAll('.book-cover[data-title]');
        if (!covers.length) return;

        // Throttle API calls to avoid rate limiting (120ms between calls)
        let queue = [];
        let processing = false;

        function enqueue(fn) {
            queue.push(fn);
            if (!processing) processQueue();
        }

        function processQueue() {
            if (!queue.length) { processing = false; return; }
            processing = true;
            const fn = queue.shift();
            fn();
            setTimeout(processQueue, 120);
        }

        covers.forEach(wrap => {
            const title = wrap.dataset.title || '';
            const author = wrap.dataset.author || '';
            const isbn = wrap.dataset.isbn || '';
            const img = wrap.querySelector('img');
            if (!img) return;
            if (img.classList.contains('loaded')) return;  // skip pre-resolved covers (cover_url in JSON)

            function showFallback() {
                img.style.display = 'none';
                if (!wrap.querySelector('.fallback')) {
                    const fb = document.createElement('div');
                    fb.className = 'fallback';
                    const fbTitle = document.createElement('div');
                    fbTitle.className = 'fallback-title';
                    fbTitle.textContent = title;
                    fb.appendChild(fbTitle);
                    wrap.appendChild(fb);
                }
            }

            // Phase 3: Open Library by ISBN
            function tryOL() {
                if (!isbn) { showFallback(); return; }
                img.onload = function () {
                    if (img.naturalWidth <= 1 || img.naturalHeight <= 1) { showFallback(); return; }
                    img.classList.add('loaded');
                };
                img.onerror = showFallback;
                img.src = OL(isbn);
            }

            // Phase 2: API by ISBN
            function tryAPIByISBN() {
                if (!isbn) { tryOL(); return; }
                fetch(`${BCAPI}/${isbn}`)
                    .then(r => r.json())
                    .then(data => {
                        if (data.url) { loadURL(data.url, tryOL); }
                        else { tryOL(); }
                    })
                    .catch(() => tryOL());
            }

            // Phase 1: API by title + author (most accurate)
            function tryAPIByTitle() {
                if (!title || !author) { tryAPIByISBN(); return; }
                const params = new URLSearchParams({ book_title: title, author_name: author });
                fetch(`${BCAPI}?${params}`)
                    .then(r => r.json())
                    .then(data => {
                        if (data.url) { loadURL(data.url, tryAPIByISBN); }
                        else { tryAPIByISBN(); }
                    })
                    .catch(() => tryAPIByISBN());
            }

            function loadURL(url, fallbackFn) {
                img.onload = function () {
                    if (img.naturalWidth <= 1 || img.naturalHeight <= 1) { fallbackFn(); return; }
                    img.classList.add('loaded');
                };
                img.onerror = fallbackFn;
                img.src = url;
            }

            enqueue(tryAPIByTitle);
        });
    }
    initCoverLoader(document);  // preserves current contract; no-op until block 9 runs


    // ─── CURSOR-TRACKING SCROLL ─────────────
    // Wrapped in a function so the bookshelf renderer (block 9) can call it
    // against a freshly-rendered subtree. Behavior identical to pre-refactor.
    function initTrackScroll(root) {
        const scope = root || document;
        scope.querySelectorAll('.track-wrap').forEach(wrap => {
            const track = wrap.querySelector('.track');
            const inner = wrap.querySelector('.track-inner');
            const bar   = wrap.querySelector('.prog-bar');
            if (!track || !inner) return;

            let cur = 0, target = 0, raf = null, isTouch = false;
            const mx = () => Math.max(0, inner.scrollWidth - track.clientWidth);

            function ui() {
                const m = mx(), p = m > 0 ? (-cur / m) : 0;
                wrap.classList.toggle('fl', p > 0.01);
                wrap.classList.toggle('fr', p < 0.99 && m > 0);
                if (bar) {
                    const v = track.clientWidth / inner.scrollWidth;
                    bar.style.width = Math.max(v * 100, 8) + '%';
                    bar.style.left  = (p * (1 - v) * 100) + '%';
                }
            }

            function tick() {
                const d = target - cur;
                if (Math.abs(d) < 0.4) { cur = target; raf = null; }
                else { cur += d * 0.1; raf = requestAnimationFrame(tick); }
                inner.style.transform = `translateX(${cur}px)`;
                ui();
            }
            function go() { if (!raf) raf = requestAnimationFrame(tick); }

            track.addEventListener('mousemove', e => {
                if (isTouch) return;
                const m = mx(); if (m <= 0) return;
                const r = track.getBoundingClientRect();
                const p = (e.clientX - r.left) / r.width;
                const ease = p < 0.06 ? 0 : p > 0.94 ? 1 : (p - 0.06) / 0.88;
                target = -ease * m; go();
            });

            let tx = 0, ts = 0;
            track.addEventListener('touchstart', e => { isTouch = true; tx = e.touches[0].clientX; ts = cur; }, { passive: true });
            track.addEventListener('touchmove', e => {
                const dx = e.touches[0].clientX - tx;
                target = Math.max(-mx(), Math.min(0, ts + dx));
                cur = target; inner.style.transform = `translateX(${cur}px)`; ui();
            }, { passive: true });
            track.addEventListener('touchend', () => { isTouch = false; });

            // Keyboard: focusing an off-screen cover makes the browser natively
            // scroll the overflow:hidden track (scrollLeft), which stacks with
            // the translateX lerp and desyncs the progress bar / fade masks.
            // Undo the native scroll and steer the lerp target instead.
            track.addEventListener('focusin', e => {
                const book = e.target.closest('.book');
                if (!book) return;
                track.scrollLeft = 0;
                const center = book.offsetLeft + book.offsetWidth / 2 - track.clientWidth / 2;
                target = Math.max(-mx(), Math.min(0, -center));
                cur = target;
                inner.style.transform = `translateX(${cur}px)`;
                ui();
            });
            track.addEventListener('scroll', () => { if (track.scrollLeft !== 0) track.scrollLeft = 0; });

            window.addEventListener('resize', () => {
                const m = mx(); if (-cur > m) { cur = -m; target = -m; }
                inner.style.transform = `translateX(${cur}px)`; ui();
            });
            ui();
        });
    }
    initTrackScroll(document);  // preserves current contract; no-op on pages without .track-wrap

    // ─── RESUME OVERLAY ──────────────────────
    const resumeLink = document.querySelector('.btn-primary[href*="Resume"]');
    const overlay = document.querySelector('.resume-overlay');
    if (resumeLink && overlay && window.innerWidth > 640) {
        const frame = overlay.querySelector('iframe');
        const closeBtn = overlay.querySelector('.resume-close');

        function openResume(e) {
            e.preventDefault();
            frame.src = resumeLink.getAttribute('href');
            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');
        }

        function closeResume() {
            overlay.classList.remove('active');
            overlay.setAttribute('aria-hidden', 'true');
            setTimeout(() => { frame.src = ''; }, 350);
        }

        resumeLink.addEventListener('click', openResume);
        if (closeBtn) closeBtn.addEventListener('click', closeResume);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeResume(); });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && overlay.classList.contains('active')) closeResume();
        });
    }

    // ─── PAGE TRANSITION ──────────────────────
    // Scale fade: current page shrinks + fades, new page grows in
    (function () {
        const main = document.querySelector('main');
        if (!main) return;

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // On arrival: if coming from a transition, animate in
        const entry = sessionStorage.getItem('pageTransition');
        if (entry) {
            sessionStorage.removeItem('pageTransition');
        }
        if (entry && !reduceMotion) {
            main.style.opacity = '0';
            main.style.transform = 'scale(1.03)';
            main.style.transition = 'none';
            main.offsetHeight;
            main.style.transition = 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
            main.style.opacity = '1';
            main.style.transform = 'scale(1)';
        }

        // Intercept nav link clicks (delegated so links added dynamically
        // — see the conditional Writing nav below — also get the transition).
        document.addEventListener('click', function (e) {
            const link = e.target.closest('.nav-links .nav-link');
            if (!link || link.classList.contains('active')) return;
            e.preventDefault();
            const href = link.getAttribute('href');

            if (reduceMotion) { window.location.href = href; return; }

            sessionStorage.setItem('pageTransition', '1');

            main.style.transition = 'opacity 0.35s ease, transform 0.35s cubic-bezier(0.4, 0, 1, 1)';
            main.style.opacity = '0';
            main.style.transform = 'scale(0.97)';

            setTimeout(() => { window.location.href = href; }, 360);
        });
    })();

    // ─── CONDITIONAL WRITING NAV ─────────────
    // The Writing link is absent from every page's static HTML until the
    // Substack feed has at least one post. This fetch queries the RSS feed
    // on page load; if items.length > 0, a Writing link is injected into
    // the current page's nav. If the feed is empty or the fetch fails, the
    // link stays absent — users and crawlers never see a "coming soon" page.
    // When the first post publishes, the link appears across all pages
    // automatically, with no code change.
    (function () {
        const navLinks = document.querySelector('.nav-links');
        if (!navLinks) return;
        if (navLinks.querySelector('a[href="writing.html"]')) return;

        const RSS_API = 'https://api.rss2json.com/v1/api.json?rss_url=' +
                        encodeURIComponent('https://nusayb.substack.com/feed');

        fetch(RSS_API)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data || !data.items || data.items.length === 0) return;

                const link = document.createElement('a');
                link.href = 'writing.html';
                link.className = 'nav-link';
                link.textContent = 'Writing';
                if (location.pathname.endsWith('writing.html')) {
                    link.classList.add('active');
                }

                // Insert before Bookshelf if present, otherwise append at end
                const bookshelf = navLinks.querySelector('a[href="interests.html"]');
                if (bookshelf) {
                    navLinks.insertBefore(link, bookshelf);
                } else {
                    navLinks.appendChild(link);
                }
            })
            .catch(() => { /* silent: no feed, no link */ });
    })();

    // ─── BOOKSHELF RENDERER ──────────────────
    // Feature-detects #bookshelf-root; fetches data/books.json; builds the
    // DOM blocks 4 and 5 expect; then calls initCoverLoader / initTrackScroll
    // scoped to the newly-rendered subtree.
    (function () {
        const root = document.getElementById('bookshelf-root');
        if (!root) return;

        fetch('data/books.json')
            .then(r => { if (!r.ok) throw new Error('fetch failed: ' + r.status); return r.json(); })
            .then(data => {
                if (!data || !Array.isArray(data.series) || !data.series.length) {
                    renderEmpty(root); return;
                }
                renderGenreChips(data.series);
                data.series.forEach(series => root.appendChild(buildSeries(series)));
                initCoverLoader(root);
                initTrackScroll(root);
            })
            .catch(err => {
                console.error('[bookshelf] failed to load', err);
                renderEmpty(root);
            });

        function renderEmpty(target) {
            const p = document.createElement('p');
            p.className = 'shelf-empty';
            p.textContent = 'Unable to load bookshelf right now.';
            target.appendChild(p);
        }

        // Header chips are derived from the union of series tags, in JSON
        // order, so they always reflect what's actually on the shelf.
        function renderGenreChips(seriesList) {
            const row = document.querySelector('.genre-tags');
            if (!row) return;
            const seen = new Set();
            seriesList.forEach(s => (s.tags || []).forEach(tag => {
                if (seen.has(tag)) return;
                seen.add(tag);
                const chip = document.createElement('span');
                chip.className = 'genre-tag';
                chip.textContent = tag;
                row.appendChild(chip);
            }));
        }

        function buildSeries(series) {
            const section = document.createElement('section');
            section.className = 'series';

            const head = document.createElement('div');
            head.className = 'series-head';

            const h2 = document.createElement('h2');
            h2.className = 'series-title';
            h2.textContent = series.name || '';
            head.appendChild(h2);

            const authorP = document.createElement('p');
            authorP.className = 'series-author';
            const n = Array.isArray(series.books) ? series.books.length : 0;
            authorP.appendChild(document.createTextNode((series.author || '') + ' · '));
            const countSpan = document.createElement('span');
            countSpan.className = 'series-count';
            countSpan.textContent = n + ' book' + (n === 1 ? '' : 's');
            authorP.appendChild(countSpan);
            head.appendChild(authorP);

            if (Array.isArray(series.tags) && series.tags.length) {
                const tagRow = document.createElement('div');
                tagRow.className = 'series-tags';
                series.tags.forEach(tag => {
                    const chip = document.createElement('span');
                    chip.className = 'genre-tag';
                    chip.textContent = tag;
                    tagRow.appendChild(chip);
                });
                head.appendChild(tagRow);
            }
            section.appendChild(head);

            const trackWrap = document.createElement('div');
            trackWrap.className = 'track-wrap';
            const track = document.createElement('div'); track.className = 'track';
            const inner = document.createElement('div'); inner.className = 'track-inner';
            (series.books || []).forEach(book => inner.appendChild(buildBook(book, series)));
            track.appendChild(inner);
            trackWrap.appendChild(track);

            const fadeL = document.createElement('div'); fadeL.className = 'fade-l';
            const fadeR = document.createElement('div'); fadeR.className = 'fade-r';
            trackWrap.appendChild(fadeL);
            trackWrap.appendChild(fadeR);

            const prog = document.createElement('div'); prog.className = 'prog';
            const progBar = document.createElement('div'); progBar.className = 'prog-bar';
            prog.appendChild(progBar);
            trackWrap.appendChild(prog);

            section.appendChild(trackWrap);
            return section;
        }

        function buildBook(book, series) {
            const bookEl = document.createElement('div');
            bookEl.className = 'book';

            const cover = document.createElement('div');
            cover.className = 'book-cover';
            cover.setAttribute('role', 'button');
            cover.setAttribute('tabindex', '0');
            cover.setAttribute('aria-label', 'Open details for ' + (book.title || ''));
            cover.dataset.title = book.title || '';
            cover.dataset.author = series.author || '';
            cover.dataset.isbn = book.isbn || '';
            cover.dataset.seriesName = series.name || '';

            const img = document.createElement('img');
            img.alt = (book.title || '') + ' by ' + (series.author || '') + ' — book cover';
            img.loading = 'lazy';
            img.decoding = 'async';
            if (book.cover_url) {
                img.src = book.cover_url;
                img.classList.add('loaded');  // Block 4 guard skips this via classList check
            }
            // No cover_url: leave src unset — the cover-loader pipeline fills it in.
            // (src='' would make some browsers request the page URL itself.)
            cover.appendChild(img);
            bookEl.appendChild(cover);

            const label = document.createElement('p');
            label.className = 'book-label';
            label.textContent = book.title || '';
            bookEl.appendChild(label);

            return bookEl;
        }
    })();

    // ─── BOOK DETAIL MODAL ──────────────────
    // Click / tap / keyboard on a .book-cover opens an overlay with a larger
    // cover, title, author, series, and an Open Library link. Pointer events
    // + 8px distance threshold distinguish tap from drag/swipe.
    (function () {
        const overlay = document.querySelector('.book-overlay');
        const shelfRoot = document.getElementById('bookshelf-root');
        if (!overlay || !shelfRoot) return;

        const closeBtn = overlay.querySelector('.book-overlay-close');
        const titleEl  = overlay.querySelector('.book-overlay-title');
        const authorEl = overlay.querySelector('.book-overlay-author');
        const seriesEl = overlay.querySelector('.book-overlay-series');
        const linkEl   = overlay.querySelector('.book-overlay-link');
        const imgEl    = overlay.querySelector('.book-overlay-cover img');

        let lastTrigger = null;
        const DRAG_THRESHOLD = 8;
        const pointerStart = new Map();

        function openDetail(cover) {
            const isbn = cover.dataset.isbn || '';
            titleEl.textContent  = cover.dataset.title || '';
            authorEl.textContent = cover.dataset.author || '';
            seriesEl.textContent = cover.dataset.seriesName || '';
            if (isbn) {
                linkEl.href = 'https://openlibrary.org/isbn/' + isbn;
                linkEl.style.display = '';
            } else {
                linkEl.removeAttribute('href');
                linkEl.style.display = 'none';
            }
            const srcImg = cover.querySelector('img');
            imgEl.src = srcImg && srcImg.src ? srcImg.src : '';
            imgEl.alt = (cover.dataset.title || '') + ' — book cover';

            lastTrigger = cover;
            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            setTimeout(() => closeBtn.focus(), 50);
        }

        function closeDetail() {
            overlay.classList.remove('active');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            setTimeout(() => { imgEl.src = ''; }, 350);
            if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus();
            lastTrigger = null;
        }

        // Delegated pointer events: record start, gate on distance threshold at pointerup
        shelfRoot.addEventListener('pointerdown', e => {
            const cover = e.target.closest('.book-cover');
            if (!cover) return;
            pointerStart.set(e.pointerId, { x: e.clientX, y: e.clientY, cover });
        });
        shelfRoot.addEventListener('pointerup', e => {
            const start = pointerStart.get(e.pointerId);
            pointerStart.delete(e.pointerId);
            if (!start) return;
            const cover = e.target.closest('.book-cover');
            if (!cover || cover !== start.cover) return;
            const dx = e.clientX - start.x, dy = e.clientY - start.y;
            if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) return;
            openDetail(cover);
        });
        shelfRoot.addEventListener('pointercancel', e => { pointerStart.delete(e.pointerId); });

        // Keyboard: Enter/Space on focused .book-cover
        shelfRoot.addEventListener('keydown', e => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const cover = e.target.closest('.book-cover');
            if (!cover) return;
            e.preventDefault();
            openDetail(cover);
        });

        // Close: ×, backdrop click, Escape, focus trap
        closeBtn.addEventListener('click', closeDetail);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeDetail(); });
        document.addEventListener('keydown', e => {
            if (!overlay.classList.contains('active')) return;
            if (e.key === 'Escape') { closeDetail(); return; }
            if (e.key === 'Tab') {
                const focusables = [closeBtn, linkEl].filter(el => el && el.offsetParent !== null);
                if (!focusables.length) { e.preventDefault(); return; }
                const first = focusables[0], last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        });
    })();

})();