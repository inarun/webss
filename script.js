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
        function setMenu(open, restoreFocus = false) {
            tog.classList.toggle('open', open);
            links.classList.toggle('open', open);
            tog.setAttribute('aria-expanded', String(open));
            if (restoreFocus) tog.focus();
        }
        tog.addEventListener('click', () => setMenu(!links.classList.contains('open')));
        links.addEventListener('click', e => {
            if (e.target.closest('.nav-link')) setMenu(false);
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && links.classList.contains('open')) {
                e.preventDefault();
                setMenu(false, true);
            }
        });
        window.matchMedia('(max-width: 640px)').addEventListener('change', () => setMenu(false));
    }

    // ─── THEME TOGGLE ────────────────────────
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
        const labelTheme = () => themeToggle.setAttribute('aria-label',
            document.documentElement.dataset.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
        labelTheme();
        themeToggle.addEventListener('click', () => {
            const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            try { localStorage.setItem('theme', next); } catch (_) { /* Theme still works without storage. */ }
            labelTheme();
        });
    }

    // ─── PAGE TRANSITION ──────────────────────
    // Scale fade: current page shrinks + fades, new page grows in
    (function () {
        const main = document.querySelector('main');
        if (!main) return;

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // On arrival: if coming from a transition, animate in
        let entry;
        try {
            entry = sessionStorage.getItem('pageTransition');
            sessionStorage.removeItem('pageTransition');
        } catch (_) { /* Navigation does not require storage. */ }
        let pending = null;
        window.addEventListener('pageshow', e => {
            if (!e.persisted) return;
            clearTimeout(pending);
            pending = null;
            main.style.removeProperty('opacity');
            main.style.removeProperty('transform');
            main.style.removeProperty('transition');
        });
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
            if (!link || link.classList.contains('active') || e.defaultPrevented ||
                e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey ||
                link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
            const url = new URL(link.href, location.href);
            if (url.origin !== location.origin || (url.pathname === location.pathname && url.hash)) return;
            e.preventDefault();
            const href = link.getAttribute('href');

            if (reduceMotion) { window.location.href = href; return; }

            if (pending !== null) return;
            try { sessionStorage.setItem('pageTransition', '1'); } catch (_) { /* Optional animation state. */ }

            main.style.transition = 'opacity 0.35s ease, transform 0.35s cubic-bezier(0.4, 0, 1, 1)';
            main.style.opacity = '0';
            main.style.transform = 'scale(0.97)';

            pending = setTimeout(() => { window.location.href = href; }, 360);
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
        if (navLinks.querySelector('a[href$="writing.html"]')) return;

        const RSS_API = 'https://api.rss2json.com/v1/api.json?rss_url=' +
                        encodeURIComponent('https://nusayb.substack.com/feed');

        fetch(RSS_API)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data || !data.items || data.items.length === 0) return;

                const link = document.createElement('a');
                link.href = '/writing.html';
                link.className = 'nav-link';
                link.textContent = 'Writing';
                if (/\/writing(?:\.html)?\/?$/.test(location.pathname)) {
                    link.classList.add('active');
                    link.setAttribute('aria-current', 'page');
                }

                // Insert before Bookshelf if present, otherwise append at end
                const bookshelf = navLinks.querySelector('a[href$="bookshelf.html"]');
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
            // Covers are <img>s; without this the browser starts a native image
            // drag on the first move and stops delivering pointer events.
            row.addEventListener('dragstart', e => e.preventDefault());
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
    //   ?  shortcuts overlay   h/r/p/b/w  navigate
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
            if (findNav('projects')) items.push(['P', 'Projects']);
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
                case 'p': clickNav(findNav('projects')); break;
                case 'b': clickNav(findNav('bookshelf')); break;
                case 'w': clickNav(findNav('writing')); break;
            }
        });
    })();

    /* ─── LEDGER PREVIEW ─── */
    (function () {
        const phone = document.getElementById('ledger-phone');
        if (!phone) return;

        const CHAPTERS = {
            start: ['Start', 'Start with what you came to do.', 'Pick a workout, or repeat the last one.'],
            log: ['Log a set', 'Last time’s numbers, ready to beat.', 'Tick a set, start your rest, and see a star on a new best.'],
            rest: ['Rest', 'Rest starts on the tick.', 'Fifteen seconds more or less, or skip it.'],
            lock: ['Lock Screen', 'Your rest, on your Lock Screen.', 'The countdown and the next set, in one glance.'],
            run: ['Run', 'Run. Swim. Stretch. Play.', 'Every activity gets its own fields. Log a run and Ledger works out your pace.'],
            plan: ['Plan', 'One sentence. One workout.', 'Say what you’ve got, and Ledger plans today’s session from your own log. Needs iOS 27. Asking also needs Apple Intelligence.'],
            progress: ['Progress', 'Every lift.', 'Heaviest sets, estimated 1RM, and records.'],
            muscles: ['Muscles', 'See where the work goes.', 'Estimated sets per week on a body map.'],
            history: ['History', 'Every session.', 'Sets, volume, and duration at a glance.'],
        };
        const FIRST = { start: 'home', log: 'logging', rest: 'rest', lock: 'lockscreen', run: 'activity-running', plan: 'plan-empty', progress: 'progress-exercises', muscles: 'progress-bodymap', history: 'history' };

        const HOME_TAB = ['Home', 'home', 8, 91, 21, 6.5, 'fade'];
        const PROGRESS_TAB = ['Progress', 'progress-exercises', 29, 91, 21, 6.5, 'fade'];
        const HISTORY_TAB = ['History', 'history', 50, 91, 21, 6.5, 'fade'];

        // Each spot is [label, target, x%, y%, width%, height%, move], placed over the control it stands for.
        const SCREENS = {
            home: { chapter: 'start', alt: 'Ledger’s Home screen, with a Start Workout button and last week’s summary.', spots: [
                ['Start Workout', 'start', 4, 20.5, 92, 6, 'up'],
                ['Plan or Ask', 'plan-empty', 4, 28, 29, 7, 'up'],
                PROGRESS_TAB, HISTORY_TAB,
            ] },
            start: { chapter: 'start', alt: 'What are you training? A list of workouts and activities.', spots: [
                ['Push', 'start-push', 4, 26, 45, 8.5],
                ['Cardio', 'start-cardio', 4, 54, 45, 7.5],
                ['Cancel', 'home', 4, 8.5, 21, 6, 'down'],
            ] },
            'start-push': { chapter: 'start', alt: 'The Push workout, with templates and exercises to choose from.', spots: [
                ['Start Workout', 'logging', 4, 89.5, 92, 6],
                ['Back', 'start', 3, 8, 13, 6.5, 'back'],
            ] },
            'start-cardio': { chapter: 'run', alt: 'A grid of cardio activities, from running to battle ropes.', spots: [
                ['Running', 'activity-running', 4, 16.5, 30, 10],
                ['Back', 'start', 3, 8, 13, 6.5, 'back'],
            ] },
            logging: { chapter: 'log', alt: 'A bench press workout showing last time’s weights and reps, with no sets ticked yet.', spots: [
                ['Tick the set', 'rest', 69, 43.5, 13, 17, 'fade'],
            ] },
            rest: { chapter: 'rest', alt: 'Three ticked sets, a gold star on a new best, and the rest timer at 1:12.', spots: [
                ['Skip rest', 'logging-pr', 41, 88.5, 18, 5, 'fade'],
            ] },
            'logging-pr': { chapter: 'log', alt: 'A bench press workout with a gold star on a new best set of 235 by 8.', spots: [
                ['Finish', 'history-detail', 76, 7, 21, 5.5],
            ] },
            lockscreen: { chapter: 'lock', alt: 'A Lock Screen showing the rest countdown and the next set.', spots: [] },
            'activity-running': { chapter: 'run', alt: 'A running activity with empty time and distance fields.', spots: [
                ['Enter time and distance', 'activity-pace', 6, 33.5, 88, 6, 'fade'],
            ] },
            'activity-pace': { chapter: 'run', alt: 'A logged run of 28:42 over 3.2 miles, with a pace of 8:58 per mile.', spots: [
                ['Done', 'history', 6, 45, 88, 6, 'fade'],
            ] },
            'plan-empty': { chapter: 'plan', alt: 'Plan or Ask, with suggested questions and an empty text box.', spots: [
                ['Type a request', 'plan-typed', 3, 82.5, 81, 5, 'fade'],
                ['Done', 'home', 3, 8.5, 19, 6, 'down'],
            ] },
            'plan-typed': { chapter: 'plan', alt: 'Plan or Ask with “45 minutes, upper body, no barbell” typed in.', spots: [
                ['Send', 'plan', 84, 45.5, 13, 6.5, 'fade'],
            ] },
            plan: { chapter: 'plan', alt: 'A 45 minute upper body plan with four exercises and a Start Workout button.', spots: [
                ['Start Workout', 'logging', 6, 57.5, 88, 6],
                ['Done', 'home', 3, 8.5, 19, 6, 'down'],
            ] },
            'progress-exercises': { chapter: 'progress', alt: 'A chart of bench press strength rising from about 200 to 232.5 pounds.', spots: [HOME_TAB, HISTORY_TAB] },
            'progress-bodymap': { chapter: 'muscles', alt: 'A body map shaded by estimated weekly sets for each muscle.', spots: [
                ['List', 'progress-exercises', 7, 12, 42, 3.8, 'fade'],
                HOME_TAB, HISTORY_TAB,
            ] },
            history: { chapter: 'history', alt: 'History, a list of past workouts by date.', spots: [
                ['Oct 25, Push', 'history-detail', 4, 59.5, 92, 9],
                ['Calendar', 'history-calendar', 68, 6.5, 16, 6.5, 'fade'],
                HOME_TAB, PROGRESS_TAB,
            ] },
            'history-calendar': { chapter: 'history', alt: 'History as an October calendar with workouts marked by colour.', spots: [
                ['Oct 25', 'history-detail', 80.5, 63, 9, 6.5],
                ['List', 'history', 68, 6.5, 16, 6.5, 'fade'],
                HOME_TAB, PROGRESS_TAB,
            ] },
            'history-detail': { chapter: 'history', alt: 'A workout summary with 16 working sets, 14.6k pounds of volume, and 59 minutes.', spots: [
                ['Back', 'history', 3, 7, 13, 6.5, 'back'],
                HOME_TAB, PROGRESS_TAB,
            ] },
        };
        const TOUR = ['home', 'start', 'start-push', 'logging', 'rest', 'logging-pr', 'history-detail', 'home'];
        const MOVES = {
            push: ['translateX(100%)', 'translateX(-28%)'],
            back: ['translateX(-28%)', 'translateX(100%)'],
            up: ['translateY(100%)', 'none'],
            down: ['none', 'translateY(100%)'],
            fade: ['none', 'none'],
        };

        const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
        const chapters = document.getElementById('ledger-chapters');
        const caption = document.getElementById('ledger-caption');
        const hint = document.getElementById('ledger-hint');
        const tourButton = document.getElementById('ledger-tour');
        const src = id => `media/ledger/screens/${id}.webp`;
        const touch = document.createElement('span');
        touch.className = 'ledger-touch';
        phone.append(touch);

        let current = 'home';
        let spots = [];
        let step = -1;
        let timer = 0;
        let inView = false;
        let toured = false;
        const touring = () => step >= 0;

        const buttons = {};
        Object.entries(CHAPTERS).forEach(([key, [label]]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.addEventListener('click', () => { stopTour(); show(FIRST[key], 'fade'); });
            chapters.append(button);
            buttons[key] = button;
        });
        chapters.hidden = false;
        hint.hidden = false;

        function drawSpots() {
            spots.forEach(spot => spot.remove());
            spots = SCREENS[current].spots.map(([label, target, x, y, w, h, move], index) => {
                const spot = document.createElement('button');
                spot.type = 'button';
                spot.className = 'ledger-spot';
                spot.setAttribute('aria-label', label);
                spot.style.cssText = `left:${x}%;top:${y}%;width:${w}%;height:${h}%`;
                spot.classList.toggle('is-next', index === 0 && !touring() && !calm.matches);
                spot.addEventListener('click', () => { stopTour(); show(target, move); });
                phone.append(spot);
                new Image().src = src(target);
                return spot;
            });
        }

        function setCaption(chapter) {
            const [, title, text] = CHAPTERS[chapter];
            caption.querySelector('h3').textContent = title;
            caption.querySelector('p').textContent = text;
            Object.entries(buttons).forEach(([key, button]) => button.setAttribute('aria-pressed', String(key === chapter)));
        }

        function show(id, move = 'push') {
            const screen = SCREENS[id];
            const shots = phone.querySelectorAll('.ledger-shot');
            const old = shots[shots.length - 1];
            shots.forEach(shot => { if (shot !== old) shot.remove(); });
            const next = old.cloneNode();
            next.src = src(id);
            next.alt = screen.alt;
            old.alt = '';
            old.after(next);
            current = id;
            setCaption(screen.chapter);
            drawSpots();

            if (calm.matches) { old.remove(); return; }
            const [enter, leave] = MOVES[move];
            const timing = { duration: move === 'fade' ? 240 : 340, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
            if (move === 'down') next.style.zIndex = -1;
            next.animate({ transform: [enter, 'none'], opacity: [move === 'fade' ? 0 : 1, 1] }, timing);
            old.animate({ transform: ['none', leave] }, { ...timing, fill: 'forwards' }).finished
                .then(() => { old.remove(); next.style.zIndex = ''; })
                .catch(() => { /* The old screen was already replaced. */ });
        }

        function stopTour() {
            toured = true;
            clearTimeout(timer);
            if (!touring()) return;
            step = -1;
            tourButton.textContent = 'Play tour';
            caption.setAttribute('aria-live', 'polite');
            drawSpots();
        }

        function tourStep() {
            if (!touring() || !inView) return;
            const target = TOUR[step + 1];
            const index = SCREENS[current].spots.findIndex(s => s[1] === target);
            const spot = spots[index];
            touch.style.left = `${spot.offsetLeft + spot.offsetWidth / 2}px`;
            touch.style.top = `${spot.offsetTop + spot.offsetHeight / 2}px`;
            touch.animate(
                [{ opacity: 0, transform: 'scale(1.5)' }, { opacity: 1, transform: 'scale(1)', offset: 0.55 }, { opacity: 1, transform: 'scale(0.82)', offset: 0.8 }, { opacity: 0, transform: 'scale(1.1)' }],
                { duration: 760, easing: 'ease-out' }
            );
            timer = setTimeout(() => {
                step += 1;
                show(target, SCREENS[current].spots[index][6]);
                if (step === TOUR.length - 1) stopTour();
                else timer = setTimeout(tourStep, 1900);
            }, 560);
        }

        function startTour() {
            toured = true;
            step = 0;
            tourButton.textContent = 'Pause tour';
            caption.setAttribute('aria-live', 'off');
            if (current === 'home') drawSpots();
            else show('home', 'fade');
            clearTimeout(timer);
            timer = setTimeout(tourStep, 900);
        }

        tourButton.addEventListener('click', () => { if (touring()) stopTour(); else startTour(); });

        phone.addEventListener('click', e => {
            if (e.target.closest('.ledger-spot')) return;
            stopTour();
            phone.classList.add('show-spots');
            setTimeout(() => phone.classList.remove('show-spots'), 700);
        });
        phone.addEventListener('keydown', stopTour);

        setCaption('start');
        drawSpots();

        new IntersectionObserver(([entry]) => {
            inView = entry.isIntersecting;
            if (!inView) return;
            if (touring()) { clearTimeout(timer); timer = setTimeout(tourStep, 900); }
            else if (!toured && !calm.matches) startTour();
        }, { threshold: 0.6 }).observe(phone);
    })();

})();