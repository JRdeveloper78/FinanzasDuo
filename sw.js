const CACHE_NAME = 'finanzasduo-v19';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Bypass cache for Google Apps Script (Sync)
    if (event.request.url.includes('script.google.com')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // If network works, put in cache and return
                const resCopy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resCopy));
                return response;
            })
            .catch(() => {
                // If network fails, use cache
                return caches.match(event.request);
            })
    );
});
