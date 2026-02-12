/* ============================================
   Nusayb Nurani — v5
   Nav · Covers (Goodreads API + OL fallback) · Scroll
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

    // ─── NAV PROXIMITY FADE (per-link) ─────
    const navLinksAll = document.querySelectorAll('.nav-link');
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (navLinksAll.length && !isTouch) {
        const threshold = 250;
        const minOpacity = 0.25;
        const current = Array.from(navLinksAll).map(() => minOpacity);
        const targets = Array.from(navLinksAll).map(() => minOpacity);
        let rafNav = null;

        function tickNav() {
            let done = true;
            navLinksAll.forEach((link, i) => {
                const d = targets[i] - current[i];
                if (Math.abs(d) < 0.005) { current[i] = targets[i]; }
                else { current[i] += d * 0.14; done = false; }
                link.style.opacity = current[i];
            });
            if (!done) rafNav = requestAnimationFrame(tickNav);
            else rafNav = null;
        }
        function goNav() { if (!rafNav) rafNav = requestAnimationFrame(tickNav); }

        document.addEventListener('mousemove', e => {
            navLinksAll.forEach((link, i) => {
                const rect = link.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const dist = Math.sqrt(Math.pow(e.clientX - cx, 2) + Math.pow(e.clientY - cy, 2));
                const t = Math.max(0, Math.min(1, 1 - (dist / threshold)));
                targets[i] = minOpacity + t * (1 - minOpacity);
            });
            goNav();
        });

        document.addEventListener('mouseleave', () => {
            navLinksAll.forEach((_, i) => { targets[i] = minOpacity; });
            goNav();
        });

        // Set initial state, override CSS
        navLinksAll.forEach(link => { link.style.opacity = minOpacity; link.style.transition = 'none'; });
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

    const covers = document.querySelectorAll('.book-cover[data-title]');
    if (covers.length) {

    // Throttle API calls to avoid rate limiting (100ms between calls)
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

        function showFallback() {
            img.style.display = 'none';
            if (!wrap.querySelector('.fallback')) {
                const fb = document.createElement('div');
                fb.className = 'fallback';
                fb.innerHTML = `<div class="fallback-title">${title}</div>`;
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
    } // end if (covers.length)


    // ─── CURSOR-TRACKING SCROLL ─────────────
    document.querySelectorAll('.track-wrap').forEach(wrap => {
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

        window.addEventListener('resize', () => {
            const m = mx(); if (-cur > m) { cur = -m; target = -m; }
            inner.style.transform = `translateX(${cur}px)`; ui();
        });
        ui();
    });

    // ─── PAGE TRANSITION ──────────────────────
    // Scale fade: current page shrinks + fades, new page grows in
    (function () {
        const main = document.querySelector('main');
        if (!main) return;

        // On arrival: if coming from a transition, animate in
        const entry = sessionStorage.getItem('pageTransition');
        if (entry) {
            sessionStorage.removeItem('pageTransition');
            main.style.opacity = '0';
            main.style.transform = 'scale(1.03)';
            main.style.transition = 'none';
            main.offsetHeight;
            main.style.transition = 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
            main.style.opacity = '1';
            main.style.transform = 'scale(1)';
        }

        // Intercept nav link clicks
        document.querySelectorAll('.nav-link:not(.active)').forEach(link => {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                const href = this.getAttribute('href');

                sessionStorage.setItem('pageTransition', '1');

                main.style.transition = 'opacity 0.35s ease, transform 0.35s cubic-bezier(0.4, 0, 1, 1)';
                main.style.opacity = '0';
                main.style.transform = 'scale(0.97)';

                setTimeout(() => { window.location.href = href; }, 360);
            });
        });
    })();

})();