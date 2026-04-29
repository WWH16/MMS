# ReelMatch 🎬

**ReelMatch** is an AI-powered movie recommendation web application built with **Django** and **Django REST Framework**. It uses a content-based filtering model trained on movie metadata — genres, directors, and cast — to surface films tailored to your preferences.

> 📸 **Image suggestion:** Add a hero screenshot of the home/browse page here.
> `![ReelMatch Browse Page](docs/images/homepage.png)`

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database & Data Import](#database--data-import)
- [ML Recommendation Engine](#ml-recommendation-engine)
- [API Reference](#api-reference)
- [Pages & UI](#pages--ui)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features

- 🔐 **Secure Authentication** — Sign up/login with Google reCAPTCHA v3 protection and token-based sessions.
- 🎬 **Movie Discovery** — Paginated browsing, search by genre/title, and AI-powered recommendations.
- 🤖 **AI Engine** — Content-based cosine-similarity model leveraging scikit-learn TF-IDF vectorization.
- 📌 **Personal Watchlist** — Persistent user-specific watchlist with instant CRUD feedback.
- 🖼 **Rich Metadata** — TMDB integration for posters, cast, backdrops, and taglines.
- 🎞 **Trailer Playback** — YouTube API integration to surface official trailers in-app.
- 📱 **Responsive UI** — Built with Tailwind CSS and Vanilla JavaScript.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Django 6, Django REST Framework |
| **Auth** | DRF Token Auth, reCAPTCHA v3 |
| **Database** | SQLite (development) |
| **ML/AI** | pandas, scikit-learn, joblib |
| **Frontend** | Vanilla JS, Tailwind CSS (CDN) |
| **External APIs** | TMDB API, YouTube Data API v3 |

---

## Project Structure

```
MMS/                        # Django project configuration
├── settings.py             # Environment-based config
├── urls.py                 # Root URL routing

accounts/                   # Core application — models, views, templates, static
├── models.py               # Movies and Watchlist models
├── views.py                # Page views (index, homeFeed, myList, recommendations)
├── urls.py                 # Page-level URL routing
├── templates/accounts/     # Django HTML templates
│   ├── base.html           # Shared layout: nav, footer, modal, toast, JS
│   ├── homeFeed.html       # Browse page with hero + carousel + grid
│   ├── myList.html         # Personal watchlist page
│   ├── recommendations.html# AI recommendations results page
│   ├── signin.html         # Login page
│   └── signup.html         # Registration page
├── static/accounts/js/
│   ├── base.js             # Auth bootstrap, toast, shared modal, watchlist toggle
│   ├── homeFeed.js         # Browse page logic, hero, carousels, filters
│   ├── myList.js           # Watchlist CRUD, remove modal
│   ├── recommendations.js  # Recommendations fetch, render, search suggestions
│   └── Tailwind.config.js  # Custom design token theme
└── management/commands/
    └── import_movies.py    # CLI: seeds DB from movie_metadata.csv

api/                        # REST API app
├── views.py                # All API endpoints (auth, movies, watchlist, recommend, TMDB)
├── serializers.py          # DRF serializers for Movies, Users, Watchlist
├── urls.py                 # API URL routing
├── apps.py                 # ML model loading at app startup (AppConfig.ready())
└── watch/
    ├── views.py            # Watch/trailer endpoint
    ├── urls.py             # Watch URL routing
    └── watch_resolver.py   # YouTube API trailer resolver

ml_models/                  # (Git-ignored) ML artifacts
├── movie_similarity.joblib # Pre-computed cosine similarity matrix
├── movie_vectorizer.joblib # Fitted TF-IDF vectorizer
└── movie_metadata.csv      # Source dataset used for training and import

discover_movies.py          # Utility: fetch new movies from TMDB into DB
enrich_movies.py            # Utility: backfill missing metadata via TMDB
migrate_movies.py           # Utility: migrate from a legacy SQLite database
```

---

## Getting Started

### 1. Set Up Environment

```bash
python -m venv .venv

# Activate (Windows)
.venv\Scripts\activate

# Activate (macOS/Linux)
source .venv/bin/activate

pip install -r requirements.txt
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```env
TMDB_API_KEY=your_tmdb_api_key
RECAPTCHA_SITE_KEY=your_recaptcha_v3_site_key
RECAPTCHA_SECRET_KEY=your_recaptcha_v3_secret_key
YOUTUBE_API_KEY=your_youtube_data_api_key
```

### 3. Initialize the Database

```bash
python manage.py migrate
python manage.py import_movies   # Seeds DB from ml_models/movie_metadata.csv
```

### 4. (Optional) Generate ML Artifacts

If `ml_models/` is empty or missing, train the model before running:

```bash
# See ML Recommendation Engine section below for the training script
python train_model.py
```

### 5. Run the Server

```bash
python manage.py runserver
```

Visit `http://127.0.0.1:8000/` in your browser.

---

## Environment Variables

| Variable | Description |
|---|---|
| `TMDB_API_KEY` | [The Movie Database](https://www.themoviedb.org/settings/api) API key — used for backdrops, posters, and enrichment |
| `RECAPTCHA_SITE_KEY` | Google reCAPTCHA v3 site key — rendered in sign-in/sign-up forms |
| `RECAPTCHA_SECRET_KEY` | Google reCAPTCHA v3 secret key — verified server-side on auth requests |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key — used to surface official trailers |

---

## Database & Data Import

Movies are stored in the `accounts_movies` table via the `Movies` model. Three utility scripts manage the data lifecycle:

**`import_movies.py`** (management command) — The primary data seeder. Reads `ml_models/movie_metadata.csv` and upserts every row into the database. Run this once after `migrate`.

```bash
python manage.py import_movies
```

**`discover_movies.py`** — Fetches new releases from TMDB's `/discover/movie` endpoint for a configured year, de-duplicates against the existing database, and inserts fresh content. Configurable via `INSERT_LIMIT`, `DISCOVER_YEAR`, and `TOTAL_PAGES_TO_SCAN` constants at the top of the file.

```bash
python discover_movies.py
```

**`enrich_movies.py`** — Backfills missing metadata (poster URL, overview, release date, tagline, top-5 cast) for existing rows by querying TMDB's `/find/{imdb_id}` and `/credits` endpoints. Uses a thread pool for speed and batch-writes results in groups of 50.

```bash
python enrich_movies.py
```

---

## ML Recommendation Engine

This is the heart of ReelMatch. The engine uses **content-based filtering** — it recommends movies that are similar in content to one you already like, without needing any user rating history.

> 📸 **Image suggestion:** A diagram showing the pipeline (CSV → TF-IDF → Cosine Similarity → Recommendations) would work great here.
> `![ML Pipeline Diagram](docs/images/ml_pipeline.png)`

### How It Works — Step by Step

#### Step 1: Feature Engineering (Offline / Training Time)

The raw dataset (`movie_metadata.csv`) contains columns for title, genres, directors, and cast. Before vectorization, these fields are cleaned and combined into a single **content string** per movie. For example:

```
"Action Adventure Sci-Fi Christopher Nolan Leonardo DiCaprio Joseph Gordon-Levitt"
```

This string captures what a movie *is* — its genre DNA and the creative team behind it.

#### Step 2: TF-IDF Vectorization

The combined content strings are fed into a **TF-IDF (Term Frequency–Inverse Document Frequency) Vectorizer** from scikit-learn.

- **TF (Term Frequency):** How often a word appears in a movie's content string. A movie tagged `Action Action Adventure` scores higher on "Action" than one tagged just `Adventure`.
- **IDF (Inverse Document Frequency):** Penalises words that appear across almost every movie (e.g. "Drama"), so common genres don't dominate the similarity score. Rare, specific terms (e.g. a niche director's name) carry more weight.

The result is a **sparse matrix** where each row is a movie and each column is a unique term from the vocabulary — with TF-IDF weights as values.

#### Step 3: Cosine Similarity Matrix

Once every movie is represented as a TF-IDF vector, **cosine similarity** is computed between every pair of movies.

Cosine similarity measures the angle between two vectors rather than their magnitude — so two movies with the same proportional genre/director mix score high regardless of how long their content strings are.

The output is a square matrix of shape `(n_movies, n_movies)`. Each cell `[i][j]` holds a score from 0 (totally dissimilar) to 1 (identical content profile).

```
                  Inception  The Dark Knight  Interstellar  ...
Inception           1.000         0.82           0.76
The Dark Knight     0.820         1.00           0.61
Interstellar        0.760         0.61           1.00
```

#### Step 4: Artifact Serialization

Both the similarity matrix and the fitted vectorizer are serialized to disk using **joblib**:

```
ml_models/
├── movie_similarity.joblib   # The (n × n) cosine similarity matrix
├── movie_vectorizer.joblib   # The fitted TF-IDF vectorizer
└── movie_metadata.csv        # Title-to-index mapping source
```

Joblib is used over pickle for its efficiency with large NumPy arrays.

#### Step 5: Runtime Loading (`api/apps.py`)

When Django starts, `ApiConfig.ready()` loads the artifacts once into memory and attaches them to the app config object:

```python
# api/apps.py — simplified
class ApiConfig(AppConfig):
    def ready(self):
        self.cosine_sim = joblib.load('ml_models/movie_similarity.joblib')
        self.vectorizer  = joblib.load('ml_models/movie_vectorizer.joblib')
        self.movies_df   = pd.read_csv('ml_models/movie_metadata.csv')
        self.movie_indices = {
            str(row['Title']).lower(): idx
            for idx, row in self.movies_df.iterrows()
        }
```

This means the heavy matrix is loaded **once** at startup and reused across every request — no re-computation at query time.

#### Step 6: Query-Time Recommendation (`api/views.py`)

When a user searches for a movie, the `recommend_view` endpoint:

1. Looks up the movie's row index in `movie_indices` (with a substring fallback for partial matches).
2. Reads that row from the cosine similarity matrix — one similarity score per movie in the catalogue.
3. Sorts all scores descending and takes the top 10 (skipping index 0, which is the movie itself).
4. Fetches the corresponding `Movies` objects from the database and returns them serialized.

```python
idx = api_config.movie_indices[query]
sim_scores = sorted(enumerate(api_config.cosine_sim[idx]), key=lambda x: x[1], reverse=True)
top_10_indices = [i[0] for i in sim_scores[1:11]]
```

The entire lookup is **O(n log n)** at worst — fast enough to serve synchronously with no caching layer needed at this scale.

### Why Content-Based vs. Collaborative Filtering?

| | Content-Based (ReelMatch) | Collaborative Filtering |
|---|---|---|
| **Data needed** | Movie metadata only | User rating history |
| **Cold start** | ✅ Works immediately | ❌ Needs many users/ratings |
| **Discovery** | Similar content | "Users like you also liked" |
| **Transparency** | Easy to explain | Black-box |

Content-based was chosen because it works from day one with zero user data, and the recommendations are interpretable — two movies are similar because they share genres, directors, or cast.

---

## API Reference

All endpoints are prefixed with `/api/`. Token authentication is required unless marked **Public**.

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/signup/` | POST | Public | Register a new user with reCAPTCHA verification |
| `/api/login/` | POST | Public | Authenticate and receive a DRF token |
| `/api/logout/` | POST | Token | Invalidate the current auth token |
| `/api/movies/` | GET | Public | Paginated movie list; supports `search` and `page` query params |
| `/api/watchlist/` | GET | Token | Retrieve the authenticated user's watchlist |
| `/api/watchlist/` | POST | Token | Add a movie; body: `{ movie_id }` |
| `/api/watchlist/` | DELETE | Token | Remove a movie; body: `{ movie_id }` |
| `/api/recommend/` | GET | Public | AI recommendations; query param: `title` |
| `/api/tmdb-backdrop/` | GET | Public | TMDB image proxy; params: `movie_id`, `title` |
| `/api/suggestions/` | GET | Public | Autocomplete suggestions; query param: `q` (min 2 chars) |
| `/api/watch/` | GET | Public | Resolve a movie to a YouTube trailer URL; param: `title`, `year` |

### Example: Recommendations Request

```http
GET /api/recommend/?title=inception
Authorization: Token <your_token>
```

```json
{
  "seed": { "movie_id": "tt1375666", "title": "Inception", ... },
  "recommendations": [
    { "movie_id": "tt0816692", "title": "Interstellar", ... },
    { "movie_id": "tt1219289", "title": "Limitless", ... },
    ...
  ],
  "similarity_scores": [0.82, 0.74, ...]
}
```

---

## Pages & UI

> 📸 **Image suggestion:** A 2×2 grid of screenshots (Browse, Recommendations, My List, Sign-in) would be ideal here.
> ```
> ![UI Screenshots](docs/images/ui-grid.png)
> ```

| Page | URL | Description |
|---|---|---|
| **Landing** | `/` | Marketing page with feature highlights and sign-up CTA |
| **Sign In** | `/signin/` | Token auth with reCAPTCHA v3 and "Remember me" |
| **Sign Up** | `/signup/` | Registration with reCAPTCHA v3 |
| **Browse** | `/homeFeed/` | Hero banner, top-rated carousel, discover grid, full paginated catalogue |
| **My List** | `/myList/` | Personal watchlist with remove confirmation modal |
| **Recommendations** | `/recommendations/` | AI results page with seed card and search-as-you-type |

### Key UI Features

**Shared Movie Modal** — Clicking any movie card opens a detail modal with a TMDB backdrop, overview, watchlist toggle, "Similar" button, and trailer playback. Logic lives in `base.js` (`openSharedModal`) and is reused across all three main pages.

**Toast Notifications** — `showToast()` in `base.js` provides non-blocking success/remove feedback for all watchlist actions.

**Hero Shuffle** — The browse page hero randomly selects from the top-rated pool on load, with a shuffle button to cycle through.

**Trailer Playback** — `handleWatch()` calls `/api/watch/`, resolves a YouTube embed URL, and renders a full-screen YouTube IFrame API player in an overlay modal.

---

## Roadmap

- [ ] Transition from CDN to build-time Tailwind CSS.
- [ ] Implement collaborative filtering as a second recommendation mode.
- [ ] Add user-based rating system to power hybrid recommendations.
- [ ] Model retraining pipeline triggered by new data imports.
- [ ] Dockerize for production deployment.
- [ ] Add pagination/infinite scroll to the recommendations grid.

---

## Where to Add Images

Here is a quick checklist of the three spots in this README where a screenshot or diagram would make the biggest difference:

1. **Top of file** — A full-width hero screenshot of the Browse page (`/homeFeed/`) showing the movie grid and hero banner. Paste it right below the project title.

2. **ML Engine section** — A simple pipeline diagram: `CSV → Feature String → TF-IDF Matrix → Cosine Similarity → Ranked Results`. You can draw this in Excalidraw, Figma, or even a quick sketch. Save as `docs/images/ml_pipeline.png`.

3. **Pages & UI section** — A 2×2 or 2×3 grid of screenshots covering the main pages. Capture them with browser devtools in a consistent viewport (e.g. 1440px wide) for a clean look.

To add images, create a `docs/images/` folder in your repo root, place the files there, and use standard Markdown syntax:
```markdown
![Alt text](docs/images/your-image.png)
```

---

## License

MIT © 2026 ReelMatch