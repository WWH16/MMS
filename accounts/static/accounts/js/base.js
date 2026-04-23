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