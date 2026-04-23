/**
 * recommendations.js — Recommendations page logic
 * Depends on: base.js
 */

let recsWatchlistIds = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  const token    = window.getAuthToken();
  if (!token) { window.location.href = '/signin/'; return; }

  const username = window.getAuthUser();
  document.querySelectorAll('#userDisplay').forEach(el => el.textContent = username);

  const params = new URLSearchParams(window.location.search);
  const title  = params.get('title');

  if (!title?.trim()) {
    showSearchPrompt();
    return;
  }

  await loadRecommendations(title, token);
});

function showSearchPrompt() {
  document.getElementById('resultsHeader')?.classList.add('hidden');
  document.getElementById('resultsGrid')?.classList.add('hidden');
  document.getElementById('seedSection')?.classList.add('hidden');
  document.querySelector('.mt-20.bg-surface-container-high')?.classList.add('hidden');

  const emptyState = document.getElementById('emptyState');
  emptyState?.classList.remove('hidden');
  emptyState?.classList.add('flex');
  document.getElementById('promptSearchInput')?.focus();
}

window.searchFromPrompt = function() {
  const val = document.getElementById('promptSearchInput')?.value.trim();
  if (val) window.location.href = `/recommendations/?title=${encodeURIComponent(val.toLowerCase())}`;
};

window.searchNew = function() {
  const title = document.getElementById('newSearchInput')?.value.trim();
  if (title) window.location.href = `/recommendations/?title=${encodeURIComponent(title.toLowerCase())}`;
};

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.activeElement?.id === 'promptSearchInput') window.searchFromPrompt();
    if (document.activeElement?.id === 'newSearchInput')    window.searchNew();
  }
});

async function loadRecommendations(title, token) {
  try {
    const res  = await fetch(`/api/recommend/?title=${encodeURIComponent(title)}`,
      { headers: token ? { 'Authorization': `Token ${token}` } : {} });
    const data = await res.json();

    if (!res.ok) { showEmpty(data.message || null); return; }

    if (data.seed) renderSeed(data.seed);
    if (!data.recommendations?.length) { showEmpty(); return; }

    const watchlistIds = await fetchWatchlistIds(token);
    renderResults(data.recommendations, watchlistIds);

  } catch (err) {
    console.error(err);
    showEmpty();
  }
}

async function fetchWatchlistIds(token) {
  if (!token) return new Set();
  try {
    const res = await fetch('/api/watchlist/', { headers: { 'Authorization': `Token ${token}` } });
    if (!res.ok) return new Set();
    const data = await res.json();
    return new Set(data.map(item => {
      const m = item.movie_details || item.movie;
      return m ? (typeof m === 'object' ? m.movie_id : m) : null;
    }).filter(Boolean));
  } catch { return new Set(); }
}

function renderSeed(movie) {
  const year   = movie.release_date ? movie.release_date.split('-')[0] : '';
  const genre  = Array.isArray(movie.genres_list) ? movie.genres_list[0] : (movie.genres || '');
  const rating = movie.vote_average ? parseFloat(movie.vote_average).toFixed(1) : 'N/A';

  const posterEl = document.getElementById('seedPoster');
  if (posterEl) {
    posterEl.src    = getPoster(movie);
    posterEl.alt    = movie.title;
    posterEl.onerror = () => { posterEl.src = window.PLACEHOLDER; };
  }
  document.getElementById('seedTitle').textContent   = movie.title;
  document.getElementById('seedMeta').textContent    = [genre, year, `⭐ ${rating}`].filter(Boolean).join(' • ');
  document.getElementById('seedOverview').textContent = movie.overview || '';
  
  // Add buttons to seed card
  const seedCard = document.getElementById('seedCard');
  if (seedCard) {
    const existingButtons = document.getElementById('seedButtons');
    if (existingButtons) existingButtons.remove();
    
    const inList = recsWatchlistIds.has(movie.movie_id);
    const buttons = document.createElement('div');
    buttons.id = 'seedButtons';
    buttons.className = 'flex flex-wrap gap-3 mt-4';
    buttons.innerHTML = `
      <button id="seedWatchBtn" class="bg-green-600 text-white px-6 py-2 rounded-lg font-headline font-bold text-xs flex items-center gap-2 hover:bg-green-700 active:scale-95 transition-all">
        <span class="material-symbols-outlined text-base">play_circle</span> Watch Trailer
      </button>
      <button id="seedWatchlistBtn" data-in-list="${inList}" class="px-6 py-2 rounded-lg font-headline font-bold text-xs flex items-center gap-2 transition-all active:scale-95 ${
        inList ? 'bg-surface-bright text-on-surface' : 'bg-primary-container text-on-primary-container hover:brightness-110'
      }">
        <span class="material-symbols-outlined text-base">${inList ? 'bookmark_added' : 'bookmark'}</span> ${inList ? 'SAVED' : 'ADD TO LIST'}
      </button>
    `;
    
    const overviewEl = document.getElementById('seedOverview');
    overviewEl.parentNode.appendChild(buttons);
    
    document.getElementById('seedWatchBtn').onclick = () => window.handleWatch(movie.title, year);
    const watchlistBtn = document.getElementById('seedWatchlistBtn');
    watchlistBtn.onclick = () => window.toggleWatchlist(watchlistBtn, movie.movie_id, {
      onSuccess: (nowInList) => {
        if (nowInList) recsWatchlistIds.add(movie.movie_id);
        else recsWatchlistIds.delete(movie.movie_id);
        // Sync button text/icon manually since toggleWatchlist generic logic is for cards
        watchlistBtn.innerHTML = nowInList
          ? `<span class="material-symbols-outlined text-base">bookmark_added</span> SAVED`
          : `<span class="material-symbols-outlined text-base">bookmark</span> ADD TO LIST`;
      }
    });
  }

  document.getElementById('seedSection')?.classList.remove('hidden');
  document.getElementById('resultSubtitle').textContent = `Films similar to ${movie.title}`;
}

