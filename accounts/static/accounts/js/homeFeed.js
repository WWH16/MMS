/**
 * homeFeed.js — Browse page logic
 * Depends on: base.js (PLACEHOLDER, getPoster, parseGenre, toggleWatchlist, showToast)
 */

let heroMovieId = null;
let currentPage = 1;
let hasNextPage  = false;
let currentWatchlistIds = new Set();
let currentIsStaff      = false;
let allMovies = [];

// ─── Modal cache ──────────────────────────────────────────────────
const modalCache = {
  elements:        null,
  currentMovieId:  null,
  backdropCache:   new Map(),
  abortController: null,
};

function getModalElements() {
  if (!modalCache.elements) {
    modalCache.elements = {
      modal:        document.getElementById('movieModal'),
      title:        document.getElementById('modalTitle'),
      overview:     document.getElementById('modalOverview'),
      meta:         document.getElementById('modalMeta'),
      img:          document.getElementById('modalImg'),
      watchlistBtn: document.getElementById('modalWatchlistBtn'),
      recommendBtn: document.getElementById('modalRecommendBtn'),
    };
  }
  return modalCache.elements;
}

function applyBackdropWithFade(imgEl, url) {
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
}

async function openModal(movie) {
  const el = getModalElements();
  if (!el.modal) return;

  if (modalCache.abortController) modalCache.abortController.abort();
  modalCache.abortController = new AbortController();

  const genre  = parseGenre(movie);
  const year   = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
  const rating = parseFloat(movie.vote_average || 0).toFixed(1);

  el.title.textContent    = movie.title.toUpperCase();
  el.overview.textContent = movie.overview || 'No overview available.';
  el.meta.textContent     = `${genre} • ${year} • ⭐ ${rating}`;

  el.img.style.transition       = 'none';
  el.img.style.opacity          = '1';
  el.img.style.objectFit        = 'cover';
  el.img.style.objectPosition   = 'center top';
  el.img.src = getPoster(movie);

  const inList = currentWatchlistIds.has(movie.movie_id);
  el.watchlistBtn.dataset.inList = inList;
  window._updateModalWatchlistBtn(el.watchlistBtn, inList);
  el.watchlistBtn.onclick = (e) => {
    e.stopPropagation();
    window.toggleWatchlist(el.watchlistBtn, movie.movie_id, {
      isModal: true,
      onSuccess: (nowInList) => {
        if (nowInList) currentWatchlistIds.add(movie.movie_id);
        else           currentWatchlistIds.delete(movie.movie_id);
        _syncCardButtons(movie.movie_id, nowInList);
      }
    });
  };
  el.recommendBtn.onclick = () => handleRecommend(movie.title);

  // Add Watch button to modal
  const buttonContainer = document.querySelector('#movieModal .flex.flex-wrap.gap-4');
  if (buttonContainer) {
    // Remove existing watch button if any
    const existingWatchBtn = document.getElementById('modalWatchBtn');
    if (existingWatchBtn) existingWatchBtn.remove();

    // Create new watch button
    const watchBtn = document.createElement('button');
    watchBtn.id = 'modalWatchBtn';
    watchBtn.className = 'w-full py-4 mb-3 rounded-xl font-headline font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 bg-green-600 text-white hover:bg-green-700';
    watchBtn.innerHTML = `
      <span class="material-symbols-outlined text-lg">play_circle</span>
      Watch Trailer
    `;

    // Insert before the button container
    buttonContainer.parentNode.insertBefore(watchBtn, buttonContainer);

    // Add click handler
    watchBtn.onclick = (e) => {
      e.stopPropagation();
      handleWatch(movie.title, year !== 'N/A' ? year : null);
    };
  }

  el.modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  modalCache.currentMovieId = movie.movie_id;

  const cacheKey = movie.movie_id;
  if (modalCache.backdropCache.has(cacheKey)) {
    const cached = modalCache.backdropCache.get(cacheKey);
    if (cached) applyBackdropWithFade(el.img, cached);
    return;
  }

  fetch(`/api/tmdb-backdrop/?movie_id=${encodeURIComponent(movie.movie_id)}&title=${encodeURIComponent(movie.title)}`, {
    signal: modalCache.abortController.signal
  })
  .then(r => r.json())
  .then(data => {
    modalCache.backdropCache.set(cacheKey, data.backdrop_url || null);
    if (data.backdrop_url && modalCache.currentMovieId === movie.movie_id) {
      applyBackdropWithFade(el.img, data.backdrop_url);
    }
  })
  .catch(err => { if (err.name !== 'AbortError') console.error('Backdrop:', err); });
}

