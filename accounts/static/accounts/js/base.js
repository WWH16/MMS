/**
 * base.js — ReelMatch shared utilities
 * Loaded on every page via base.html
 */

// Inject spin keyframe for button spinners
(function() {
  const s = document.createElement('style');
  s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(s);
})();

// ─── Auth bootstrap ────────────────────────────────────────────────
window.getAuthToken = () => localStorage.getItem('token') || sessionStorage.getItem('token');
window.getAuthUser  = () => localStorage.getItem('username') || sessionStorage.getItem('username') || 'User';
window.getAuthIsStaff = () => (localStorage.getItem('is_staff') || sessionStorage.getItem('is_staff')) === 'true';

document.addEventListener('DOMContentLoaded', () => {
  const username = window.getAuthUser();
  const isStaff  = window.getAuthIsStaff();

  document.querySelectorAll('#userDisplay').forEach(el => el.textContent = username);
  if (isStaff) {
    document.querySelectorAll('#userRole').forEach(el => el.textContent = 'Administrator');
    document.getElementById('addMovieLink')?.classList.remove('hidden');
  }

// ── Sign-out modal ────────────────────────────────────────
  const signoutModal    = document.getElementById('signoutModal');
  const signoutCard     = document.getElementById('signoutModalCard');
  const signoutCancelBtn  = document.getElementById('signoutCancelBtn');
  const signoutConfirmBtn = document.getElementById('signoutConfirmBtn');

  function openSignoutModal() {
    signoutModal?.classList.remove('opacity-0', 'invisible');
    signoutModal?.classList.add('opacity-100', 'visible');
    signoutCard?.classList.remove('scale-95');
    signoutCard?.classList.add('scale-100');
    document.body.style.overflow = 'hidden';
  }

  function closeSignoutModal() {
    signoutModal?.classList.add('opacity-0', 'invisible');
    signoutModal?.classList.remove('opacity-100', 'visible');
    signoutCard?.classList.add('scale-95');
    signoutCard?.classList.remove('scale-100');
    document.body.style.overflow = '';
  }

  // Clicking the nav "Sign Out" button opens the modal instead of acting directly
  document.getElementById('logoutBtn')?.addEventListener('click', openSignoutModal);

  // Cancel closes the modal
  signoutCancelBtn?.addEventListener('click', closeSignoutModal);

  // Click outside card closes
  signoutModal?.addEventListener('click', (e) => {
    if (e.target === signoutModal) closeSignoutModal();
  });

  // Escape key closes
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSignoutModal();
  });

  // Confirm: actually sign out
  signoutConfirmBtn?.addEventListener('click', async () => {
    const token = window.getAuthToken();
    signoutConfirmBtn.disabled = true;
    signoutConfirmBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;"><svg style="animation:spin 0.8s linear infinite;width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke-linecap="round"/></svg>Signing out…</span>';
    try {
      if (token) await fetch('/api/logout/', {
        method: 'POST',
        headers: { 'Authorization': `Token ${token}` }
      });
    } catch { /* ignore network errors — token cleared anyway */ }
    
    // Clear everything
    localStorage.removeItem('token');
    localStorage.removeItem('is_staff');
    localStorage.removeItem('username');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('is_staff');
    sessionStorage.removeItem('username');
    
    window.location.href = '/signin/';
  });

  // Scroll-to-top button
  const scrollBtn = document.getElementById('scrollTopBtn');
  if (scrollBtn) {
    window.addEventListener('scroll', () => {
      scrollBtn.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });
    scrollBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
});


// ─── Toast system ─────────────────────────────────────────────────
/**
 * showToast(message, type)
 * type: 'success' | 'remove'
 *
 * Usage anywhere:
 *   showToast('Added to your list!', 'success');
 *   showToast('Removed from your list', 'remove');
 */
