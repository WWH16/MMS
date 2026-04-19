# enrich_movies.py
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

MAX_WORKERS = 15
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
db_lock = Lock()


def load_pending(conn: sqlite3.Connection) -> list[tuple]:
    """Load movies missing ANY enrichment field."""
    query = """
        SELECT movie_id, title
        FROM accounts_movies
        WHERE overview     IS NULL OR overview     = ''
           OR release_date IS NULL OR release_date = ''
           OR tagline      IS NULL OR tagline      = ''
           OR stars        IS NULL OR stars        = ''
           OR poster_url   IS NULL OR poster_url   = ''
                                   OR poster_url   = 'None'
                                   OR poster_url   = 'nan'
    """
    cur = conn.execute(query)
    return cur.fetchall()


def fetch_full_details(tmdb_id: int) -> dict:
    """Fetch tagline and top 5 cast from TMDB numeric ID."""
    result = {}
    try:
        detail_resp = session.get(
            f"https://api.themoviedb.org/3/movie/{tmdb_id}",
            params={"api_key": TMDB_API_KEY},
            timeout=REQUEST_TIMEOUT
        )
        if detail_resp.ok:
            data = detail_resp.json()
            result["tagline"] = data.get("tagline") or ""
            result["overview"] = data.get("overview") or ""

        credits_resp = session.get(
            f"https://api.themoviedb.org/3/movie/{tmdb_id}/credits",
            params={"api_key": TMDB_API_KEY},
            timeout=REQUEST_TIMEOUT
        )
        if credits_resp.ok:
            cast = credits_resp.json().get("cast", [])
            result["stars"] = ", ".join(m["name"] for m in cast[:5])

    except Exception as exc:
        log.warning(f"Failed full details for TMDB ID {tmdb_id}: {exc}")

    return result


def fetch_movie_details(movie_id: str) -> dict | None:
    """Main fetch: /find/ for basic info + full details for tagline & cast."""
    url = f"https://api.themoviedb.org/3/find/{movie_id}"
    params = {"api_key": TMDB_API_KEY, "external_source": "imdb_id"}

    for attempt in range(1, MAX_RETRIES + 2):
        try:
            resp = session.get(url, params=params, timeout=REQUEST_TIMEOUT)

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", 5))
                log.warning(f"Rate limited. Waiting {retry_after}s...")
                time.sleep(retry_after)
                continue

            if resp.status_code == 404:
                return None

            resp.raise_for_status()
            results = resp.json().get("movie_results", [])

            if not results:
                return None

            r = results[0]
            tmdb_id = r.get("id")
            details = fetch_full_details(tmdb_id) if tmdb_id else {}

            poster_path = r.get("poster_path")

            return {
                "poster_url":   f"{IMAGE_BASE_URL}{poster_path}" if poster_path else None,
                "overview":     details.get("overview") or r.get("overview") or "",
                "release_date": r.get("release_date") or "",
                "tagline":      details.get("tagline") or "",
                "stars":        details.get("stars") or "",
            }

        except Exception as exc:
            if attempt > MAX_RETRIES:
                log.error(f"Error {movie_id}: {exc}")
    return None


def process_movie(movie_id: str, title: str) -> tuple:
    details = fetch_movie_details(movie_id)
    status = "✅" if details else "❌"
    log.info(f"{status} [{movie_id}] {title}")
    return movie_id, details


def flush_batch(conn: sqlite3.Connection, batch: list) -> None:
    with db_lock:
        conn.executemany(
            """UPDATE accounts_movies
               SET poster_url   = COALESCE(NULLIF(poster_url,   ''), NULLIF(poster_url,   'None'), NULLIF(poster_url, 'nan'), ?),
                   overview     = COALESCE(NULLIF(overview,     ''), ?),
                   release_date = COALESCE(NULLIF(release_date, ''), ?),
                   tagline      = COALESCE(NULLIF(tagline,      ''), ?),
                   stars        = COALESCE(NULLIF(stars,        ''), ?)
               WHERE movie_id = ?""",
            batch,  # (poster_url, overview, release_date, tagline, stars, movie_id)
        )
        conn.commit()
        log.info(f"--- Saved batch of {len(batch)} ---")


def fetch_and_save(conn: sqlite3.Connection, movies: list) -> None:
    total = len(movies)
    log.info(f"Enriching {total} movies...\n")

    found = skipped = 0
    pending_writes = []
    t0 = time.perf_counter()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {
            pool.submit(process_movie, mid, title): mid
            for mid, title in movies
        }

        for future in as_completed(futures):
            movie_id, details = future.result()

            if details:
                found += 1
                pending_writes.append((
                    details.get("poster_url")   or "",
                    details.get("overview")     or "",
                    details.get("release_date") or "",
                    details.get("tagline")      or "",
                    details.get("stars")        or "",
                    movie_id,
                ))
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
    log.info(f"Enriched : {found} | Not Found : {skipped} | Total : {total}")
    log.info("---------------------------------------------------------")


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        movies = load_pending(conn)
        if not movies:
            log.info("✅ All movies already enriched.")
            return

        log.info(f"Found {len(movies)} movies needing enrichment.")
        log.info(f"First few: {movies[:3]}")
        answer = input("\nProceed? [y/N]: ").strip().lower()
        if answer == "y":
            fetch_and_save(conn, movies)
    finally:
        conn.close()


if __name__ == "__main__":
    main()