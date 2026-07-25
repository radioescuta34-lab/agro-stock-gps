const CACHE_NAME = 'agro-stock-gps-v4';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-128.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.svg'
];

// Install — pre-cache apenas assets estáticos reais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — limpar caches antigos e assumir controle
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Mensagens do app (skip_waiting forçado)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch — estratégia dual
const SENSITIVE_PATHS = ['/api/licenses/', '/api/admin/', '/api/loans/'];

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Só intercepta requisições do mesmo origin
  if (url.origin !== location.origin) return;

  // Nunca cachear rotas sensíveis (dados de licença, admin, empréstimos)
  if (SENSITIVE_PATHS.some(p => url.pathname.startsWith(p))) {
    return;
  }

  // Cache-first para assets do Vite (arquivos com hash)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Network-first para tudo mais (páginas, API, etc)
  event.respondWith(networkFirst(request));
});

// Cache-first — rápido, ideal para assets imutáveis
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Asset indisponível', { status: 503 });
  }
}

// Network-first — sempre tenta rede, fallback pro cache
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Fallback offline para navegação HTML
    if (request.headers.get('accept')?.includes('text/html')) {
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
    }

    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}
