/* ============================================
   Nusayb Nurani — v6
   Nav · Theme · Bookshelf dialog · Shortcuts
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

        // Delegated so links added dynamically — see the conditional Writing
        // nav below — also get the transition. a[data-page-link] opts in any
        // internal link outside the nav (the homepage Resume button).
        document.addEventListener('click', function (e) {
            const link = e.target.closest('.nav-links .nav-link, a[data-page-link]');
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
                const bookshelf = navLinks.querySelector('a[href="bookshelf.html"]');
                if (bookshelf) {
                    navLinks.insertBefore(link, bookshelf);
                } else {
                    navLinks.appendChild(link);
                }
            })
            .catch(() => { /* silent: no feed, no link */ });
    })();

    // ─── SHELF ROWS ──────────────────────────
    // Rows are native scrollers, so touch and trackpads need nothing. A mouse
    // cannot move one on its own (scrollbars are hidden and its wheel is
    // vertical), so every row that overflows gets drag-to-scroll and a pair
    // of chevrons in the shelf header.
    (function () {
        const rows = document.querySelectorAll('.shelf-row');
        if (!rows.length) return;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const DRAG_THRESHOLD = 6;

        rows.forEach(row => {
            const shelf = row.parentElement;
            const head = shelf.querySelector('.shelf-head');
            const prev = chevron('Scroll left', '‹');
            const next = chevron('Scroll right', '›');
            if (head) {
                const nav = document.createElement('div');
                nav.className = 'shelf-nav';
                nav.append(prev, next);
                head.appendChild(nav);
            }

            function chevron(label, glyph) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'shelf-chevron';
                b.setAttribute('aria-label', label);
                b.textContent = glyph;
                return b;
            }

            function page(dir) {
                const gutter = parseFloat(getComputedStyle(row).paddingLeft) || 0;
                const step = (row.clientWidth - 2 * gutter) * 0.8;
                row.scrollBy({ left: dir * step, behavior: reduceMotion ? 'auto' : 'smooth' });
            }
            prev.addEventListener('click', () => page(-1));
            next.addEventListener('click', () => page(1));

            function update() {
                const max = row.scrollWidth - row.clientWidth;
                shelf.classList.toggle('can-scroll', max > 1);
                prev.disabled = row.scrollLeft <= 1;
                next.disabled = row.scrollLeft >= max - 1;
            }
            row.addEventListener('scroll', update, { passive: true });
            new ResizeObserver(update).observe(row);
            update();

            // Mouse drag. Touch already pans natively, so it is left alone.
            let start = null, dragged = false;
            const swallowClick = e => { e.stopPropagation(); e.preventDefault(); };

            row.addEventListener('pointerdown', e => {
                if (e.pointerType !== 'mouse' || e.button !== 0) return;
                start = { x: e.clientX, left: row.scrollLeft, id: e.pointerId };
                dragged = false;
            });
            row.addEventListener('pointermove', e => {
                if (!start || e.pointerId !== start.id) return;
                const dx = e.clientX - start.x;
                if (!dragged) {
                    if (Math.abs(dx) < DRAG_THRESHOLD) return;
                    dragged = true;
                    row.classList.add('dragging');
                    row.setPointerCapture(e.pointerId);
                }
                row.scrollLeft = start.left - dx;
            });
            function endDrag(e) {
                if (!start || e.pointerId !== start.id) return;
                start = null;
                if (!dragged) return;
                row.classList.remove('dragging');
                // The click that follows a drag's pointerup must not open the cover under it.
                // The listener is dropped on the next task in case no click arrives.
                row.addEventListener('click', swallowClick, true);
                setTimeout(() => row.removeEventListener('click', swallowClick, true), 0);
            }
            row.addEventListener('pointerup', endDrag);
            row.addEventListener('pointercancel', endDrag);
        });
    })();

    // ─── BOOK DETAIL DIALOG ──────────────────
    // Every .book-cover is a <button> carrying the book as data-*; the
    // shelf itself is static HTML. Native <dialog> owns focus, Esc, and
    // the inert background. Prev/next stay inside the row that was open,
    // because a book can sit in several rows.
    (function () {
        const dialog = document.querySelector('.book-dialog');
        const shelf = document.querySelector('.shelf-page');
        if (!dialog || !shelf || typeof dialog.showModal !== 'function') return;

        const prevBtn  = dialog.querySelector('.book-dialog-prev');
        const nextBtn  = dialog.querySelector('.book-dialog-next');
        const titleEl  = dialog.querySelector('.book-dialog-title');
        const authorEl = dialog.querySelector('.book-dialog-author');
        const seriesEl = dialog.querySelector('.book-dialog-series');
        const ratingEl = dialog.querySelector('.book-dialog-rating');
        const starsEl  = dialog.querySelector('.book-dialog-stars');
        const readEl   = dialog.querySelector('.book-dialog-read');
        const noteEl   = dialog.querySelector('.book-dialog-note');
        const linkEl   = dialog.querySelector('.book-dialog-link');
        const imgEl    = dialog.querySelector('.book-dialog-cover img');
        const fbEl     = dialog.querySelector('.book-dialog-cover .book-fallback');

        let current = null;

        function rowCovers(cover) {
            const row = cover.closest('.shelf-row');
            return row ? Array.from(row.querySelectorAll('.book-cover')) : [cover];
        }

        function adjacent(offset) {
            if (!current) return null;
            const covers = rowCovers(current);
            return covers[covers.indexOf(current) + offset] || null;
        }

        function show(cover) {
            const d = cover.dataset;
            titleEl.textContent  = d.title || '';
            authorEl.textContent = d.author || '';
            seriesEl.textContent = d.series || '';
            seriesEl.hidden = !d.series;

            const rating = parseFloat(d.rating);
            if (!isNaN(rating)) {
                starsEl.textContent = '★'.repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? '½' : '');
                starsEl.setAttribute('aria-label', 'Rated ' + rating + ' out of 5');
            } else {
                starsEl.textContent = '';
                starsEl.removeAttribute('aria-label');
            }
            readEl.textContent = d.readLabel || '';
            if (d.read) readEl.setAttribute('datetime', d.read); else readEl.removeAttribute('datetime');
            ratingEl.hidden = isNaN(rating) && !d.read;

            noteEl.textContent = d.note || '';
            noteEl.hidden = !d.note;

            if (d.isbn) {
                linkEl.href = 'https://openlibrary.org/isbn/' + d.isbn;
                linkEl.hidden = false;
            } else {
                linkEl.removeAttribute('href');
                linkEl.hidden = true;
            }

            const thumb = cover.querySelector('img');
            if (thumb) {
                imgEl.src = thumb.currentSrc || thumb.src;
                imgEl.alt = (d.title || '') + ' — book cover';
                imgEl.hidden = false;
                fbEl.hidden = true;
                // Swap to the large file once it has loaded, unless the user has moved on.
                if (d.large && d.large !== imgEl.getAttribute('src')) {
                    const pre = new Image();
                    pre.onload = () => { if (current === cover) imgEl.src = d.large; };
                    pre.src = d.large;
                }
            } else {
                imgEl.removeAttribute('src');
                imgEl.hidden = true;
                fbEl.firstElementChild.textContent = d.title || '';
                fbEl.hidden = false;
            }

            current = cover;
            prevBtn.disabled = !adjacent(-1);
            nextBtn.disabled = !adjacent(1);
            if (!dialog.open) dialog.showModal();
        }

        function step(offset) {
            const next = adjacent(offset);
            if (next) show(next);
        }

        // dialog.close() hands focus back to the cover that opened the
        // dialog; after stepping, the book last shown is the one to land on.
        function closeDialog() {
            const last = current;
            current = null;
            dialog.close();
            imgEl.removeAttribute('src');
            if (last) last.focus();
        }

        shelf.addEventListener('click', e => {
            const cover = e.target.closest('.book-cover');
            if (cover) show(cover);
        });

        // ←/→ on a focused cover roves along its row; focus scrolls the row
        // into place via scroll-padding. preventDefault stops the scroller
        // from also stepping on the same keypress.
        shelf.addEventListener('keydown', e => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const cover = e.target.closest('.book-cover');
            if (!cover) return;
            e.preventDefault();
            const covers = rowCovers(cover);
            const next = covers[covers.indexOf(cover) + (e.key === 'ArrowRight' ? 1 : -1)];
            if (next) next.focus();
        });

        prevBtn.addEventListener('click', () => step(-1));
        nextBtn.addEventListener('click', () => step(1));
        dialog.addEventListener('click', e => { if (e.target === dialog) closeDialog(); });
        dialog.addEventListener('keydown', e => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
            else if (e.key === 'Escape') { e.preventDefault(); closeDialog(); }
        });
        // A close the page did not initiate (the browser's own Escape handling)
        dialog.addEventListener('close', () => {
            imgEl.removeAttribute('src');
            const last = current;
            current = null;
            if (last) last.focus();
        });
    })();

    // ─── KEYBOARD SHORTCUTS ──────────────────
    // Single keys, guarded against modifiers and form fields:
    //   ?  shortcuts overlay   h/r/b/w  navigate
    // Arrow keys: ←/→ rove focus across covers on the
    // shelf and step prev/next inside the detail modal.
    (function () {
        let help = null;
        let lastFocus = null;

        function buildHelp() {
            help = document.createElement('div');
            help.className = 'help-overlay';
            help.setAttribute('role', 'dialog');
            help.setAttribute('aria-modal', 'true');
            help.setAttribute('aria-label', 'Keyboard shortcuts');
            help.setAttribute('aria-hidden', 'true');

            const close = document.createElement('button');
            close.className = 'help-close';
            close.setAttribute('aria-label', 'Close');
            close.innerHTML = '&times;';
            close.addEventListener('click', () => toggleHelp(false));
            help.appendChild(close);

            const card = document.createElement('div');
            card.className = 'help-card';
            const title = document.createElement('p');
            title.className = 'help-title';
            title.textContent = 'Shortcuts';
            card.appendChild(title);
            const rows = document.createElement('div');
            rows.className = 'help-rows';
            card.appendChild(rows);
            help.appendChild(card);

            help.addEventListener('click', e => { if (e.target === help) toggleHelp(false); });
            document.body.appendChild(help);
        }

        // Rows reflect what's actually available on the current page
        function renderRows() {
            const rows = help.querySelector('.help-rows');
            rows.textContent = '';
            const items = [];
            if (findNav('home')) items.push(['H', 'Home']);
            if (findNav('resume')) items.push(['R', 'Resume']);
            if (findNav('bookshelf')) items.push(['B', 'Bookshelf']);
            if (findNav('writing')) items.push(['W', 'Writing']);
            if (document.querySelector('.shelf-row')) items.push(['← →', 'Browse books']);
            items.push(['Esc', 'Close']);
            items.forEach(item => {
                const k = document.createElement('kbd');
                k.className = 'key';
                k.textContent = item[0];
                const l = document.createElement('span');
                l.className = 'help-label';
                l.textContent = item[1];
                rows.appendChild(k);
                rows.appendChild(l);
            });
        }

        function toggleHelp(show) {
            if (!help) buildHelp();
            const active = help.classList.contains('active');
            const next = typeof show === 'boolean' ? show : !active;
            if (next === active) return;
            if (next) {
                renderRows();
                lastFocus = document.activeElement;
                help.classList.add('active');
                help.setAttribute('aria-hidden', 'false');
                setTimeout(() => help.querySelector('.help-close').focus(), 50);
            } else {
                help.classList.remove('active');
                help.setAttribute('aria-hidden', 'true');
                if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
                lastFocus = null;
            }
        }

        // 404.html links Home as "/"; other pages as "index.html"
        function findNav(page) {
            return Array.from(document.querySelectorAll('.nav-links .nav-link')).find(a => {
                const href = a.getAttribute('href') || '';
                return page === 'home'
                    ? (href === '/' || href.indexOf('index') !== -1)
                    : href.indexOf(page) !== -1;
            }) || null;
        }

        function clickNav(link) {
            if (link && !link.classList.contains('active')) link.click();
        }

        document.addEventListener('keydown', e => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;

            if (help && help.classList.contains('active')) {
                if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); toggleHelp(false); }
                else if (e.key === 'Tab') { e.preventDefault(); help.querySelector('.help-close').focus(); }
                return;
            }

            // An open dialog owns its keys
            if (document.querySelector('dialog[open]')) return;

            if (e.key === '?') { e.preventDefault(); toggleHelp(true); return; }

            switch (e.key.length === 1 ? e.key.toLowerCase() : '') {
                case 'h': clickNav(findNav('home')); break;
                case 'r': clickNav(findNav('resume')); break;
                case 'b': clickNav(findNav('bookshelf')); break;
                case 'w': clickNav(findNav('writing')); break;
            }
        });
    })();

})();