window.showToast = function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icon = type === 'success' ? 'bookmark_added' : 'bookmark_remove';

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="material-symbols-outlined text-base" style="font-variation-settings:'FILL' 1">${icon}</span>${message}`;

  container.appendChild(el);

  // Trigger animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('show'));
  });

  // Auto-dismiss
  setTimeout(() => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, 2800);
};


// ─── Shared watchlist toggle ───────────────────────────────────────
/**
 * toggleWatchlist(btn, movieId, options)
 *
 * options.isHero    – true when called from hero section
 * options.isModal   – true when called from the detail modal
 * options.onSuccess – optional callback(nowInList)
 */
window.toggleWatchlist = async function toggleWatchlist(btn, movieId, options = {}) {
  const token = window.getAuthToken();
  if (!token) { window.location.href = '/signin/'; return; }

  const { isHero = false, isModal = false, onSuccess } = options;
  const inList = btn.dataset.inList === 'true';
  btn.disabled = true;
  const originalHtml = btn.innerHTML;

  try {
    const res = await fetch('/api/watchlist/', {
      method:  inList ? 'DELETE' : 'POST',
      headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ movie_id: movieId })
    });

    if (res.ok || res.status === 204) {
      const nowInList = !inList;
      btn.dataset.inList = nowInList;

      // Update button appearance
      if (isHero) {
        btn.innerHTML = nowInList
          ? `<span class="material-symbols-outlined">bookmark_added</span> SAVED`
          : `<span class="material-symbols-outlined">bookmark</span> ADD TO LIST`;
      } else if (isModal) {
        _updateModalWatchlistBtn(btn, nowInList);
      } else {
        // Compact card button style
        const isSmall = btn.className.includes('py-1.5');
        btn.textContent = nowInList ? '✓ SAVED' : '+ SAVE';
        btn.className = btn.className
          .replace(/bg-\S+/g, '')
          .replace(/text-\S+/g, '')
          .trim();
        btn.className += nowInList
          ? ' bg-surface-bright/80 text-on-surface'
          : ' bg-primary-container text-on-primary-container';
      }

      // Toast
      showToast(
        nowInList ? 'Added to your list!' : 'Removed from your list',
        nowInList ? 'success' : 'remove'
      );

      if (typeof onSuccess === 'function') onSuccess(nowInList);
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Something went wrong', 'remove');
      btn.innerHTML = originalHtml;
    }
  } catch {
    showToast('Network error — please try again', 'remove');
    btn.innerHTML = originalHtml;
  } finally {
    btn.disabled = false;
  }
};

function _updateModalWatchlistBtn(btn, inList) {
  btn.innerHTML = inList
    ? `<span class="material-symbols-outlined">bookmark_added</span> Saved to List`
    : `<span class="material-symbols-outlined">bookmark</span> Save to List`;
  btn.className = `flex-1 py-4 rounded-xl font-headline font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 ${
    inList
      ? 'bg-surface-bright text-on-surface'
      : 'bg-primary-container text-on-primary-container hover:brightness-110'
  }`;
}
// Expose for modal usage
window._updateModalWatchlistBtn = _updateModalWatchlistBtn;


// ─── Shared Watch Trailer logic ───────────────────────────────────
window.handleWatch = async function(title, year = null) {
  window.showToast('Loading trailer...', 'success');
  try {
    let url = `/api/watch/?title=${encodeURIComponent(title)}`;
    if (year && year !== 'N/A') url += `&year=${encodeURIComponent(year)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.url) {
      window.closeSharedModal();
      window._showWatchPlayer(data, title);
    } else {
      window.showToast(data.message || 'No trailer found', 'remove');
    }
  } catch {
    window.showToast('Unable to load trailer', 'remove');
  }
};

// ─── Misc utils ───────────────────────────────────────────────────
window.getCookie = function getCookie(name) {
  let value = null;
  document.cookie?.split(';').forEach(c => {
    const [k, v] = c.trim().split('=');
    if (k === name) value = decodeURIComponent(v);
  });
  return value;
};

