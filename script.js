/* ============================================
   Nusayb Nurani — v3
   Nav · Covers · Shelf Scroll
   ============================================ */

(function () {
    'use strict';

    // ─── NAV TOGGLE ──────────────────────────
    const tog = document.querySelector('.nav-toggle');
    const links = document.querySelector('.nav-links');
    if (tog && links) {
        tog.addEventListener('click', () => {
            tog.classList.toggle('open');
            links.classList.toggle('open');
        });
        links.querySelectorAll('.nav-link').forEach(a =>
            a.addEventListener('click', () => {
                tog.classList.remove('open');
                links.classList.remove('open');
            })
        );
    }

    // ─── COVER LOADING ──────────────────────
    // Strategy per book:
    //   1. Google Books API (search by ISBN → get thumbnail → upscale zoom param)
    //   2. Open Library -L (try each ISBN in data-isbns)
    //   3. Open Library title search
    //   4. Styled fallback
    //
    // Google Books gives significantly higher-res covers for popular books.

    const covers = document.querySelectorAll('.book-cover[data-isbns]');
    if (!covers.length) return;

    const OL = 'https://covers.openlibrary.org/b';

    covers.forEach(wrap => {
        const isbns = (wrap.dataset.isbns || '').split(',').map(s => s.trim()).filter(Boolean);
        const title = wrap.dataset.title || 'Unknown';
        const img = wrap.querySelector('img');
        if (!img) return;

        let olIdx = 0; // tracks which Open Library ISBN to try

        // Final fallback: styled title card
        function showFallback() {
            img.style.display = 'none';
            const fb = document.createElement('div');
            fb.className = 'fallback';
            fb.innerHTML = `<div class="fallback-title">${title}</div>`;
            wrap.appendChild(fb);
        }

        // Phase 2: Open Library cascade
        function tryOL() {
            if (olIdx < isbns.length) {
                img.src = `${OL}/isbn/${isbns[olIdx++]}-L.jpg`;
            } else {
                // Try by title
                const slug = title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '+');
                img.src = `${OL}/title/${slug}-L.jpg`;
                img.onerror = showFallback;
            }
        }

        // When in OL phase, handle errors and 1x1 blanks
        function olHandler() {
            img.onerror = tryOL;
            img.onload = function () {
                if (img.naturalWidth <= 1 || img.naturalHeight <= 1) {
                    tryOL();
                } else {
                    img.classList.add('loaded');
                }
            };
            tryOL();
        }

        // Phase 1: Google Books API
        const primaryISBN = isbns[0];
        if (primaryISBN) {
            fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${primaryISBN}&maxResults=1`)
                .then(r => r.json())
                .then(data => {
                    if (data.totalItems > 0 && data.items[0].volumeInfo.imageLinks) {
                        const link = data.items[0].volumeInfo.imageLinks;
                        // Get highest quality: replace zoom=1 with zoom=0 for full size
                        let url = link.extraLarge || link.large || link.medium || link.thumbnail || link.smallThumbnail || '';
                        url = url.replace(/&edge=curl/g, '').replace(/zoom=\d/, 'zoom=0').replace(/^http:/, 'https:');
                        if (url) {
                            img.onload = function () { img.classList.add('loaded'); };
                            img.onerror = olHandler; // if Google img fails, cascade to OL
                            img.src = url;
                            return;
                        }
                    }
                    olHandler();
                })
                .catch(() => olHandler());
        } else {
            olHandler();
        }
    });


    // ─── CURSOR-TRACKING SHELF SCROLL ────────
    document.querySelectorAll('.track-wrap').forEach(wrap => {
        const track = wrap.querySelector('.track');
        const inner = wrap.querySelector('.track-inner');
        const bar   = wrap.querySelector('.prog-bar');
        if (!track || !inner) return;

        let cur = 0, target = 0, raf = null, touch = false;

        const max = () => Math.max(0, inner.scrollWidth - track.clientWidth);

        function ui() {
            const m = max();
            const p = m > 0 ? (-cur / m) : 0;
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
            if (touch) return;
            const m = max(); if (m <= 0) return;
            const r = track.getBoundingClientRect();
            const p = (e.clientX - r.left) / r.width;
            const ease = p < 0.06 ? 0 : p > 0.94 ? 1 : (p - 0.06) / 0.88;
            target = -ease * m;
            go();
        });

        let tx = 0, ts = 0;
        track.addEventListener('touchstart', e => { touch = true; tx = e.touches[0].clientX; ts = cur; }, { passive: true });
        track.addEventListener('touchmove', e => {
            const dx = e.touches[0].clientX - tx;
            target = Math.max(-max(), Math.min(0, ts + dx));
            cur = target; inner.style.transform = `translateX(${cur}px)`; ui();
        }, { passive: true });
        track.addEventListener('touchend', () => { touch = false; });

        window.addEventListener('resize', () => {
            const m = max();
            if (-cur > m) { cur = -m; target = -m; }
            inner.style.transform = `translateX(${cur}px)`; ui();
        });

        ui();
    });

})();