function closeModal() {
  const el = getModalElements();
  if (!el.modal) return;
  el.modal.classList.remove('active');
  document.body.style.overflow = '';
  modalCache.currentMovieId = null;
  if (modalCache.abortController) { modalCache.abortController.abort(); modalCache.abortController = null; }
  setTimeout(() => { if (!el.modal.classList.contains('active')) el.img.src = ''; }, 300);
}

function _syncCardButtons(movieId, inList) {
  document.querySelectorAll(`[data-movie-id="${movieId}"] .watchlist-btn`).forEach(btn => {
    btn.dataset.inList = inList;
    btn.textContent = inList ? '✓ SAVED' : '+ SAVE';
  });
}

// ─── Watch functionality ───────────────────────────────────────────
window.handleWatch = async function(title, year = null) {
  // Show loading state
  showToast('Loading trailer...', 'success');

  try {
    // Build URL with year if available
    let url = `/api/watch/?title=${encodeURIComponent(title)}`;
    if (year) {
      url += `&year=${encodeURIComponent(year)}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    if (data.url) {
      // Close the movie modal if it's open
      closeModal();
      // Show watch player
      showWatchPlayer(data, title);
    } else {
      showToast(data.message || 'No trailer found', 'remove');
    }
  } catch (error) {
    console.error('Watch error:', error);
    showToast('Unable to load trailer', 'remove');
  }
};

function showWatchPlayer(data, title) {
  // Create watch modal
  const watchModal = document.createElement('div');
  watchModal.id = 'watchPlayerModal';
  watchModal.className = 'fixed inset-0 z-[150] flex items-center justify-center bg-black/95 backdrop-blur-md';
  watchModal.innerHTML = `
    <button class="absolute top-6 right-6 text-white hover:text-primary-container z-[160] transition-colors" onclick="closeWatchPlayer()">
      <span class="material-symbols-outlined text-4xl">close</span>
    </button>
    <div class="relative w-full max-w-6xl h-[80vh] mx-4 bg-black rounded-2xl overflow-hidden shadow-2xl">
      <div class="absolute top-4 left-4 z-10">
        <span class="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold uppercase">
          Trailer
        </span>
      </div>
      <div id="youtubePlayerContainer" class="w-full h-full"></div>
    </div>
  `;

  document.body.appendChild(watchModal);
  document.body.style.overflow = 'hidden';

  // Load YouTube IFrame API
  loadYouTubeAPI().then(() => {
    const videoId = extractYouTubeVideoId(data.url);
    if (videoId) {
      new YT.Player('youtubePlayerContainer', {
        videoId: videoId,
        playerVars: {
          autoplay: 0,
          rel: 0,
          modestbranding: 1,
          origin: window.location.origin,
          enablejsapi: 1
        },
        events: {
          'onError': onPlayerError,
          'onReady': onPlayerReady
        }
      });
    } else {
      // Fallback to iframe if video ID extraction fails
      document.getElementById('youtubePlayerContainer').innerHTML = `
        <iframe 
          src="${data.url}" 
          class="w-full h-full" 
          frameborder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen>
        </iframe>
      `;
    }
  }).catch(() => {
    // Fallback to iframe if API fails
    document.getElementById('youtubePlayerContainer').innerHTML = `
      <iframe 
        src="${data.url}" 
        class="w-full h-full" 
        frameborder="0" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
        allowfullscreen>
      </iframe>
    `;
  });

  // Close on escape key
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeWatchPlayer();
      window.removeEventListener('keydown', escHandler);
    }
  };
  window.addEventListener('keydown', escHandler);

  // Store handler for cleanup
  watchModal._escHandler = escHandler;

  // Click outside to close
  watchModal.addEventListener('click', (e) => {
    if (e.target === watchModal) {
      closeWatchPlayer();
    }
  });
}

function extractYouTubeVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)([^&\?\/]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function onPlayerReady(event) {
  // Player is ready
  console.log('YouTube player ready');
}

function onPlayerError(event) {
  console.error('YouTube player error:', event.data);
  // Fallback to iframe on error
  const container = document.getElementById('youtubePlayerContainer');
  if (container && !container.querySelector('iframe')) {
    const videoId = extractYouTubeVideoId(container.dataset.url || '');
    if (videoId) {
      container.innerHTML = `
        <iframe 
          src="https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0" 
          class="w-full h-full" 
          frameborder="0" 
          allowfullscreen>
        </iframe>
      `;
    }
  }
}

let youtubeAPILoaded = false;
function loadYouTubeAPI() {
  return new Promise((resolve, reject) => {
    if (youtubeAPILoaded) {
      resolve();
      return;
    }

    if (window.YT && window.YT.Player) {
      youtubeAPILoaded = true;
      resolve();
      return;
    }

    // Load the API
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      youtubeAPILoaded = true;
      resolve();
    };

    // Timeout after 5 seconds
    setTimeout(() => reject(new Error('YouTube API load timeout')), 5000);
  });
}

window.closeWatchPlayer = function() {
  const modal = document.getElementById('watchPlayerModal');
  if (modal) {
    if (modal._escHandler) {
      window.removeEventListener('keydown', modal._escHandler);
    }
    // Clean up YouTube player if it exists
    const container = document.getElementById('youtubePlayerContainer');
    if (container && container._player) {
      container._player.destroy();
    }
    modal.remove();
    document.body.style.overflow = '';
  }
};

// ─── Render helpers ───────────────────────────────────────────────
function renderMovieCardTemplate(movie, watchlistIds, isStaff) {
  const rating     = movie.vote_average ? parseFloat(movie.vote_average).toFixed(1) : '0.0';
  const genre      = parseGenre(movie);
  const poster     = getPoster(movie);
  const year       = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
  const inList     = watchlistIds.has(movie.movie_id);
  const movieData  = JSON.stringify(movie).replace(/'/g, "&apos;");
  const isPlaceholder = !movie.poster_url || movie.poster_url === 'None' || movie.poster_url === 'nan';
  const imgClass   = isPlaceholder ? 'w-full h-full object-cover poster-placeholder-small' : 'w-full h-full object-cover';

  const adminActions = isStaff ? `
    <div class="absolute top-4 right-4 flex flex-col gap-2 translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300 z-30">
      <button onclick="event.stopPropagation();" class="bg-surface-container-high/90 backdrop-blur-sm p-2 rounded-full text-on-surface hover:text-primary-container"><span class="material-symbols-outlined text-xl">edit</span></button>
      <button onclick="event.stopPropagation();" class="bg-error-container/90 backdrop-blur-sm p-2 rounded-full text-white hover:bg-error transition-colors"><span class="material-symbols-outlined text-xl">delete</span></button>
    </div>` : '';

  return `
    <div class="movie-card group relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-container-low transition-all duration-500 hover:scale-[1.03] hover:z-20 cursor-pointer"
         data-movie='${movieData}'
         data-title="${movie.title}" data-genre="${genre}" data-rating="${rating}">
      <img class="${imgClass}" src="${poster}" alt="${movie.title}" loading="lazy"
           onerror="this.src=window.PLACEHOLDER; this.classList.add('poster-placeholder-small')" />
      <div class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      ${adminActions}
      <div class="absolute bottom-0 left-0 w-full p-4 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 space-y-2 z-10">
        <p class="text-white font-headline font-bold truncate text-sm md:text-base">${movie.title.toUpperCase()}</p>
        <p class="text-neutral-400 text-[10px] font-label font-medium">${genre} • ${year} • ⭐ ${rating}</p>
        <div class="flex gap-2">
          <button onclick="event.stopPropagation(); handleRecommend('${movie.title.replace(/'/g, "\\'")}')"
            class="flex-1 py-2 rounded-lg font-headline font-bold text-[10px] bg-surface-bright/80 text-white hover:bg-surface-bright transition-all flex items-center justify-center gap-1">
            <span class="material-symbols-outlined text-sm">auto_awesome</span>SIMILAR
          </button>
          <button onclick="event.stopPropagation(); _cardWatchlistClick(this, '${movie.movie_id}')"
            data-in-list="${inList}"
            class="watchlist-btn flex-1 py-2 rounded-lg font-headline font-bold text-[10px] transition-all ${
              inList ? 'bg-surface-bright/80 text-on-surface' : 'bg-primary-container text-on-primary-container'
            }">
            ${inList ? '✓ SAVED' : '+ SAVE'}
          </button>
        </div>
      </div>
    </div>`;
}

window._cardWatchlistClick = function(btn, movieId) {
  window.toggleWatchlist(btn, movieId, {
    onSuccess: (nowInList) => {
      if (nowInList) currentWatchlistIds.add(movieId);
      else           currentWatchlistIds.delete(movieId);
    }
  });
};

function renderGrid(movies, watchlistIds, isStaff) {
  const grid = document.getElementById('movieGrid');
  if (grid) grid.innerHTML = movies.map(m => renderMovieCardTemplate(m, watchlistIds, isStaff)).join('');
}

function appendGrid(movies, watchlistIds, isStaff) {
  const grid = document.getElementById('movieGrid');
  if (grid) grid.insertAdjacentHTML('beforeend', movies.map(m => renderMovieCardTemplate(m, watchlistIds, isStaff)).join(''));
}

function renderTopRatedCarousel(movies) {
  const carousel = document.getElementById('topRatedCarousel');
  if (!carousel) return;
  carousel.innerHTML = movies.map(movie => {
    const poster  = getPoster(movie);
    const rating  = movie.vote_average ? parseFloat(movie.vote_average).toFixed(1) : '0.0';
    const movieData = JSON.stringify(movie).replace(/'/g, "&apos;");
    const isPlaceholder = !movie.poster_url || movie.poster_url === 'None' || movie.poster_url === 'nan';
    return `
      <div class="carousel-card flex-shrink-0 w-36 md:w-44 lg:w-52 group cursor-pointer" data-movie='${movieData}'>
        <div class="aspect-[2/3] rounded-xl overflow-hidden bg-surface-container-low transition-all duration-500 group-hover:scale-[1.02] relative">
          <img class="${isPlaceholder ? 'w-full h-full object-cover poster-placeholder-small' : 'w-full h-full object-cover'}"
               src="${poster}" alt="${movie.title}" loading="lazy"
               onerror="this.src=window.PLACEHOLDER; this.classList.add('poster-placeholder-small')" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
            <p class="text-white font-headline font-bold text-xs mb-1 line-clamp-2">${movie.title}</p>
            <div class="flex items-center gap-1 text-[10px] text-neutral-300">
              <span class="material-symbols-outlined text-[12px] text-yellow-400" style="font-variation-settings:'FILL' 1">star</span>
              <span>${rating}</span>
            </div>
          </div>
        </div>
        <p class="text-on-surface font-headline font-semibold text-xs mt-2 line-clamp-1 group-hover:text-primary-container transition-colors">${movie.title}</p>
      </div>`;
  }).join('');
}

function renderRandomMovies() {
  const grid = document.getElementById('randomMoviesGrid');
  if (!grid || !allMovies.length) return;
  const randomMovies = [...allMovies].sort(() => 0.5 - Math.random()).slice(0, 6);
  grid.innerHTML = randomMovies.map(movie => {
    const poster  = getPoster(movie);
    const rating  = movie.vote_average ? parseFloat(movie.vote_average).toFixed(1) : '0.0';
    const year    = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
    const inList  = currentWatchlistIds.has(movie.movie_id);
    const genre   = parseGenre(movie);
    const movieData = JSON.stringify(movie).replace(/'/g, "&apos;");
    const isPlaceholder = !movie.poster_url || movie.poster_url === 'None' || movie.poster_url === 'nan';
    return `
      <div class="random-card group relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-container-low transition-all duration-500 hover:scale-[1.03] hover:z-20 cursor-pointer"
           data-movie='${movieData}'>
        <img class="${isPlaceholder ? 'w-full h-full object-cover poster-placeholder-small' : 'w-full h-full object-cover'}"
             src="${poster}" alt="${movie.title}" loading="lazy"
             onerror="this.src=window.PLACEHOLDER; this.classList.add('poster-placeholder-small')" />
        <div class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div class="absolute bottom-0 left-0 w-full p-3 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 space-y-2 z-10">
          <p class="text-white font-headline font-bold truncate text-xs">${movie.title.toUpperCase()}</p>
          <p class="text-neutral-400 text-[9px] font-label">${genre} • ${year} • ⭐ ${rating}</p>
          <button onclick="event.stopPropagation(); _cardWatchlistClick(this, '${movie.movie_id}')"
            data-in-list="${inList}"
            class="watchlist-btn w-full py-1.5 rounded-lg font-headline font-bold text-[9px] transition-all ${
              inList ? 'bg-surface-bright/80 text-on-surface' : 'bg-primary-container text-on-primary-container'
            }">
            ${inList ? '✓ SAVED' : '+ SAVE'}
          </button>
        </div>
      </div>`;
  }).join('');
}

async function renderHero(movie, watchlistIds) {
  if (!movie) return;
  heroMovieId = movie.movie_id;
  const rating = parseFloat(movie.vote_average || 0).toFixed(1);
  const year   = movie.release_date?.split('-')[0] || 'N/A';

  document.getElementById('heroTitle')?.   setAttribute('textContent', movie.title.toUpperCase());
  const titleEl    = document.getElementById('heroTitle');
  const overviewEl = document.getElementById('heroOverview');
  const metaEl     = document.getElementById('heroMeta');
  const imgEl      = document.getElementById('heroImg');

  if (titleEl)    titleEl.textContent    = movie.title.toUpperCase();
  if (overviewEl) overviewEl.textContent = movie.overview || '';
  if (metaEl)     metaEl.textContent     = `${parseGenre(movie)} • ${year} • ⭐ ${rating}`;
  if (imgEl)      imgEl.src              = getPoster(movie);

  try {
    const res  = await fetch(`/api/tmdb-backdrop/?movie_id=${encodeURIComponent(movie.movie_id)}&title=${encodeURIComponent(movie.title)}`);
    const data = await res.json();
    if (imgEl && data.backdrop_url) imgEl.src = data.backdrop_url;
  } catch { /* keep poster */ }

  const inList = watchlistIds.has(movie.movie_id);
  const btn    = document.getElementById('heroWatchlistBtn');
  if (btn) {
    btn.dataset.inList = inList;
    btn.innerHTML = inList
      ? `<span class="material-symbols-outlined">bookmark_added</span> SAVED`
      : `<span class="material-symbols-outlined">bookmark</span> ADD TO LIST`;
    btn.onclick = () => window.toggleWatchlist(btn, movie.movie_id, {
      isHero: true,
      onSuccess: (nowInList) => {
        if (nowInList) currentWatchlistIds.add(movie.movie_id);
        else           currentWatchlistIds.delete(movie.movie_id);
      }
    });
  }

  const recBtn = document.getElementById('heroRecommendBtn');
  if (recBtn) recBtn.onclick = () => handleRecommend(movie.title);

  // Add watch button to hero
  const heroButtonsContainer = document.querySelector('.flex.gap-3.md\\:gap-4.items-center.flex-wrap');
  if (heroButtonsContainer) {
    // Remove existing watch button if any
    const existingHeroWatch = document.getElementById('heroWatchBtn');
    if (existingHeroWatch) existingHeroWatch.remove();

    // Create watch button
    const heroWatchBtn = document.createElement('button');
    heroWatchBtn.id = 'heroWatchBtn';
    heroWatchBtn.className = 'bg-green-600 text-white px-10 py-3 rounded-lg font-headline font-bold flex items-center gap-2 hover:bg-green-700 active:scale-95 transition-all';
    heroWatchBtn.innerHTML = `
      <span class="material-symbols-outlined text-sm">play_circle</span>
      Watch Trailer
    `;
    heroWatchBtn.onclick = () => handleWatch(movie.title, year !== 'N/A' ? year : null);

    // Insert before the recommend button
    if (recBtn) {
      heroButtonsContainer.insertBefore(heroWatchBtn, recBtn);
    } else {
      heroButtonsContainer.appendChild(heroWatchBtn);
    }
  }
}

// ─── Filters ──────────────────────────────────────────────────────
function setupFilters(movies) {
  const genres = new Set();
  movies.forEach(m => { const g = parseGenre(m); if (g) genres.add(g); });

  const filterContainer = document.getElementById('filterContainer');
  if (!filterContainer) return;

  filterContainer.innerHTML = `
    <div class="flex flex-wrap gap-6 items-center bg-surface-container-low p-4 rounded-xl mb-8 border border-white/5">
      <div class="flex flex-col gap-1">
        <label class="text-[10px] uppercase font-bold text-neutral-500 tracking-widest">Genre</label>
        <select id="genreFilter" class="bg-surface-container-high border-none rounded-lg text-sm text-on-surface focus:ring-1 focus:ring-primary-container cursor-pointer py-1.5 pl-3 pr-10">
          <option value="all">All Genres</option>
          ${Array.from(genres).sort().map(g => `<option value="${g}">${g}</option>`).join('')}
        </select>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-[10px] uppercase font-bold text-neutral-500 tracking-widest">Min Rating: <span id="ratingVal" class="text-primary-container">0</span></label>
        <input type="range" id="ratingFilter" min="0" max="10" step="0.5" value="0"
               class="accent-primary-container w-32 md:w-48 cursor-pointer">
      </div>
    </div>`;

  document.getElementById('genreFilter')?.addEventListener('change', applyFilters);
  document.getElementById('ratingFilter')?.addEventListener('input', (e) => {
    const v = document.getElementById('ratingVal');
    if (v) v.textContent = e.target.value;
    applyFilters();
  });
}

function applyFilters() {
  const selectedGenre = document.getElementById('genreFilter')?.value || 'all';
  const minRating     = parseFloat(document.getElementById('ratingFilter')?.value || 0);
  document.querySelectorAll('.movie-card').forEach(card => {
    const genreMatch  = selectedGenre === 'all' || card.dataset.genre === selectedGenre;
    const ratingMatch = parseFloat(card.dataset.rating) >= minRating;
    card.style.display = (genreMatch && ratingMatch) ? 'block' : 'none';
  });
}

// ─── API calls ────────────────────────────────────────────────────
async function fetchMovies(token, search = '', page = 1) {
  try {
    const res = await fetch(`/api/movies/?search=${encodeURIComponent(search)}&page=${page}`,
      { headers: token ? { 'Authorization': `Token ${token}` } : {} });
    return res.ok ? await res.json() : { results: [], has_next: false };
  } catch { return { results: [], has_next: false }; }
}

async function fetchWatchlistIds(token) {
  if (!token) return new Set();
  try {
    const res = await fetch('/api/watchlist/', {
      headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' }
    });
    if (!res.ok) return new Set();
    const data = await res.json();
    return new Set(data.map(item => {
      if (item.movie_details) return item.movie_details.movie_id;
      if (item.movie) return typeof item.movie === 'object' ? item.movie.movie_id : item.movie;
      return null;
    }).filter(Boolean));
  } catch { return new Set(); }
}

window.handleRecommend = function(title) {
  window.location.href = `/recommendations/?title=${encodeURIComponent(title)}`;
};

// ─── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const token   = localStorage.getItem('token');
  const isStaff = localStorage.getItem('is_staff') === 'true';
  currentIsStaff = isStaff;

  // Modal events
  document.getElementById('closeModalBtn')?.addEventListener('click', (e) => {
    e.stopPropagation(); closeModal();
  });
  document.getElementById('movieModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'movieModal') closeModal();
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // Refresh random
  document.getElementById('refreshRandomBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('refreshRandomBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span> Loading...';
    await fetchRandomMoviesFromAPI();
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-outlined text-lg">refresh</span> Refresh';
  });

  // Carousel arrows
  const carousel = document.getElementById('topRatedCarousel');
  const prevBtn  = document.getElementById('topRatedPrev');
  const nextBtn  = document.getElementById('topRatedNext');
  if (carousel && prevBtn && nextBtn) {
    prevBtn.addEventListener('click', () => carousel.scrollBy({ left: -400, behavior: 'smooth' }));
    nextBtn.addEventListener('click', () => carousel.scrollBy({ left: 400, behavior: 'smooth' }));
    carousel.addEventListener('scroll', () => {
      const max = carousel.scrollWidth - carousel.clientWidth;
      prevBtn.disabled = carousel.scrollLeft <= 0;
      nextBtn.disabled = carousel.scrollLeft >= max - 10;
    }, { passive: true });
  }

  // Load data
  const [moviesData, watchlistIds] = await Promise.all([
    fetchMovies(token),
    fetchWatchlistIds(token),
  ]);

  const movies = moviesData.results || moviesData;
  if (!movies.length) {
    document.getElementById('movieGrid').innerHTML = '<p class="col-span-full text-center py-20 text-neutral-500">No movies found.</p>';
    return;
  }

  allMovies = movies;
  currentWatchlistIds = watchlistIds;
  hasNextPage = moviesData.has_next || false;

  setupFilters(movies);

  const currentYear  = new Date().getFullYear();
  const recentMovies = movies.filter(m => {
    const y = m.release_date ? parseInt(m.release_date.split('-')[0]) : 0;
    return y >= currentYear - 2;
  });
  const topRated = (recentMovies.length ? recentMovies : movies)
    .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
    .slice(0, 10);

  renderTopRatedCarousel(topRated);
  renderRandomMovies();

/* Pick a random movie from the top-rated pool so the hero rotates each visit
  const heroPool  = topRated.length ? topRated : movies.slice(0, 10);
  const heroMovie = heroPool[Math.floor(Math.random() * heroPool.length)];
  await renderHero(heroMovie, currentWatchlistIds); */
    const heroMovie = topRated[0] || movies[0];
  await renderHero(heroMovie, currentWatchlistIds);

  renderGrid(movies, currentWatchlistIds, isStaff);
  document.getElementById('loadMoreBtn').style.display = hasNextPage ? 'block' : 'none';

  // Card click delegation
  document.getElementById('movieGrid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.movie-card');
    if (card?.dataset.movie) { try { openModal(JSON.parse(card.dataset.movie)); } catch {} }
  });
  document.getElementById('topRatedCarousel')?.addEventListener('click', (e) => {
    const card = e.target.closest('.carousel-card');
    if (card?.dataset.movie) { try { openModal(JSON.parse(card.dataset.movie)); } catch {} }
  });
  document.getElementById('randomMoviesGrid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.random-card');
    if (card?.dataset.movie) { try { openModal(JSON.parse(card.dataset.movie)); } catch {} }
  });

  // Search
  let searchDebounce = null;
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      currentPage = 1;
      const data    = await fetchMovies(token, e.target.value.trim(), 1);
      const results = data.results || data;
      hasNextPage   = data.has_next;
      renderGrid(results, currentWatchlistIds, currentIsStaff);
      applyFilters();
      document.getElementById('loadMoreBtn').style.display = hasNextPage ? 'block' : 'none';
    }, 300);
  });

  // Load more
  document.getElementById('loadMoreBtn')?.addEventListener('click', async () => {
    const query = document.getElementById('searchInput').value.trim();
    const btn   = document.getElementById('loadMoreBtn');
    btn.disabled    = true;
    btn.textContent = 'LOADING...';
    currentPage++;
    const data = await fetchMovies(token, query, currentPage);
    appendGrid(data.results || data, currentWatchlistIds, currentIsStaff);
    applyFilters();
    hasNextPage = data.has_next;
    btn.style.display = hasNextPage ? 'block' : 'none';
    btn.disabled    = false;
    btn.textContent = 'LOAD MORE MOVIES';
  });
});

async function fetchRandomMoviesFromAPI() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/movies/?page=1&page_size=50',
      { headers: token ? { 'Authorization': `Token ${token}` } : {} });
    if (res.ok) {
      const data = await res.json();
      allMovies = data.results || data;
      renderRandomMovies();
    }
  } catch { renderRandomMovies(); }
}