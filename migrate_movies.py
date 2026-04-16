import sqlite3
import logging

# --- CONFIGURATION ---
OLD_DB_PATH = r'S:\PERSONAL PROJECTS\MMS\moviedb.sqlite3'  # <--- UPDATE THIS
NEW_DB_PATH = r'S:\PERSONAL PROJECTS\MMS\db.sqlite3'

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)


def migrate():
    # 1. Connect to both databases
    try:
        old_conn = sqlite3.connect(OLD_DB_PATH)
        new_conn = sqlite3.connect(NEW_DB_PATH)
        old_cur = old_conn.cursor()
        new_cur = new_conn.cursor()

        # 2. Fetch data from old DB
        # Note: Update 'old_table_name' to whatever your 7k dataset table is called
        log.info("Fetching data from old database...")
        old_cur.execute(
            "SELECT title, overview, genres, release_date, vote_average, tags, poster_url FROM movieRecApp_movies")
        movies = old_cur.fetchall()

        # 3. Insert into the new accounts_movies table
        log.info(f"Found {len(movies)} movies. Inserting into new database...")

        insert_query = """
                       INSERT INTO accounts_movies (title, overview, genres, release_date, vote_average, tags, poster_url)
                       VALUES (?, ?, ?, ?, ?, ?, ?) \
                       """

        new_cur.executemany(insert_query, movies)
        new_conn.commit()

        log.info("Migration complete!")

    except Exception as e:
        log.error(f"Error during migration: {e}")
    finally:
        old_conn.close()
        new_conn.close()


if __name__ == "__main__":
    migrate()