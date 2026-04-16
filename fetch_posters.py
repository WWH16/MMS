import sqlite3
import requests
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

# --- CONFIGURATION ---
TMDB_API_KEY = "e80b33baba3ab3033b4d532f6c0c7b0f"
DB_PATH = r'S:\PERSONAL PROJECTS\MMS\db.sqlite3'
IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500"

# Worker threads — TMDB allows ~40 req/10s; 8 threads with 0.2s sleep ≈ 40 req/10s
MAX_WORKERS = 8
BATCH_SIZE = 50         # Commit to DB every N rows
REQUEST_TIMEOUT = 8     # Seconds before giving up on a slow TMDB response
MAX_RETRIES = 2         # Retry failed requests this many times

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# --- Shared session (connection pooling + keep-alive) ---
session = requests.Session()
session.params = {"api_key": TMDB_API_KEY}  # Attached to every request automatically

db_lock = Lock()  # Serialises DB writes from multiple threads


# ---------------------------------------------------------------------------
# TMDB
# ---------------------------------------------------------------------------

def fetch_poster_url(movie_title: str) -> str | None:
    """Return the full poster URL for *movie_title*, or None on failure."""
    url = "https://api.themoviedb.org/3/search/movie"

    for attempt in range(1, MAX_RETRIES + 2):  # +2 = initial try + retries
        try:
            resp = session.get(url, params={"query": movie_title}, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            results = resp.json().get("results")
            if results:
                poster_path = results[0].get("poster_path")
                if poster_path:
                    return f"{IMAGE_BASE_URL}{poster_path}"
            return None  # Valid response, just no poster
        except requests.exceptions.Timeout:
            log.warning("Timeout on '%s' (attempt %d/%d)", movie_title, attempt, MAX_RETRIES + 1)
        except requests.exceptions.HTTPError as exc:
            if exc.response.status_code == 429:
                # Rate-limited — back off and retry
                retry_after = int(exc.response.headers.get("Retry-After", 5))
                log.warning("Rate-limited. Waiting %ds…", retry_after)
                time.sleep(retry_after)
            else:
                log.error("HTTP %s for '%s'", exc.response.status_code, movie_title)
                return None
        except Exception as exc:
            log.error("Error fetching '%s': %s", movie_title, exc)
            return None

    return None  # All retries exhausted


# ---------------------------------------------------------------------------
# Worker
# ---------------------------------------------------------------------------

def process_movie(movie_id: int, title: str) -> tuple[int, str | None]:
    """Fetch poster URL for one movie. Returns (movie_id, poster_url or None)."""
    poster_url = fetch_poster_url(title)
    status = "✅" if poster_url else "❌"
    log.info("%s %s", status, title)
    return movie_id, poster_url


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def load_pending(conn: sqlite3.Connection) -> list[tuple[int, str]]:
    cur = conn.execute(
        "SELECT movie_id, title FROM accounts_movies WHERE poster_url IS NULL OR poster_url = ''"
    )
    return cur.fetchall()


def flush_batch(conn: sqlite3.Connection, batch: list[tuple[str, int]]) -> None:
    """Write a batch of (poster_url, movie_id) rows and commit."""
    with db_lock:
        conn.executemany(
            "UPDATE accounts_movies SET poster_url = ? WHERE movie_id = ?",
            batch,
        )
        conn.commit()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def update_database() -> None:
    conn = sqlite3.connect(DB_PATH)

    movies = load_pending(conn)
    total = len(movies)
    log.info("Found %d movies without posters — starting %d workers…", total, MAX_WORKERS)

    if not movies:
        log.info("Nothing to do.")
        conn.close()
        return

    found = skipped = 0
    pending_writes: list[tuple[str, int]] = []

    t0 = time.perf_counter()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(process_movie, mid, title): (mid, title) for mid, title in movies}

        for future in as_completed(futures):
            movie_id, poster_url = future.result()

            if poster_url:
                found += 1
                pending_writes.append((poster_url, movie_id))
            else:
                skipped += 1

            # Flush to DB in batches to avoid holding a massive in-memory list
            if len(pending_writes) >= BATCH_SIZE:
                flush_batch(conn, pending_writes)
                pending_writes.clear()

    # Final flush
    if pending_writes:
        flush_batch(conn, pending_writes)

    conn.close()

    elapsed = time.perf_counter() - t0
    log.info(
        "Done in %.1fs — %d/%d posters fetched, %d not found.",
        elapsed, found, total, skipped,
    )


if __name__ == "__main__":
    update_database()