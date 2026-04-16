import sqlite3
import requests
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

import dotenv

# --- CONFIGURATION ---
dotenv.load_dotenv()
TMDB_API_KEY = dotenv.get_key(dotenv.find_dotenv(), "TMDB_API_KEY")
DB_PATH = r'S:\PERSONAL PROJECTS\MMS\db.sqlite3'
IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500"

MAX_WORKERS = 8
BATCH_SIZE = 50
REQUEST_TIMEOUT = 10
MAX_RETRIES = 2

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

session = requests.Session()
session.params = {"api_key": TMDB_API_KEY}

db_lock = Lock()


# ---------------------------------------------------------------------------
# PHASE 1 — Identify missing posters
# ---------------------------------------------------------------------------

def load_pending(conn: sqlite3.Connection) -> list[tuple[int, str]]:
    """Returns movies where poster_url is missing or contains junk values."""
    query = """
        SELECT movie_id, title
        FROM accounts_movies
        WHERE poster_url IS NULL
           OR poster_url = ''
           OR poster_url = 'None'
           OR poster_url = 'nan'
           OR poster_url LIKE ' %'
    """
    cur = conn.execute(query)
    return cur.fetchall()


def preview_missing(conn: sqlite3.Connection) -> list[tuple[int, str]]:
    """
    PHASE 1: Queries the DB and prints a summary of all movies
    that are missing a poster. Returns the list for use in Phase 2.
    """
    movies = load_pending(conn)
    total = len(movies)

    if not movies:
        log.info("✅ No missing posters found. Database is fully populated.")
        return []

    log.info(f"Found {total} movie(s) with no poster:\n")
    print(f"  {'ID':<8} {'Title'}")
    print(f"  {'-'*8} {'-'*40}")
    for movie_id, title in movies:
        print(f"  {movie_id:<8} {title}")

    print(f"\n  Total: {total} movie(s) missing a poster.\n")
    return movies


# ---------------------------------------------------------------------------
# PHASE 2 — Fetch and save posters
# ---------------------------------------------------------------------------

def fetch_poster_url(movie_title: str) -> str | None:
    """Calls TMDB search API and returns the poster URL for a movie title."""
    url = "https://api.themoviedb.org/3/search/movie"

    for attempt in range(1, MAX_RETRIES + 2):
        try:
            time.sleep(0.1)  # Gentle throttle per worker to avoid 429s
            resp = session.get(url, params={"query": movie_title}, timeout=REQUEST_TIMEOUT)

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", 5))
                log.warning(f"Rate limited. Sleeping {retry_after}s...")
                time.sleep(retry_after)
                continue

            resp.raise_for_status()
            results = resp.json().get("results")
            if results:
                poster_path = results[0].get("poster_path")
                if poster_path:
                    return f"{IMAGE_BASE_URL}{poster_path}"
            return None

        except Exception as exc:
            if attempt > MAX_RETRIES:
                log.error(f"Failed '{movie_title}' after {MAX_RETRIES} retries: {exc}")
    return None


def process_movie(movie_id: int, title: str) -> tuple[int, str | None]:
    poster_url = fetch_poster_url(title)
    status = "✅" if poster_url else "❌"
    log.info(f"{status} {title}")
    return movie_id, poster_url


def flush_batch(conn: sqlite3.Connection, batch: list[tuple[str, int]]) -> None:
    with db_lock:
        conn.executemany(
            "UPDATE accounts_movies SET poster_url = ? WHERE movie_id = ?",
            batch,
        )
        conn.commit()
        log.info(f"--- Saved batch of {len(batch)} posters to database ---")


def fetch_and_save(conn: sqlite3.Connection, movies: list[tuple[int, str]]) -> None:
    """
    PHASE 2: Fetches poster URLs from TMDB for all given movies
    and saves them to the database in batches.
    """
    total = len(movies)
    log.info(f"Starting fetch for {total} movie(s) with {MAX_WORKERS} workers...\n")

    found = skipped = 0
    pending_writes = []
    t0 = time.perf_counter()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {
            pool.submit(process_movie, mid, title): (mid, title)
            for mid, title in movies
        }

        for future in as_completed(futures):
            movie_id, poster_url = future.result()

            if poster_url:
                found += 1
                pending_writes.append((poster_url, movie_id))
            else:
                skipped += 1

            if len(pending_writes) >= BATCH_SIZE:
                flush_batch(conn, pending_writes)
                pending_writes.clear()

    if pending_writes:
        flush_batch(conn, pending_writes)

    elapsed = time.perf_counter() - t0
    log.info("---------------------------------------------------------")
    log.info(f"COMPLETED in {elapsed / 60:.1f} minutes.")
    log.info(f"Total Processed : {total}")
    log.info(f"Posters Found   : {found}")
    log.info(f"Not Found       : {skipped}")
    log.info("---------------------------------------------------------")


# ---------------------------------------------------------------------------
# Main — Two-phase entry point
# ---------------------------------------------------------------------------

def main() -> None:
    conn = sqlite3.connect(DB_PATH)

    try:
        # --- PHASE 1: Preview ---
        movies = preview_missing(conn)

        if not movies:
            return

        # --- Confirmation prompt ---
        answer = input("Proceed to fetch posters for the above movies? [y/N]: ").strip().lower()
        if answer != "y":
            log.info("Aborted. No changes were made.")
            return

        # --- PHASE 2: Fetch & Save ---
        print()
        fetch_and_save(conn, movies)

    finally:
        conn.close()


if __name__ == "__main__":
    main()