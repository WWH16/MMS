/**
 * homeFeed.js — Browse page logic
 * Depends on: base.js (PLACEHOLDER, getPoster, parseGenre, toggleWatchlist, showToast)
 */

let heroMovieId = null;
let currentPage = 1;
let hasNextPage  = false;
let currentWatchlistIds = new Set();
let allMovies = [];

async function openModal(movie) {
  openSharedModal(movie, currentWatchlistIds, (movieId, nowInList) => {
    if (nowInList) currentWatchlistIds.add(movieId);
    else currentWatchlistIds.delete(movieId);
    _syncCardButtons(movieId, nowInList);
  });
}

function closeModal() {
  closeSharedModal();
}

function _syncCardButtons(movieId, inList) {
  document.querySelectorAll(`[data-movie-id="${movieId}"] .watchlist-btn`).forEach(btn => {
    btn.dataset.inList = inList;
    btn.textContent = inList ? '✓ SAVED' : '+ SAVE';
  });
}

// ─── Render helpers ───────────────────────────────────────────────
function renderMovieCardTemplate(movie, watchlistIds) {
  const rating     = movie.vote_average ? parseFloat(movie.vote_average).toFixed(1) : '0.0';
  const genre      = parseGenre(movie);
  const poster     = getPoster(movie);
  const year       = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
  const inList     = watchlistIds.has(movie.movie_id);
  const movieData  = JSON.stringify(movie).replace(/'/g, "&apos;");
  const isPlaceholder = !movie.poster_url || movie.poster_url === 'None' || movie.poster_url === 'nan';
  const imgClass   = isPlaceholder ? 'w-full h-full object-cover poster-placeholder-small' : 'w-full h-full object-cover';

  return `
    <div class="movie-card group relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-container-low transition-all duration-500 hover:scale-[1.03] hover:z-20 cursor-pointer"
         data-movie='${movieData}'
         data-title="${movie.title}" data-genre="${genre}" data-rating="${rating}">
      <img class="${imgClass}" src="${poster}" alt="${movie.title}" loading="lazy"
           onerror="this.src=window.PLACEHOLDER; this.classList.add('poster-placeholder-small')" />
      <div class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
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

function renderGrid(movies, watchlistIds) {
  const grid = document.getElementById('movieGrid');
  if (grid) grid.innerHTML = movies.map(m => renderMovieCardTemplate(m, watchlistIds)).join('');
}

function appendGrid(movies, watchlistIds) {
  const grid = document.getElementById('movieGrid');
  if (grid) grid.insertAdjacentHTML('beforeend', movies.map(m => renderMovieCardTemplate(m, watchlistIds)).join(''));
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
  
  const heroContent = document.getElementById('heroContent');
  if (heroContent) {
    heroContent.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    heroContent.style.opacity = '0';
    heroContent.style.transform = 'translateY(10px)';
  }

  heroMovieId = movie.movie_id;
  const rating = parseFloat(movie.vote_average || 0).toFixed(1);
  const year   = movie.release_date?.split('-')[0] || 'N/A';

  const titleEl    = document.getElementById('heroTitle');
  const overviewEl = document.getElementById('heroOverview');
  const metaEl     = document.getElementById('heroMeta');
  const imgEl      = document.getElementById('heroImg');

  // Fetch backdrop first to prevent flickering
  let backdropUrl = getPoster(movie);
  try {
    const res  = await fetch(`/api/tmdb-backdrop/?movie_id=${encodeURIComponent(movie.movie_id)}&title=${encodeURIComponent(movie.title)}`);
    const data = await res.json();
    if (data.backdrop_url) backdropUrl = data.backdrop_url;
  } catch {}

  // After brief delay or backdrop load, update and fade in
  setTimeout(() => {
    if (titleEl)    titleEl.textContent    = movie.title.toUpperCase();
    if (overviewEl) overviewEl.textContent = movie.overview || '';
    if (metaEl)     metaEl.textContent     = `${parseGenre(movie)} • ${year} • ⭐ ${rating}`;
    if (imgEl)      imgEl.src              = backdropUrl;

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
// After setting overviewEl.textContent:
const readMoreBtn = document.getElementById('heroReadMoreBtn');
const readMoreLabel = document.getElementById('heroReadMoreLabel');
const readMoreIcon = document.getElementById('heroReadMoreIcon');

if (readMoreBtn && overviewEl) {
  // Reset state on hero change
  overviewEl.classList.add('line-clamp-3', 'md:line-clamp-4');
  readMoreBtn.dataset.expanded = 'false';
  readMoreLabel.textContent = 'Read more';
  readMoreIcon.textContent = 'expand_more';

  // Show button only if text is actually clamped
  requestAnimationFrame(() => {
    const isClamped = overviewEl.scrollHeight > overviewEl.clientHeight;
    readMoreBtn.classList.toggle('hidden', !isClamped);
  });

  readMoreBtn.onclick = () => {
    const expanded = readMoreBtn.dataset.expanded === 'true';
    if (expanded) {
      overviewEl.classList.add('line-clamp-3', 'md:line-clamp-4');
      readMoreLabel.textContent = 'Read more';
      readMoreIcon.textContent = 'expand_more';
      readMoreBtn.dataset.expanded = 'false';
    } else {
      overviewEl.classList.remove('line-clamp-3', 'md:line-clamp-4');
      readMoreLabel.textContent = 'Show less';
      readMoreIcon.textContent = 'expand_less';
      readMoreBtn.dataset.expanded = 'true';
    }
  };
}
    const recBtn = document.getElementById('heroRecommendBtn');
    if (recBtn) recBtn.onclick = () => handleRecommend(movie.title);

    // Watch button
    const heroButtonsContainer = document.querySelector('.flex.gap-3.md\\:gap-4.items-center.flex-wrap');
    if (heroButtonsContainer) {
      const existingHeroWatch = document.getElementById('heroWatchBtn');
      if (existingHeroWatch) existingHeroWatch.remove();
      const heroWatchBtn = document.createElement('button');
      heroWatchBtn.id = 'heroWatchBtn';
      heroWatchBtn.className = 'bg-green-600 text-white px-10 py-3 rounded-lg font-headline font-bold flex items-center gap-2 hover:bg-green-700 active:scale-95 transition-all';
      heroWatchBtn.innerHTML = `<span class="material-symbols-outlined text-sm">play_circle</span> Watch Trailer`;
      heroWatchBtn.onclick = () => handleWatch(movie.title, year !== 'N/A' ? year : null);
      if (recBtn) heroButtonsContainer.insertBefore(heroWatchBtn, recBtn);
      else heroButtonsContainer.appendChild(heroWatchBtn);
    }

    if (heroContent) {
      heroContent.style.opacity = '1';
      heroContent.style.transform = 'translateY(0)';
    }
  }, 300);
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
  const token   = window.getAuthToken();
  if (!token) { window.location.href = '/signin/'; return; }
  
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

  // Shuffle button
  const shuffleBtn = document.getElementById('heroShuffleBtn');
  if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
      const heroPool = topRated.length ? topRated : movies.slice(0, 10);
      const randomMovie = heroPool[Math.floor(Math.random() * heroPool.length)];
      renderHero(randomMovie, currentWatchlistIds);
    });
  }

  // Initial hero
  const heroPool  = topRated.length ? topRated : movies.slice(0, 10);
  const heroMovie = heroPool[Math.floor(Math.random() * heroPool.length)];
  await renderHero(heroMovie, currentWatchlistIds);

  renderGrid(movies, currentWatchlistIds);
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
      renderGrid(results, currentWatchlistIds);
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
    appendGrid(data.results || data, currentWatchlistIds);
    applyFilters();
    hasNextPage = data.has_next;
    btn.style.display = hasNextPage ? 'block' : 'none';
    btn.disabled    = false;
    btn.textContent = 'LOAD MORE MOVIES';
  });
});

async function fetchRandomMoviesFromAPI() {
  try {
    const token = window.getAuthToken();
    const res = await fetch('/api/movies/?page=1&page_size=50',
      { headers: token ? { 'Authorization': `Token ${token}` } : {} });
    if (res.ok) {
      const data = await res.json();
      allMovies = data.results || data;
      renderRandomMovies();
    }
  } catch { renderRandomMovies(); }
}