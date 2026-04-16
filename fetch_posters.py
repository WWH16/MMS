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

MAX_WORKERS = 10  # Details endpoint is faster, we can bump this slightly
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
# We don't put api_key in session.params here because the URL structure is different
db_lock = Lock()


def load_pending(conn: sqlite3.Connection) -> list[tuple[int, str]]:
    query = """
            SELECT movie_id, title
            FROM accounts_movies
            WHERE poster_url IS NULL
               OR poster_url = ''
               OR poster_url = 'None'
               OR poster_url = 'nan' \
            """
    cur = conn.execute(query)
    return cur.fetchall()


# ---------------------------------------------------------------------------
# FIXED: Using /movie/{id} instead of /search/movie
# ---------------------------------------------------------------------------
def fetch_poster_by_id(movie_id: int) -> str | None:
    """Calls TMDB movie details API using the ID."""
    url = f"https://api.themoviedb.org/3/movie/{movie_id}"
    params = {"api_key": TMDB_API_KEY}

    for attempt in range(1, MAX_RETRIES + 2):
        try:
            # Direct ID lookup is much more reliable than text search
            resp = session.get(url, params=params, timeout=REQUEST_TIMEOUT)

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", 5))
                time.sleep(retry_after)
                continue

            if resp.status_code == 404:
                return None  # ID truly doesn't exist on TMDB

            resp.raise_for_status()
            data = resp.json()
            poster_path = data.get("poster_path")

            if poster_path:
                return f"{IMAGE_BASE_URL}{poster_path}"
            return None

        except Exception as exc:
            if attempt > MAX_RETRIES:
                log.error(f"Error ID {movie_id}: {exc}")
    return None


def process_movie(movie_id: int, title: str) -> tuple[int, str | None, str]:
    # We pass title just for the log message
    poster_url = fetch_poster_by_id(movie_id)
    status = "✅" if poster_url else "❌"
    log.info(f"{status} [{movie_id}] {title}")
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
    total = len(movies)
    log.info(f"Starting ID-based fetch for {total} movies...\n")

    found = skipped = 0
    pending_writes = []
    t0 = time.perf_counter()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {
            pool.submit(process_movie, mid, title): mid
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


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        movies = load_pending(conn)
        if not movies:
            log.info("✅ No missing posters found.")
            return

        log.info(f"Found {len(movies)} movies missing posters. First few: {movies[:3]}")
        answer = input("Proceed with ID-based fetch? [y/N]: ").strip().lower()
        if answer == "y":
            fetch_and_save(conn, movies)
    finally:
        conn.close()


if __name__ == "__main__":
    main()