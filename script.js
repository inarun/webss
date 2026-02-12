/* ============================================
   Nusayb Nurani — v4
   Nav · Covers (static manifest) · Scroll
   ============================================ */

(function () {
    'use strict';

    // ─── NAV TOGGLE ──────────────────────────
    const tog = document.querySelector('.nav-toggle');
    const links = document.querySelector('.nav-links');
    if (tog && links) {
        tog.addEventListener('click', () => { tog.classList.toggle('open'); links.classList.toggle('open'); });
        links.querySelectorAll('.nav-link').forEach(a =>
            a.addEventListener('click', () => { tog.classList.remove('open'); links.classList.remove('open'); })
        );
    }

    // ─── COVER LOADING ──────────────────────
    //
    // ENGINEERING DECISION: APIs (Google Books search, Open Library) are unreliable
    // for cover accuracy — they return wrong editions, graphic novels, 1×1 blanks,
    // or completely wrong books. The correct solution for a personal site with a
    // fixed set of books is a STATIC MANIFEST of verified cover URLs.
    //
    // Primary source: Google Books (stable CDN, high-res via zoom=0)
    //   Format: https://books.google.com/books/content?id={VOLUME_ID}&printsec=frontcover&img=1&zoom=0
    //
    // Fallback: Open Library (by ISBN, -L size)
    //   Format: https://covers.openlibrary.org/b/isbn/{ISBN}-L.jpg
    //
    // Each book element: <div class="book-cover" data-key="wot-1"><img ...></div>
    // The key maps into the manifest below.

    const GB = (id) => `https://books.google.com/books/content?id=${id}&printsec=frontcover&img=1&zoom=0&source=gbs_api`;
    const OL = (isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;

    const COVERS = {
        // === WHEEL OF TIME (Tor ebook editions — consistent cover art) ===
        'wot-1':  [GB('1PgKPuFIz1kC'), OL('9780765334336')],  // Eye of the World
        'wot-2':  [GB('nt1dDQAAQBAJ'), OL('9780765334343')],   // The Great Hunt
        'wot-3':  [GB('bj2IDQAAQBAJ'), OL('9780765334350')],   // The Dragon Reborn
        'wot-4':  [GB('5GfzlQEACAAJ'), OL('9780765334367')],   // The Shadow Rising
        'wot-5':  [GB('PvZoDwAAQBAJ'), OL('9780765334374')],   // The Fires of Heaven
        'wot-6':  [GB('2N1JDwAAQBAJ'), OL('9780765334381')],   // Lord of Chaos
        'wot-7':  [GB('0h_NEAAAQBAJ'), OL('9780765334398')],   // A Crown of Swords
        'wot-8':  [GB('eSl4AgAAQBAJ'), OL('9780765334404')],   // The Path of Daggers
        'wot-9':  [GB('sFuJAgAAQBAJ'), OL('9780765334411')],   // Winter's Heart
        'wot-10': [GB('LCuOAgAAQBAJ'), OL('9780765334428')],   // Crossroads of Twilight
        'wot-11': [GB('1l72AgAAQBAJ'), OL('9780765334435')],   // Knife of Dreams
        'wot-12': [GB('aYwWeXYnTBMC'), OL('9780765341532')],   // The Gathering Storm
        'wot-13': [GB('8gl4BwAAQBAJ'), OL('9780765364876')],   // Towers of Midnight
        'wot-14': [GB('w5_cAgAAQBAJ'), OL('9780765325952')],   // A Memory of Light

        // === TOLKIEN ===
        'me-1':   [GB('pD6arNyKyi8C'), OL('9780547928227')],   // The Hobbit
        'me-2':   [GB('aWZzLPhY4o0C'), OL('9780547928210')],   // Fellowship of the Ring
        'me-3':   [GB('12e8PgZmcGEC'), OL('9780547928203')],   // The Two Towers
        'me-4':   [GB('3TMlDwAAQBAJ'), OL('9780547928197')],   // Return of the King

        // === SUN EATER ===
        'se-1':   [GB('dcxCDwAAQBAJ'), OL('9780756413064')],   // Empire of Silence
        'se-2':   [GB('vWGMDwAAQBAJ'), OL('9780756414092')],   // Howling Dark
        'se-3':   [GB('fUjJDwAAQBAJ'), OL('9780756415266')],   // Demon in White
        'se-4':   [GB('nAUxEAAAQBAJ'), OL('9780756416430')],   // Kingdoms of Death
        'se-5':   [GB('VHJHEAAAQBAJ'), OL('9780756417413')],   // Ashes of Man
        'se-6':   [GB('Gqr1EAAAQBAJ'), OL('9780756418328')],   // Disquiet Gods
        'se-7':   [OL('9780756419332')],                        // Shadows Upon Time (newer, may lack GB)
    };

    document.querySelectorAll('.book-cover[data-key]').forEach(wrap => {
        const key = wrap.dataset.key;
        const urls = COVERS[key];
        const img = wrap.querySelector('img');
        if (!img || !urls || !urls.length) return;

        const title = wrap.dataset.title || '';
        let i = 0;

        function tryNext() {
            if (i >= urls.length) { showFallback(); return; }
            img.src = urls[i++];
        }

        function showFallback() {
            img.style.display = 'none';
            const fb = document.createElement('div');
            fb.className = 'fallback';
            fb.innerHTML = `<div class="fallback-title">${title}</div>`;
            wrap.appendChild(fb);
        }

        img.onload = function () {
            // Detect Open Library's 1×1 blank
            if (img.naturalWidth <= 1 || img.naturalHeight <= 1) { tryNext(); return; }
            img.classList.add('loaded');
        };
        img.onerror = tryNext;
        tryNext();
    });

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

})();
