# ReelMatch 🎬

**ReelMatch** is an AI-powered movie recommendation web application built with **Django 6** and **Django REST Framework**. It uses a content-based filtering model trained on movie metadata (genres, directors, cast) to surface films tailored to your preferences.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database & Data Import](#database--data-import)
- [ML Model Engine](#ml-model-engine)
- [API Reference](#api-reference)
- [Pages & UI](#pages--ui)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features

- 🔐 **Secure Authentication** — Sign up/login with Google reCAPTCHA v3 protection and token-based sessions.
- 🎬 **Movie Discovery** — Paginated browsing, search by genre/title, and AI-powered recommendations.
- 🤖 **AI Engine** — Content-based cosine-similarity model leveraging scikit-learn.
- 📌 **Personal Watchlist** — Persistent user-specific watchlist with instant CRUD feedback.
- 🖼 **Rich Metadata** — TMDB integration for posters, cast, and taglines.
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
| **APIs** | TMDB API, YouTube API |

---

## Project Structure

```
MMS/                    # Django project configuration
accounts/               # Core application logic & UI
  models.py             # Movie and Watchlist models
  management/           # Custom management commands
api/                    # REST API app & ML integration
  views.py              # API logic
  apps.py               # ML model loading (startup)
static/                 # Client-side assets (JS, Tailwind config)
ml_models/              # (Git-ignored) ML artifacts
*.py                    # Utility scripts (discover, enrich, migrate)
```

---

## Getting Started

### 1. Setup Environment
```bash
python -m venv .venv
# Activate:
.venv\Scripts\activate  # Windows
# Install dependencies:
pip install -r requirements.txt
```

### 2. Configure Environment
Create a `.env` file in the root:
```env
TMDB_API_KEY=your_key
RECAPTCHA_SITE_KEY=your_key
RECAPTCHA_SECRET_KEY=your_key
YOUTUBE_API_KEY=your_key
```

### 3. Initialize Database
```bash
python manage.py migrate
python manage.py import_movies  # Imports from ml_models/movie_metadata.csv
```

### 4. Run
```bash
python manage.py runserver
```

---

## Database & Data Import

The application manages movies via `accounts.models.Movies`. Data ingestion workflows:
- **`import_movies.py`**: Initializes the database from `ml_models/movie_metadata.csv`.
- **`discover_movies.py`**: Fetches new content via TMDB.
- **`enrich_movies.py`**: Updates missing metadata (poster, cast, tagline) for existing records.

---

## ML Model Engine

Recommendation logic is encapsulated in `api/apps.py`, which loads artifacts at runtime:
- `movie_similarity.joblib`: Pre-computed cosine similarity matrix.
- `movie_vectorizer.joblib`: TF-IDF vectorizer.

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/signup/` | POST | User registration with reCAPTCHA |
| `/api/login/` | POST | Login with reCAPTCHA |
| `/api/movies/` | GET | Paginated movie browsing |
| `/api/watchlist/` | GET/POST/DEL | Manage user personal list |
| `/api/recommend/?title=` | GET | AI-generated recommendations |
| `/api/tmdb-backdrop/` | GET | Proxy for TMDB media |

---

## Roadmap

- [ ] Transition from CDN to build-time Tailwind CSS.
- [ ] Implement collaborative filtering.
- [ ] Add user-based rating system.
- [ ] Dockerize for production.

---

## License

MIT © 2026 ReelMatch
