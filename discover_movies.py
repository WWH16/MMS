import sqlite3
import requests
import time
import logging
import random
import dotenv

# --- CONFIGURATION ---
dotenv.load_dotenv()
TMDB_API_KEY = dotenv.get_key(dotenv.find_dotenv(), "TMDB_API_KEY")
DB_PATH = r'S:\PERSONAL PROJECTS\MMS\db.sqlite3'
IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500"
REQUEST_TIMEOUT = 10
MAX_RETRIES = 2

# --- LIMITS ---
INSERT_LIMIT = 100        # Max movies to insert in one run (configurable)
DISCOVER_YEAR = 2026      # Filter movies released this year (configurable)
TOTAL_PAGES_TO_SCAN = 20  # How many TMDB pages to pull from (each page = 20 movies)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

session = requests.Session()
session.params = {"api_key": TMDB_API_KEY}


# ---------------------------------------------------------------------------
# TMDB Helpers
# ---------------------------------------------------------------------------

def tmdb_get(endpoint: str, params: dict = {}) -> dict | None:
    """Generic TMDB GET with retry + rate-limit handling."""
    url = f"https://api.themoviedb.org/3{endpoint}"

    for attempt in range(1, MAX_RETRIES + 2):
        try:
            time.sleep(0.1)
            resp = session.get(url, params=params, timeout=REQUEST_TIMEOUT)

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", 5))
                log.warning(f"Rate limited. Sleeping {retry_after}s...")
                time.sleep(retry_after)
                continue

            resp.raise_for_status()
            return resp.json()

        except Exception as exc:
            if attempt > MAX_RETRIES:
                log.error(f"Request to {endpoint} failed after {MAX_RETRIES} retries: {exc}")
    return None


def discover_movies(year: int, pages: int) -> list[dict]:
    """
    Fetches movies from TMDB discover endpoint filtered by year.
    Pulls from multiple pages and shuffles for randomness.
    """
    all_results = []

    for page in range(1, pages + 1):
        data = tmdb_get("/discover/movie", {
            "primary_release_year": year,
            "sort_by": "popularity.desc",
            "page": page,
        })
        if data:
            all_results.extend(data.get("results", []))

    # Shuffle so we don't always get the same top movies
    random.shuffle(all_results)
    log.info(f"Discovered {len(all_results)} movies from TMDB for {year} (shuffled).")
    return all_results


def get_movie_details(tmdb_id: int) -> dict | None:
    return tmdb_get(f"/movie/{tmdb_id}")


def get_movie_keywords(tmdb_id: int) -> str:
    data = tmdb_get(f"/movie/{tmdb_id}/keywords")
    if data:
        return ", ".join(k["name"] for k in data.get("keywords", []))
    return ""


# ---------------------------------------------------------------------------
# DB Helpers
# ---------------------------------------------------------------------------

def is_duplicate(conn: sqlite3.Connection, title: str, release_date: str) -> bool:
    """Checks if a movie with the same title + release_date already exists."""
    cur = conn.execute(
        "SELECT 1 FROM accounts_movies WHERE title = ? AND release_date = ? LIMIT 1",
        (title, release_date),
    )
    return cur.fetchone() is not None


def insert_movie(conn: sqlite3.Connection, movie: dict) -> None:
    """Inserts a fully enriched movie row into accounts_movies."""
    conn.execute(
        """
        INSERT INTO accounts_movies (title, overview, genres, release_date, vote_average, tags, poster_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            movie["title"],
            movie["overview"],
            movie["genres"],
            movie["release_date"],
            movie["vote_average"],
            movie["tags"],
            movie["poster_url"],
        ),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Flow Helpers
# ---------------------------------------------------------------------------

def build_movie_data(details: dict, keywords: str) -> dict:
    genres = ", ".join(g["name"] for g in details.get("genres", []))
    poster_path = details.get("poster_path")
    return {
        "title":        details.get("title", ""),
        "overview":     details.get("overview", ""),
        "genres":       genres,
        "release_date": details.get("release_date", ""),
        "vote_average": details.get("vote_average", 0.0),
        "tags":         keywords,
        "poster_url":   f"{IMAGE_BASE_URL}{poster_path}" if poster_path else None,
    }


def print_summary_table(movies: list[dict]) -> None:
    print(f"\n  {'Title':<45} {'Release Date':<15} {'Rating'}")
    print(f"  {'-'*45} {'-'*15} {'-'*6}")
    for m in movies:
        print(f"  {m['title']:<45} {m['release_date']:<15} {m['vote_average']}")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    conn = sqlite3.connect(DB_PATH)

    try:
        # --- PHASE 1: Discover movies from TMDB ---
        log.info(f"Discovering {DISCOVER_YEAR} movies from TMDB...")
        candidates = discover_movies(DISCOVER_YEAR, TOTAL_PAGES_TO_SCAN)

        if not candidates:
            log.error("No movies returned from TMDB. Check your API key or network.")
            return

        # --- PHASE 2: Enrich + filter duplicates up to INSERT_LIMIT ---
        log.info(f"Filtering duplicates and enriching up to {INSERT_LIMIT} movies...\n")

        to_insert = []
        skipped_duplicates = 0
        skipped_no_data = 0

        for candidate in candidates:
            if len(to_insert) >= INSERT_LIMIT:
                break

            title = candidate.get("title", "")
            release_date = candidate.get("release_date", "")

            # Skip if already in DB
            if is_duplicate(conn, title, release_date):
                log.info(f"⏭️  Duplicate: '{title}' — skipping.")
                skipped_duplicates += 1
                continue

            # Fetch full details + keywords
            tmdb_id = candidate["id"]
            details = get_movie_details(tmdb_id)
            if not details:
                log.warning(f"❌ Could not fetch details for '{title}'. Skipping.")
                skipped_no_data += 1
                continue

            keywords = get_movie_keywords(tmdb_id)
            movie = build_movie_data(details, keywords)

            # Skip movies with no meaningful data
            if not movie["title"] or not movie["release_date"]:
                skipped_no_data += 1
                continue

            to_insert.append(movie)
            log.info(f"✅ Queued: '{movie['title']}' ({movie['release_date'][:4]})")

        if not to_insert:
            log.info("Nothing new to insert. All discovered movies already exist in your DB.")
            return

        # --- PHASE 3: Preview ---
        print(f"\n  Ready to insert {len(to_insert)} new movie(s):")
        print_summary_table(to_insert)

        # --- PHASE 4: Confirm & Insert ---
        answer = input(f"  Insert these {len(to_insert)} movies into the database? [y/N]: ").strip().lower()
        if answer != "y":
            log.info("Aborted. No changes were made.")
            return

        inserted = 0
        for movie in to_insert:
            insert_movie(conn, movie)
            inserted += 1

        log.info("---------------------------------------------------------")
        log.info(f"COMPLETED.")
        log.info(f"Inserted          : {inserted}")
        log.info(f"Skipped (dupes)   : {skipped_duplicates}")
        log.info(f"Skipped (no data) : {skipped_no_data}")
        log.info("---------------------------------------------------------")

    finally:
        conn.close()


if __name__ == "__main__":
    main()