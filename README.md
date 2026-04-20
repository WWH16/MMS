# ReelMatch 🎬

**ReelMatch** is an AI-powered movie recommendation web application built with Django and Django REST Framework. It uses a content-based filtering model trained on movie metadata (genres, directors, cast) to surface films you'll actually want to watch.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Setup & Movie Import](#database-setup--movie-import)
- [ML Model](#ml-model)
- [API Reference](#api-reference)
- [Pages & UI](#pages--ui)
- [Utility Scripts](#utility-scripts)
- [Roadmap](#roadmap)

---

## Features

- 🔐 **Token-based authentication** — sign up, sign in, sign out
- 🎬 **Browse movies** — paginated grid with genre & rating filters, search, and a hero section
- 🏆 **Top Rated carousel** — filtered to recent years, horizontally scrollable
- 🎲 **Discover section** — random selection refreshed on demand
- 🤖 **AI recommendations** — content-based cosine-similarity model on genres, directors, cast
- 📌 **Personal watchlist** — add/remove with instant toast feedback
- 🖼 **TMDB backdrop images** — real backdrops fetched via IMDB ID lookup
- 👑 **Staff admin actions** — edit/delete controls visible only to staff users
- 📱 **Fully responsive** — mobile-first Tailwind CSS design

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Django 6 + Django REST Framework |
| Database | SQLite (dev) |
| Auth | DRF Token Authentication |
| ML | scikit-learn cosine similarity + joblib |
| Frontend | Vanilla JS + Tailwind CSS (CDN) |
| Image API | TMDB (The Movie Database) |
| Data | Pandas, CSV import |

---

## Project Structure

```
MMS/                        ← Django project config
  settings.py
  urls.py

accounts/                   ← Main app: models, templates, views
  models.py                 ← Movies, Watchlist
  views.py                  ← Page views (pass active_page context)
  urls.py
  templates/accounts/
    base.html               ← Shared layout: nav, footer, toast, scroll-to-top
    homeFeed.html           ← Browse page (extends base)
    myList.html             ← Watchlist page (extends base)
    recommendations.html    ← Recommendations page (extends base)
    index.html              ← Landing page
    signin.html             ← Sign in
    signup.html             ← Sign up
  management/commands/
    import_movies.py        ← CSV → DB importer

api/                        ← REST API app
  views.py                  ← All API endpoints
  serializers.py
  urls.py
  apps.py                   ← Loads ML models at startup

static/
  js/
    tailwind.config.js      ← Shared Tailwind theme (single source of truth)
    base.js                 ← Shared JS: auth, logout, toast, scroll-to-top
    homeFeed.js             ← Browse page logic
    myList.js               ← Watchlist page logic
    recommendations.js      ← Recommendations page logic

ml_models/                  ← (git-ignored)
  movie_similarity.joblib
  movie_vectorizer.joblib
  movie_metadata.csv

discover_movies.py          ← Fetch new movies from TMDB
enrich_movies.py            ← Backfill poster/cast/tagline via TMDB
migrate_movies.py           ← Migrate from old SQLite DB
```

---

## Getting Started

### 1. Clone & install

```bash
git clone https://github.com/your-username/MMS.git
cd MMS

python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and add your TMDB_API_KEY
```

### 3. Run migrations

```bash
python manage.py migrate
```

### 4. Import movies

```bash
python manage.py import_movies
```

### 5. Start the server

```bash
python manage.py runserver
```

Visit **http://127.0.0.1:8000/**

---

## Environment Variables

Create a `.env` file in the project root:

```env
TMDB_API_KEY=your_tmdb_api_key_here
```

Get a free TMDB API key at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api).

---

## Database Setup & Movie Import

Movies are stored in `accounts_movies`. The import command reads from `ml_models/movie_metadata.csv`:

```bash
python manage.py import_movies
```

To enrich existing records with posters, cast, and taglines from TMDB:

```bash
python enrich_movies.py
```

To discover and insert new TMDB movies:

```bash
python discover_movies.py
```

---

## ML Model

The recommendation engine uses **content-based cosine similarity** built from:

- Movie genres
- Directors
- Cast / stars
- Taglines (optional)

Model files expected at `ml_models/`:

| File | Description |
|---|---|
| `movie_similarity.joblib` | Pre-computed cosine similarity matrix |
| `movie_vectorizer.joblib` | TF-IDF vectorizer |
| `movie_metadata.csv` | Movie metadata used to build the model |

The models are loaded once at Django startup via `ApiConfig.ready()` in `api/apps.py`.

> **Note:** `ml_models/` is git-ignored. You need to generate or obtain these files separately.

---

## API Reference

All endpoints are prefixed with `/api/`.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/signup/` | ✗ | Register a new user |
| `POST` | `/api/login/` | ✗ | Authenticate, receive token |
| `POST` | `/api/logout/` | ✓ | Invalidate token |
| `GET` | `/api/movies/` | ✗ | Paginated movie list (search, page params) |
| `GET` | `/api/watchlist/` | ✓ | Get user's watchlist |
| `POST` | `/api/watchlist/` | ✓ | Add movie to watchlist |
| `DELETE` | `/api/watchlist/` | ✓ | Remove movie from watchlist |
| `GET` | `/api/recommend/?title=` | ✗ | Get recommendations for a movie title |
| `GET` | `/api/tmdb-backdrop/?movie_id=&title=` | ✗ | Fetch TMDB backdrop image |
| `GET` | `/api/suggestions/?q=` | ✗ | Autocomplete movie titles |

### Pagination

`/api/movies/` supports:
- `?search=query` — filter by title or genre
- `?page=1` — page number (24 results per page)

### Recommendation Response

```json
{
  "seed": { ...MovieSerializer },
  "recommendations": [ ...MovieSerializer ],
  "similarity_scores": [0.94, 0.87, ...]
}
```

---

## Pages & UI

| URL | Template | Description |
|---|---|---|
| `/` | `index.html` | Landing page |
| `/signin/` | `signin.html` | Sign in |
| `/signup/` | `signup.html` | Sign up |
| `/homeFeed/` | `homeFeed.html` | Browse movies |
| `/myList/` | `myList.html` | Your watchlist |
| `/recommendations/` | `recommendations.html` | AI recommendations |

### Shared UI Components (via `base.html`)

- **Navigation bar** — active link highlighting via `active_page` context variable
- **Search bar** — rendered only on the Browse page via `{% block nav_search %}`
- **Footer** — consistent across all authenticated pages
- **Toast notifications** — `showToast(message, 'success' | 'remove')` available globally
- **Scroll-to-top button** — appears after scrolling 400 px, replaces the old FAB

---

## Utility Scripts

These scripts run **outside Django** and connect directly to SQLite.

| Script | Purpose |
|---|---|
| `discover_movies.py` | Pull new movies from TMDB Discover API and insert them |
| `enrich_movies.py` | Backfill missing poster, cast, tagline from TMDB |
| `migrate_movies.py` | One-off migration from old `moviedb.sqlite3` |

Update `DB_PATH` in each script to match your local path before running.

---

## Roadmap

- [ ] Compiled Tailwind CSS (replace CDN with build step)
- [ ] User ratings / personal scores
- [ ] Collaborative filtering (user-based recommendations)
- [ ] Movie detail pages (dedicated routes)
- [ ] Admin CRUD UI for staff users
- [ ] PWA / offline support
- [ ] Docker + production deployment guide

---

## License

MIT © 2025 ReelMatch