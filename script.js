/* ============================================
   Nusayb Nurani — All JS consolidated
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // =========================================
    // 1. MOBILE NAV TOGGLE
    // =========================================
    const toggle = document.querySelector('.nav-toggle');
    const links  = document.querySelector('.nav-links');
    if (toggle && links) {
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('open');
            links.classList.toggle('open');
        });
        links.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                toggle.classList.remove('open');
                links.classList.remove('open');
            });
        });
    }

    // =========================================
    // 2. BOOKSHELF: COVER LOADER
    //    Only runs if bookshelf images exist.
    //    Tries multiple ISBNs via Open Library,
    //    then title search, then styled fallback.
    // =========================================
    const coverImgs = document.querySelectorAll('.book-cover-wrap img[data-isbns]');
    if (coverImgs.length) {
        const OL = 'https://covers.openlibrary.org/b';

        function loadCover(img) {
            const isbns = (img.dataset.isbns || '').split(',').map(s => s.trim()).filter(Boolean);
            const title = img.alt || 'Unknown';
            let i = 0;

            function tryNext() {
                if (i < isbns.length) {
                    img.src = `${OL}/isbn/${isbns[i++]}-L.jpg`;
                } else {
                    // Last resort: title search
                    const slug = title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '+');
                    img.src = `${OL}/title/${slug}-L.jpg`;
                    img.onerror = () => showFallback(img, title);
                }
            }

            img.onerror = tryNext;
            img.onload = function () {
                // Open Library returns 1×1 for missing covers
                if (img.naturalWidth <= 1 || img.naturalHeight <= 1) tryNext();
            };
            tryNext();
        }

        function showFallback(img, title) {
            const fb = document.createElement('div');
            fb.className = 'cover-fallback';
            fb.innerHTML = `<div class="fb-title">${title}</div>`;
            img.parentElement.appendChild(fb);
            img.remove();
        }

        coverImgs.forEach(loadCover);
    }

    // =========================================
    // 3. BOOKSHELF: CURSOR-TRACKING SCROLL
    //    Only runs if shelves exist.
    // =========================================
    const shelves = document.querySelectorAll('.shelf');
    if (shelves.length) {
        shelves.forEach(shelf => {
            const track = shelf.querySelector('.shelf-track');
            const row   = shelf.querySelector('.shelf-books');
            const bar   = shelf.querySelector('.shelf-progress-bar');
            if (!track || !row) return;

            let currentX = 0, targetX = 0, raf = null, isTouch = false;

            function maxScroll() { return Math.max(0, row.scrollWidth - track.clientWidth); }

            function updateUI() {
                const max = maxScroll();
                const pct = max > 0 ? (-currentX / max) : 0;
                shelf.classList.toggle('show-fade-left',  pct > 0.02);
                shelf.classList.toggle('show-fade-right', pct < 0.98 && max > 0);
                if (bar) {
                    const vis = track.clientWidth / row.scrollWidth;
                    bar.style.width      = Math.max(vis * 100, 10) + '%';
                    bar.style.marginLeft = (pct * (1 - vis) * 100) + '%';
                }
            }

            function animate() {
                const diff = targetX - currentX;
                if (Math.abs(diff) < 0.5) { currentX = targetX; raf = null; }
                else { currentX += diff * 0.12; raf = requestAnimationFrame(animate); }
                row.style.transform = `translateX(${currentX}px)`;
                updateUI();
            }

            function startAnim() { if (!raf) raf = requestAnimationFrame(animate); }

            // Mouse hover → scroll
            track.addEventListener('mousemove', e => {
                if (isTouch) return;
                const max = maxScroll();
                if (max <= 0) return;
                const rect = track.getBoundingClientRect();
                const pct  = (e.clientX - rect.left) / rect.width;
                const eased = pct < 0.08 ? 0 : pct > 0.92 ? 1 : (pct - 0.08) / 0.84;
                targetX = -eased * max;
                startAnim();
            });

            // Touch drag
            let tx = 0, ts = 0;
            track.addEventListener('touchstart', e => { isTouch = true; tx = e.touches[0].clientX; ts = currentX; }, { passive: true });
            track.addEventListener('touchmove', e => {
                const dx = e.touches[0].clientX - tx;
                targetX = Math.max(-maxScroll(), Math.min(0, ts + dx));
                currentX = targetX;
                row.style.transform = `translateX(${currentX}px)`;
                updateUI();
            }, { passive: true });
            track.addEventListener('touchend', () => { isTouch = false; });

            // Resize
            window.addEventListener('resize', () => {
                const max = maxScroll();
                if (-currentX > max) { currentX = -max; targetX = -max; }
                row.style.transform = `translateX(${currentX}px)`;
                updateUI();
            });

            updateUI();
        });
    }

});
