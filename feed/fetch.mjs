// Writes feed/public/daily.json: today's date and ~10 random landscape photos from the Unsplash API.
import { mkdir, writeFile } from 'node:fs/promises';

const key = process.env.UNSPLASH_ACCESS_KEY;
if (!key) throw new Error('UNSPLASH_ACCESS_KEY is not set');

const res = await fetch('https://api.unsplash.com/photos/random?count=10&orientation=landscape&topics=wallpapers&content_filter=high', {
  headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
});
if (!res.ok) throw new Error(`Unsplash answered ${res.status}: ${await res.text()}`);

const unsplash = (await res.json()).map((p) => ({
  url: p.urls.raw,
  author: p.user.name,
  authorUrl: p.user.links.html,
  photoUrl: p.links.html,
}));
if (!unsplash.length) throw new Error('Unsplash returned no photos');

await mkdir('feed/public', { recursive: true });
await writeFile('feed/public/daily.json', JSON.stringify({ date: new Date().toISOString().slice(0, 10), unsplash }, null, 2) + '\n');
console.log(`Wrote ${unsplash.length} photos`);
