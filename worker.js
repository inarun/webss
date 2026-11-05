// Static assets answer Range requests with a full 200, and iOS Safari refuses to play video without a 206.
function parseRange(header, size) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match || (!match[1] && !match[2])) return null;
    if (!match[1]) {
        const length = Math.min(Number(match[2]), size);
        return length > 0 ? { start: size - length, end: size - 1 } : null;
    }
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    return start <= end && start < size ? { start, end } : null;
}

// Reads in large blocks because per-chunk JavaScript over a whole film exceeds the Workers CPU limit.
const BLOCK = 1 << 20;

async function discard(reader, bytes) {
    let view = new Uint8Array(BLOCK);
    let read = 0;
    while (read < bytes) {
        const length = Math.min(BLOCK, bytes - read);
        const { value, done } = await reader.readAtLeast(length, view.subarray(0, length));
        if (!value || !value.length) break;
        read += value.length;
        view = new Uint8Array(value.buffer);
        if (done) break;
    }
    return read;
}

async function copyRange(body, { start, end }, writable) {
    const reader = body.getReader({ mode: 'byob' });
    const writer = writable.getWriter();
    try {
        await discard(reader, start);
        for (let left = end - start + 1; left > 0;) {
            const length = Math.min(BLOCK, left);
            const { value } = await reader.readAtLeast(length, new Uint8Array(length));
            if (!value || !value.length) throw new Error('asset ended early');
            await writer.write(value);
            left -= value.length;
        }
        await writer.close();
    } catch (error) {
        await writer.abort(error).catch(() => {});
    }
    await reader.cancel().catch(() => {});
}

// The assets binding can omit Content-Length, so the size may have to be counted once per file version.
const sizes = new Map();

async function assetSize(url, etag, env) {
    if (!sizes.has(etag)) {
        const { body, status } = await env.ASSETS.fetch(url);
        if (status !== 200) return null;
        sizes.set(etag, await discard(body.getReader({ mode: 'byob' }), Infinity));
    }
    return sizes.get(etag);
}

// Substack's feed sends no CORS headers, so the Worker reads it on a schedule and serves the posts from KV.
const FEED = 'https://nusayb.substack.com/feed';
const POSTS_KEY = 'posts';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
        if (name[0] === '#') {
            const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
            return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
        }
        return ENTITIES[name.toLowerCase()] ?? whole;
    });
}

function field(item, tag) {
    const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(item);
    if (!match) return '';
    const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(match[1]);
    return cdata ? cdata[1] : decode(match[1]);
}

const plain = html => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const https = url => /^https:\/\//i.test(url) ? url : '';

function parseFeed(xml) {
    // A page without a channel is an error page or a block notice, not an empty feed.
    if (!/<channel[\s>]/i.test(xml)) return null;
    const posts = [];
    for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
        const url = https(field(item, 'link').trim());
        const date = new Date(field(item, 'pubDate').trim());
        if (!url || isNaN(date)) continue;
        const subtitle = plain(field(item, 'description'));
        const body = plain(field(item, 'content:encoded'));
        const excerpt = subtitle || (body.length > 220 ? body.slice(0, 220).replace(/\s+\S*$/, '') + '…' : body);
        const image = https(/<enclosure[^>]*\burl="([^"]+)"/i.exec(item)?.[1] || '');
        posts.push({ title: plain(field(item, 'title')) || 'Untitled', url, date: date.toISOString(), excerpt, image: decode(image) });
    }
    posts.sort((a, b) => b.date.localeCompare(a.date));
    return posts;
}

// A failed or unreadable fetch leaves the stored list as it was.
async function refreshPosts(env) {
    const response = await fetch(FEED, { headers: { 'User-Agent': 'nusayb.me (+https://nusayb.me)', Accept: 'application/rss+xml, application/xml' } });
    if (!response.ok) throw new Error(`feed answered ${response.status}`);
    const posts = parseFeed(await response.text());
    if (!posts) throw new Error('feed had no channel');
    const record = { updated: new Date().toISOString(), posts };
    await env.WRITING.put(POSTS_KEY, JSON.stringify(record));
    return record;
}

async function writing(env) {
    let record = await env.WRITING.get(POSTS_KEY, 'json');
    // Only before the first scheduled run has stored anything.
    if (!record) record = await refreshPosts(env).catch(() => null);
    if (!record) {
        return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json(record, { headers: { 'Cache-Control': 'public, max-age=300' } });
}

export default {
    async scheduled(event, env, ctx) {
        ctx.waitUntil(refreshPosts(env));
    },

    async fetch(request, env, ctx) {
        if (new URL(request.url).pathname === '/api/writing') return writing(env);

        const assetRequest = new Request(request);
        assetRequest.headers.delete('Range');
        const response = await env.ASSETS.fetch(assetRequest);
        if (response.status !== 200) return response;

        const headers = new Headers(response.headers);
        headers.set('Accept-Ranges', 'bytes');
        const full = () => new Response(response.body, { status: 200, headers });

        const header = request.headers.get('Range');
        const etag = response.headers.get('ETag');
        const ifRange = request.headers.get('If-Range');
        if (!header || !etag || request.method !== 'GET' || (ifRange !== null && ifRange !== etag)) return full();
        if (!/^bytes=\d*-\d*$/.test(header.trim())) return full();

        const size = Number(response.headers.get('Content-Length')) || await assetSize(request.url, etag, env);
        if (!size) return full();
        const range = parseRange(header, size);
        if (!range) {
            headers.delete('Content-Length');
            headers.set('Content-Range', `bytes */${size}`);
            return new Response(null, { status: 416, headers });
        }
        headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
        headers.set('Content-Length', String(range.end - range.start + 1));
        const { readable, writable } = new FixedLengthStream(range.end - range.start + 1);
        ctx.waitUntil(copyRange(response.body, range, writable));
        return new Response(readable, { status: 206, headers });
    },
};
