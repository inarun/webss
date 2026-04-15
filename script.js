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
                img.alt = wrap.dataset.title || '';
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
                img.alt = wrap.dataset.title || '';
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
        }

        function closeResume() {
            overlay.classList.remove('active');
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

        // Intercept nav link clicks (delegated so links added dynamically
        // — see the conditional Writing nav below — also get the transition).
        document.addEventListener('click', function (e) {
            const link = e.target.closest('.nav-links .nav-link');
            if (!link || link.classList.contains('active')) return;
            e.preventDefault();
            const href = link.getAttribute('href');

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

})();