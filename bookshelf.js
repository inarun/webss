/**
 * Bookshelf — Cover Loader & Cursor-Tracking Scroll
 * Loaded only on interests.html
 */

(function () {
    'use strict';

    // =========================================
    // 1. ROBUST COVER LOADING
    //    Each <img data-isbns="isbn1,isbn2,...">
    //    tries ISBNs in order via Open Library,
    //    then title search, then styled fallback.
    // =========================================

    const OL_BASE = 'https://covers.openlibrary.org/b';

    function loadCover(img) {
        const isbns = (img.dataset.isbns || '').split(',').map(s => s.trim()).filter(Boolean);
        const title = img.alt || 'Unknown';
        let idx = 0;

        function tryNext() {
            if (idx < isbns.length) {
                img.src = `${OL_BASE}/isbn/${isbns[idx++]}-L.jpg`;
            } else {
                // Last resort: search by title
                const slug = title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '+');
                img.src = `${OL_BASE}/title/${slug}-L.jpg`;
                img.onerror = function () { showFallback(img, title); };
            }
        }

        img.onerror = tryNext;

        // Open Library returns a 1×1 transparent gif for missing covers
        img.onload = function () {
            if (img.naturalWidth <= 1 || img.naturalHeight <= 1) {
                tryNext();
            }
        };

        tryNext();
    }

    function showFallback(img, title) {
        const wrap = img.parentElement;
        const fb = document.createElement('div');
        fb.className = 'cover-fallback';
        fb.innerHTML = `<div class="fb-title">${title}</div>`;
        img.remove();
        wrap.appendChild(fb);
    }

    document.querySelectorAll('.book-cover-wrap img[data-isbns]').forEach(loadCover);


    // =========================================
    // 2. CURSOR-TRACKING SHELF SCROLL
    //    Hover across a shelf → books scroll.
    //    Gold progress bar tracks position.
    //    Touch drag for mobile.
    // =========================================

    document.querySelectorAll('.shelf').forEach(shelf => {
        const track = shelf.querySelector('.shelf-track');
        const row   = shelf.querySelector('.shelf-books');
        const bar   = shelf.querySelector('.shelf-progress-bar');
        if (!track || !row) return;

        let currentX = 0;
        let targetX  = 0;
        let raf      = null;
        let isTouch  = false;

        function maxScroll() {
            return Math.max(0, row.scrollWidth - track.clientWidth);
        }

        function updateUI() {
            const max = maxScroll();
            const pct = max > 0 ? (-currentX / max) : 0;

            shelf.classList.toggle('show-fade-left',  pct > 0.02);
            shelf.classList.toggle('show-fade-right', pct < 0.98 && max > 0);

            if (bar) {
                const visible = track.clientWidth / row.scrollWidth;
                bar.style.width      = Math.max(visible * 100, 10) + '%';
                bar.style.marginLeft = (pct * (1 - visible) * 100) + '%';
            }
        }

        function animate() {
            const diff = targetX - currentX;
            if (Math.abs(diff) < 0.5) {
                currentX = targetX;
                raf = null;
            } else {
                currentX += diff * 0.12;
                raf = requestAnimationFrame(animate);
            }
            row.style.transform = `translateX(${currentX}px)`;
            updateUI();
        }

        function startAnimate() {
            if (!raf) raf = requestAnimationFrame(animate);
        }

        // Mouse: hover to scroll
        track.addEventListener('mousemove', e => {
            if (isTouch) return;
            const max = maxScroll();
            if (max <= 0) return;
            const rect = track.getBoundingClientRect();
            const pct  = (e.clientX - rect.left) / rect.width;
            // Ease the edges so books don't jump at boundaries
            const eased = pct < 0.08 ? 0 : pct > 0.92 ? 1 : (pct - 0.08) / 0.84;
            targetX = -eased * max;
            startAnimate();
        });

        // Touch: drag to scroll
        let touchStartX = 0, touchStartScroll = 0;
        track.addEventListener('touchstart', e => {
            isTouch = true;
            touchStartX = e.touches[0].clientX;
            touchStartScroll = currentX;
        }, { passive: true });

        track.addEventListener('touchmove', e => {
            const dx  = e.touches[0].clientX - touchStartX;
            const max = maxScroll();
            targetX = Math.max(-max, Math.min(0, touchStartScroll + dx));
            currentX = targetX;
            row.style.transform = `translateX(${currentX}px)`;
            updateUI();
        }, { passive: true });

        track.addEventListener('touchend', () => { isTouch = false; });

        // Resize safety
        window.addEventListener('resize', () => {
            const max = maxScroll();
            if (-currentX > max) { currentX = -max; targetX = -max; }
            row.style.transform = `translateX(${currentX}px)`;
            updateUI();
        });

        // Init
        updateUI();
    });

})();