window.parseGenre = function parseGenre(movie) {
  if (Array.isArray(movie.genres_list) && movie.genres_list.length) return movie.genres_list[0];
  if (typeof movie.genres === 'string') {
    const matches = movie.genres.match(/['"]([^'"]+)['"]/g);
    if (matches) return matches[0].replace(/['"]/g, '');
    return movie.genres.replace(/[\[\]']/g, '').split(',')[0].trim();
  }
  return 'Other';
};

window.PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 500 750'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%231c1b1b'/%3E%3Cstop offset='100%25' stop-color='%232a2a2a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='500' height='750' fill='url(%23g)'/%3E%3Cpath fill='%23e50914' fill-opacity='0.08' d='M180,320 L320,375 L180,430 L180,320 Z'/%3E%3Ctext x='250' y='500' font-family='Inter, sans-serif' font-size='14' fill='%23af8782' text-anchor='middle' letter-spacing='4' font-weight='300'%3ENO POSTER%3C/text%3E%3C/svg%3E";

window.getPoster = function getPoster(movie) {
  return (movie.poster_url && movie.poster_url !== 'None' && movie.poster_url !== 'nan')
    ? movie.poster_url
    : window.PLACEHOLDER;
};
// ─── Shared Movie Detail Modal ─────────────────────────────────────────────
window._sharedModalCache = {
  elements: null,
  currentMovieId: null,
  backdropCache: new Map(),
  abortController: null,
};

window._getModalElements = function() {
  if (!window._sharedModalCache.elements) {
    window._sharedModalCache.elements = {
      modal:        document.getElementById('movieModal'),
      title:        document.getElementById('modalTitle'),
      overview:     document.getElementById('modalOverview'),
      meta:         document.getElementById('modalMeta'),
      img:          document.getElementById('modalImg'),
      watchlistBtn: document.getElementById('modalWatchlistBtn'),
      recommendBtn: document.getElementById('modalRecommendBtn'),
    };
  }
  return window._sharedModalCache.elements;
};

window._applyBackdropWithFade = function(imgEl, url) {
  const preload = new Image();
  preload.onload = () => {
    imgEl.style.transition = 'opacity 0.2s ease';
    imgEl.style.opacity = '0';
    setTimeout(() => {
      imgEl.src = url;
      imgEl.style.objectFit = 'cover';
      imgEl.style.objectPosition = 'center top';
      imgEl.style.opacity = '1';
    }, 200);
  };
  preload.src = url;
};

window.openSharedModal = function(movie, watchlistIds, onWatchlistChange) {
  const el = window._getModalElements();
  const cache = window._sharedModalCache;
  if (!el.modal) return;

  if (cache.abortController) cache.abortController.abort();
  cache.abortController = new AbortController();

  const genre  = window.parseGenre(movie);
  const year   = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
  const rating = parseFloat(movie.vote_average || 0).toFixed(1);

  el.title.textContent    = movie.title.toUpperCase();
  el.overview.textContent = movie.overview || 'No overview available.';
  el.meta.textContent     = `${genre} • ${year} • ⭐ ${rating}`;

  el.img.style.transition     = 'none';
  el.img.style.opacity        = '1';
  el.img.style.objectFit      = 'cover';
  el.img.style.objectPosition = 'center top';
  el.img.src = window.getPoster(movie);

  const inList = watchlistIds instanceof Set
    ? watchlistIds.has(movie.movie_id)
    : watchlistIds.includes(movie.movie_id);

  el.watchlistBtn.dataset.inList = inList;
  window._updateModalWatchlistBtn(el.watchlistBtn, inList);

  el.watchlistBtn.onclick = (e) => {
    e.stopPropagation();
    window.toggleWatchlist(el.watchlistBtn, movie.movie_id, {
      isModal: true,
      onSuccess: (nowInList) => {
        if (typeof onWatchlistChange === 'function') onWatchlistChange(movie.movie_id, nowInList);
      }
    });
  };

  el.recommendBtn.onclick = () => {
    window.location.href = `/recommendations/?title=${encodeURIComponent(movie.title)}`;
  };

  // Watch Trailer button
  const existingWatchBtn = document.getElementById('modalWatchBtn');
  if (existingWatchBtn) existingWatchBtn.remove();
  const watchBtn = document.createElement('button');
  watchBtn.id = 'modalWatchBtn';
  watchBtn.className = 'w-full py-4 mb-3 rounded-xl font-headline font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 bg-green-600 text-white hover:bg-green-700';
  watchBtn.innerHTML = `<span class="material-symbols-outlined text-lg">play_circle</span> Watch Trailer`;
  watchBtn.onclick = (e) => {
    e.stopPropagation();
    window.handleWatch(movie.title, year);
  };
  const buttonContainer = document.getElementById('modalButtonContainer');
  if (buttonContainer) buttonContainer.parentNode.insertBefore(watchBtn, buttonContainer);

  // Show modal
  el.modal.style.visibility = 'visible';
  el.modal.style.opacity = '1';
  el.modal.querySelector('.relative.w-full').style.transform = 'scale(1)';
  document.body.style.overflow = 'hidden';
  cache.currentMovieId = movie.movie_id;

  // Backdrop fetch
  const cacheKey = movie.movie_id;
  if (cache.backdropCache.has(cacheKey)) {
    const cached = cache.backdropCache.get(cacheKey);
    if (cached) window._applyBackdropWithFade(el.img, cached);
    return;
  }

  fetch(`/api/tmdb-backdrop/?movie_id=${encodeURIComponent(movie.movie_id)}&title=${encodeURIComponent(movie.title)}`, {
    signal: cache.abortController.signal
  })
  .then(r => r.json())
  .then(data => {
    cache.backdropCache.set(cacheKey, data.backdrop_url || null);
    if (data.backdrop_url && cache.currentMovieId === movie.movie_id) {
      window._applyBackdropWithFade(el.img, data.backdrop_url);
    }
  })
  .catch(err => { if (err.name !== 'AbortError') console.error('Backdrop:', err); });
};

window.closeSharedModal = function() {
  const el = window._getModalElements();
  const cache = window._sharedModalCache;
  if (!el.modal) return;
  el.modal.style.opacity = '0';
  el.modal.style.visibility = 'hidden';
  el.modal.querySelector('.relative.w-full').style.transform = 'scale(0.95)';
  document.body.style.overflow = '';
  cache.currentMovieId = null;
  if (cache.abortController) { cache.abortController.abort(); cache.abortController = null; }
  const existingWatchBtn = document.getElementById('modalWatchBtn');
  if (existingWatchBtn) existingWatchBtn.remove();
  setTimeout(() => { if (el.modal.style.visibility === 'hidden') el.img.src = ''; }, 300);
};

// Watch player (shared)
let youtubeAPILoaded = false;
function loadYouTubeAPI() {
  return new Promise((resolve, reject) => {
    if (youtubeAPILoaded || (window.YT && window.YT.Player)) {
      youtubeAPILoaded = true;
      resolve();
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    window.onYouTubeIframeAPIReady = () => {
      youtubeAPILoaded = true;
      resolve();
    };
    setTimeout(() => reject(new Error('YouTube API timeout')), 5000);
  });
}

window._showWatchPlayer = async function(data, title) {
  const existing = document.getElementById('watchPlayerModal');
  if (existing) existing.remove();

  const watchModal = document.createElement('div');
  watchModal.id = 'watchPlayerModal';
  watchModal.className = 'fixed inset-0 z-[150] flex items-center justify-center bg-black/95 backdrop-blur-md';
  watchModal.innerHTML = `
    <button class="absolute top-6 right-6 text-white hover:text-primary-container z-[160] transition-colors" onclick="window.closeWatchPlayer()">
      <span class="material-symbols-outlined text-4xl">close</span>
    </button>
    <div class="relative w-full max-w-6xl h-[80vh] mx-4 bg-black rounded-2xl overflow-hidden shadow-2xl">
      <div class="absolute top-4 left-4 z-10">
        <span class="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold uppercase">Trailer</span>
      </div>
      <div id="sharedYTContainer" class="w-full h-full"></div>
    </div>`;
  document.body.appendChild(watchModal);
  document.body.style.overflow = 'hidden';

  const closeBtn = watchModal.querySelector('button');
  
  window.closeWatchPlayer = () => {
    watchModal.remove();
    document.body.style.overflow = '';
    window.removeEventListener('keydown', escHandler);
  };

  const escHandler = (e) => {
    if (e.key === 'Escape') window.closeWatchPlayer();
  };
  window.addEventListener('keydown', escHandler);

  watchModal.addEventListener('click', (e) => {
    if (e.target === watchModal) window.closeWatchPlayer();
  });

  // Extract video ID
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube(?:-nocookie)?\.com\/embed\/)([^&\?\/]+)/,
  ];
  let videoId = null;
  for (const p of patterns) {
    const m = data.url.match(p);
    if (m) { videoId = m[1]; break; }
  }

  const container = document.getElementById('sharedYTContainer');
  if (videoId) {
    try {
      await loadYouTubeAPI();
      new YT.Player('sharedYTContainer', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          'autoplay': 1,
          'modestbranding': 1,
          'rel': 0
        },
        events: {
          'onError': (e) => {
            console.error('YT Error:', e.data);
            container.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1" class="w-full h-full" frameborder="0" allowfullscreen></iframe>`;
          }
        }
      });
    } catch (err) {
      container.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1" class="w-full h-full" frameborder="0" allowfullscreen></iframe>`;
    }
  } else {
    container.innerHTML = `<iframe src="${data.url}" class="w-full h-full" frameborder="0" allowfullscreen></iframe>`;
  }
};

// Wire up shared modal close events once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('closeModalBtn')?.addEventListener('click', (e) => {
    e.stopPropagation(); window.closeSharedModal();
  });
  document.getElementById('movieModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'movieModal') window.closeSharedModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.closeSharedModal();
  });
});