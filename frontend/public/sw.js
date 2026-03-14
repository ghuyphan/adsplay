self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // A fetch handler is required to pass the PWA install criteria.
    // We just let the browser handle the network request normally.
});