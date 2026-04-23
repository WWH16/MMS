/**
 * myList.js — Watchlist page logic
 * Depends on: base.js
 */

let pendingRemoveId = null;

function openRemoveModal(movieId, movieTitle) {
  pendingRemoveId = movieId;
  document.getElementById('removeModalText').textContent = `"${movieTitle}" will be removed from your list.`;
  const modal = document.getElementById('removeModal');
  const card  = document.getElementById('removeModalCard');
  modal.classList.remove('opacity-0', 'invisible');
  modal.classList.add('opacity-100', 'visible');
  card.classList.remove('scale-95');
  card.classList.add('scale-100');
  document.body.style.overflow = 'hidden';
}
window.openRemoveModal = openRemoveModal;

function closeRemoveModal() {
  pendingRemoveId = null;
  const modal = document.getElementById('removeModal');
  const card  = document.getElementById('removeModalCard');
  modal.classList.add('opacity-0', 'invisible');
  modal.classList.remove('opacity-100', 'visible');
  card.classList.add('scale-95');
  card.classList.remove('scale-100');
  document.body.style.overflow = '';
}

async function doRemove(movieId) {
  const token = window.getAuthToken();
  if (!token) { window.location.href = '/signin/'; return; }

  try {
    const res = await fetch('/api/watchlist/', {
      method:  'DELETE',
      headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ movie_id: movieId })
    });
    if (res.ok || res.status === 204) {
      showToast('Removed from your list', 'remove');
      await fetchWatchlist();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Could not remove movie', 'remove');
    }
  } catch {
    showToast('Network error — please try again', 'remove');
  }
}

async function fetchWatchlist() {
  const token = window.getAuthToken();
  const grid  = document.getElementById('movieGrid');

  grid.innerHTML = `
    <div class="col-span-full flex justify-center py-20">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>`;

  try {
    const res = await fetch('/api/watchlist/', {
      headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' }
    });
    if (res.ok) {
      renderMovies(await res.json());
    } else if (res.status === 401) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/signin/';
    } else {
      renderMovies([]);
    }
  } catch { renderMovies([]); }
}

function renderMovies(watchlistItems) {
  const grid = document.getElementById('movieGrid');

  if (!watchlistItems?.length) {
    grid.innerHTML = `
      <div class="col-span-full py-20 text-center">
        <span class="material-symbols-outlined text-6xl text-outline-variant mb-4 block">movie_filter</span>
        <p class="text-xl font-headline text-on-surface-variant mb-2">Your list is empty.</p>
        <p class="text-neutral-500 font-body text-sm mb-6">Save movies from the browse page to build your taste profile.</p>
        <a href="/homeFeed/" class="bg-primary-container text-on-primary-container px-6 py-3 rounded-lg font-headline font-bold hover:brightness-110 transition-all inline-block">Browse Movies</a>
      </div>`;
    return;
  }

  const html = watchlistItems.map(item => {
    const movie     = item.movie_details || item.movie;
    const year      = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
    const poster    = getPoster(movie);
    const rating    = movie.vote_average ? parseFloat(movie.vote_average).toFixed(1) : '0.0';
    const safeTitle = movie.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');

    return `
      <div class="group cursor-pointer">
        <div class="aspect-[2/3] rounded-xl overflow-hidden mb-4 bg-surface-container-low relative transition-transform duration-500 ease-out group-hover:scale-[1.02]">
          <img src="${poster}" alt="${movie.title}" class="w-full h-full object-cover"
               onerror="this.src=window.PLACEHOLDER" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 gap-2">
            <button onclick="event.stopPropagation(); window.location.href='/recommendations/?title=${encodeURIComponent(movie.title)}'"
              class="bg-primary-container text-on-primary-container w-full py-2 rounded-lg font-bold text-sm hover:brightness-110 transition-all flex items-center justify-center gap-1">
              <span class="material-symbols-outlined text-sm">auto_awesome</span> Find Similar
            </button>
            <button onclick="event.stopPropagation(); openRemoveModal('${movie.movie_id}', '${safeTitle}')"
              class="bg-surface-bright/80 backdrop-blur-md text-white w-full py-2 rounded-lg font-medium text-xs hover:bg-red-600 transition-all">
              Remove
            </button>
          </div>
        </div>
        <div class="space-y-1" onclick="window.location.href='/recommendations/?title=${encodeURIComponent(movie.title)}'">
          <h3 class="font-bold font-headline text-base group-hover:text-primary transition-colors line-clamp-1">${movie.title}</h3>
          <div class="flex items-center gap-3 text-xs font-label text-on-surface-variant">
            <span>${year}</span>
            <span class="w-1 h-1 rounded-full bg-outline-variant"></span>
            <div class="flex items-center gap-1">
              <span class="material-symbols-outlined text-[14px] text-primary" style="font-variation-settings: 'FILL' 1">star</span>
              <span class="text-on-surface font-medium">${rating}</span>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  grid.innerHTML = html + `
    <div class="group">
      <a href="/homeFeed/" class="w-full aspect-[2/3] rounded-xl border-2 border-dashed border-outline-variant/30 flex flex-col items-center justify-center gap-4 bg-surface-container-lowest hover:bg-surface-container-low transition-all">
        <div class="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center group-hover:bg-primary-container transition-colors">
          <span class="material-symbols-outlined text-on-surface">add</span>
        </div>
        <span class="font-bold font-headline text-on-surface-variant text-sm">Browse More</span>
      </a>
    </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  const token = window.getAuthToken();
  if (!token) { window.location.href = '/signin/'; return; }

  document.getElementById('removeCancelBtn')?.addEventListener('click', closeRemoveModal);
  document.getElementById('removeConfirmBtn')?.addEventListener('click', async () => {
    if (!pendingRemoveId) return;
    const btn = document.getElementById('removeConfirmBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">progress_activity</span> Removing...';
    await doRemove(pendingRemoveId);
    btn.disabled = false;
    btn.innerHTML = 'Remove';
    closeRemoveModal();
  });

  document.getElementById('removeModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'removeModal') closeRemoveModal();
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeRemoveModal(); });

  fetchWatchlist();
});