function renderResults(movies, watchlistIds) {
  const grid = document.getElementById('resultsGrid');
  grid?.classList.remove('hidden');

  recsWatchlistIds = watchlistIds instanceof Set ? watchlistIds : new Set(watchlistIds);
  grid.innerHTML = movies.map(movie => {
    const poster = getPoster(movie);
    const year   = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
    const genre  = Array.isArray(movie.genres_list) ? movie.genres_list[0] : (movie.genres || '');
    const rating = movie.vote_average ? parseFloat(movie.vote_average).toFixed(1) : 'N/A';
    const inList = recsWatchlistIds.has(movie.movie_id);

    const movieData = JSON.stringify(movie).replace(/'/g, "&apos;");
    return `
      <div class="group relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-container-low transition-all duration-500 hover:scale-[1.03] hover:z-20 cursor-pointer"
           data-movie='${movieData}'
           onclick="_recsCardClick(this, event)">
        <img class="w-full h-full object-cover" src="${poster}" alt="${movie.title}" loading="lazy"
             onerror="this.src=window.PLACEHOLDER" />
        <div class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div class="absolute bottom-0 left-0 w-full p-4 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 space-y-2">
          <p class="text-white font-headline font-bold truncate text-sm">${movie.title.toUpperCase()}</p>
          <p class="text-neutral-400 text-[10px] font-label">${genre} • ${year} • ⭐ ${rating}</p>
          <div class="flex gap-2">
            <button onclick="event.stopPropagation(); window.location.href='/recommendations/?title=${encodeURIComponent(movie.title.toLowerCase())}'"
              class="flex-1 py-2 rounded-lg font-headline font-bold text-[10px] bg-surface-bright/80 text-white hover:bg-surface-bright transition-all flex items-center justify-center gap-1">
              <span class="material-symbols-outlined text-sm">auto_awesome</span>SIMILAR
            </button>
            <button onclick="event.stopPropagation(); _recsWatchlistClick(this, '${movie.movie_id}')"
              data-in-list="${inList}"
              class="watchlist-btn flex-1 py-2 rounded-lg font-headline font-bold text-[10px] transition-all ${
                inList ? 'bg-surface-bright/80 text-on-surface' : 'bg-primary-container text-on-primary-container hover:brightness-110'
              }">
              ${inList ? '✓ SAVED' : '+ SAVE'}
            </button>
          </div>
        </div>
      </div>`;
  }).join('');
}

window._recsCardClick = function(card, event) {
  if (event.target.closest('button')) return;
  try {
    const movie = JSON.parse(card.dataset.movie);
    openSharedModal(movie, recsWatchlistIds, (movieId, nowInList) => {
      if (nowInList) recsWatchlistIds.add(movieId);
      else recsWatchlistIds.delete(movieId);
      // sync the card button
      const btn = card.querySelector('.watchlist-btn');
      if (btn) {
        btn.dataset.inList = nowInList;
        btn.textContent = nowInList ? '✓ SAVED' : '+ SAVE';
      }
    });
  } catch(e) { console.error(e); }
};

window._recsWatchlistClick = function(btn, movieId) {
  const token = window.getAuthToken();
  if (!token) { window.location.href = '/signin/'; return; }

  window.toggleWatchlist(btn, movieId, {
    onSuccess: (nowInList) => {
      // Button text updated inside toggleWatchlist
    }
  });
};

function showEmpty(message = null) {
  document.getElementById('resultsGrid')?.classList.add('hidden');
  document.getElementById('seedSection')?.classList.add('hidden');

  const emptyState = document.getElementById('emptyState');
  if (message) {
    const msgEl = emptyState?.querySelector('p');
    if (msgEl) msgEl.textContent = message;
  }
  emptyState?.classList.remove('hidden');
}

// ─── Search suggestions ───────────────────────────────────────────
let debounceTimer;
const searchInput    = document.getElementById('newSearchInput');
const suggestionsList = document.getElementById('suggestionsList');

searchInput?.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const q = searchInput.value.trim();
  if (q.length < 2) { suggestionsList?.classList.add('hidden'); return; }

  debounceTimer = setTimeout(async () => {
    try {
      const res  = await fetch(`/api/suggestions/?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!data.length) { suggestionsList?.classList.add('hidden'); return; }
      suggestionsList.innerHTML = data.map(m => `
        <li class="px-4 py-2.5 text-sm font-label text-on-surface hover:bg-surface-container-highest cursor-pointer transition-colors"
            onclick="selectSuggestion('${m.title.replace(/'/g, "\\'")}')">
          ${m.title}
        </li>`).join('');
      suggestionsList?.classList.remove('hidden');
    } catch (err) { console.error(err); }
  }, 300);
});

window.selectSuggestion = function(title) {
  if (searchInput) searchInput.value = title;
  suggestionsList?.classList.add('hidden');
  window.location.href = `/recommendations/?title=${encodeURIComponent(title.toLowerCase())}`;
};

document.addEventListener('click', e => {
  if (!searchInput?.contains(e.target)) suggestionsList?.classList.add('hidden');
});