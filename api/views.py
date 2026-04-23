# api/views.py
# ─────────────────────────────────────────────────────────────────────────────
# REST API views for ReelMatch:
#   Auth      – signup, login, logout
#   Movies    – paginated list + search
#   Watchlist – per-user CRUD
#   AI        – cosine-similarity recommendations
#   TMDB      – backdrop / poster proxy
#   Utils     – autocomplete suggestions
# ─────────────────────────────────────────────────────────────────────────────

from accounts.models import Movies, Watchlist
from .serializers import MovieSerializer, UserSerializer, WatchlistSerializer

from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate
from django.db import transaction
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
import requests
from django.conf import settings

from rest_framework.throttling import UserRateThrottle
from django.db.models import Q
from django.core.paginator import Paginator
from django.apps import apps


# ── Auth ──────────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def signup_view(request):
    """
    Register a new user and return a DRF token.
    Body: { username, password, recaptcha_token }
    """
    recaptcha_token = request.data.get('recaptcha_token')
    if not recaptcha_token:
        return Response({"error": "reCAPTCHA token missing"}, status=status.HTTP_400_BAD_REQUEST)

    # Verify reCAPTCHA
    verify_response = requests.post(
        'https://www.google.com/recaptcha/api/siteverify',
        data={
            'secret': settings.RECAPTCHA_SECRET_KEY,
            'response': recaptcha_token
        }
    )
    verify_data = verify_response.json()

    if not verify_data.get('success') or verify_data.get('score', 1.0) < 0.5:
        return Response({"error": "reCAPTCHA verification failed or low score"}, status=status.HTTP_400_BAD_REQUEST)

    serializer = UserSerializer(data=request.data)
    if serializer.is_valid():
        try:
            with transaction.atomic():
                user = serializer.save()
                token = Token.objects.create(user=user)
                return Response({
                    "token": token.key,
                    "is_staff": user.is_staff,
                    "username": user.username
                }, status=status.HTTP_201_CREATED)
        except Exception:
            return Response({"error": "Internal server error"}, status=500)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    Authenticate a user and return a DRF token.
    Body: { username, password, recaptcha_token }
    """
    recaptcha_token = request.data.get('recaptcha_token')
    if not recaptcha_token:
        return Response({"error": "reCAPTCHA token missing"}, status=status.HTTP_400_BAD_REQUEST)

    # Verify reCAPTCHA
    verify_response = requests.post(
        'https://www.google.com/recaptcha/api/siteverify',
        data={
            'secret': settings.RECAPTCHA_SECRET_KEY,
            'response': recaptcha_token
        }
    )
    verify_data = verify_response.json()

    if not verify_data.get('success'):
        return Response({"error": "reCAPTCHA verification failed"}, status=status.HTTP_400_BAD_REQUEST)

    # Optional: check score for v3 (threshold usually 0.5)
    if verify_data.get('score', 1.0) < 0.5:
        return Response({"error": "Low reCAPTCHA score"}, status=status.HTTP_403_FORBIDDEN)

    username = request.data.get('username')
    password = request.data.get('password')
    user = authenticate(username=username, password=password)
    if user:
        # get_or_create so existing tokens are reused across sessions
        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            "token": token.key,
            "is_staff": user.is_staff,
            "username": user.username
        }, status=status.HTTP_200_OK)
    return Response({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['GET', 'POST'])
def movie_list(request):
    """
    Legacy non-paginated movie list (kept for backward-compat).
    Staff-only POST to add a movie directly.
    """
    if request.method == 'GET':
        movies = Movies.objects.all()
        serializer = MovieSerializer(movies, many=True)
        return Response(serializer.data)
    elif request.method == 'POST':
        if not request.user.is_staff:
            return Response({"error": "Only admins can add movies"}, status=status.HTTP_403_FORBIDDEN)
        serializer = MovieSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ── Movies ────────────────────────────────────────────────────────────────────

class MovieListView(APIView):
    """
    GET /api/movies/
    Returns a paginated list of movies sorted by rating descending.
    Query params:
        search  – filter by title or genre (case-insensitive)
        page    – page number (24 results per page)
    """
    permission_classes = [AllowAny]

    def get(self, request):
        movies = Movies.objects.all().order_by('-vote_average')

        # Optional keyword filter across title and genre fields
        search = request.GET.get('search', '').strip()
        if search:
            movies = movies.filter(
                Q(title__icontains=search) | Q(genres__icontains=search)
            )

        page_number = request.GET.get('page', 1)
        paginator = Paginator(movies, 24)          # 24 cards per grid page
        page_obj = paginator.get_page(page_number)
        serializer = MovieSerializer(page_obj.object_list, many=True)

        return Response({
            "results": serializer.data,
            "has_next": page_obj.has_next(),
            "total_pages": paginator.num_pages,
            "current_page": page_obj.number
        })


# ── Auth – Logout ─────────────────────────────────────────────────────────────

class LogoutView(APIView):
    """
    POST /api/logout/
    Deletes the user's auth token, effectively invalidating all sessions.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.user.auth_token.delete()
        return Response({"message": "Successfully logged out."}, status=status.HTTP_200_OK)


# ── Watchlist ─────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def my_list_view(request):
    """
    GET    /api/watchlist/  – Return all watchlist items for the authenticated user.
    POST   /api/watchlist/  – Add a movie; body: { movie_id }
    DELETE /api/watchlist/  – Remove a movie; body: { movie_id }
    """
    if request.method == 'GET':
        # select_related avoids N+1 queries when serialising movie details
        watchlist = Watchlist.objects.filter(user=request.user).select_related('movie')
        serializer = WatchlistSerializer(watchlist, many=True)
        return Response(serializer.data)

    elif request.method == 'POST':
        movie_id = request.data.get('movie_id')
        if not movie_id:
            return Response({"error": "movie_id required"}, status=400)
        try:
            movie = Movies.objects.get(movie_id=movie_id)
        except Movies.DoesNotExist:
            return Response({"error": "Movie not found"}, status=404)

        # get_or_create prevents duplicate watchlist rows
        watchlist_item, created = Watchlist.objects.get_or_create(
            user=request.user,
            movie=movie
        )
        if not created:
            return Response({"error": "Already in watchlist"}, status=400)

        serializer = WatchlistSerializer(watchlist_item)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    elif request.method == 'DELETE':
        movie_id = request.data.get('movie_id')
        if not movie_id:
            return Response({"error": "movie_id required"}, status=400)

        try:
            item = Watchlist.objects.get(user=request.user, movie_id=movie_id)
            item.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Watchlist.DoesNotExist:
            return Response({"error": "Movie not in watchlist"}, status=404)


# ── Recommendations ───────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def recommend_view(request):
    """
    GET /api/recommend/?title=<movie title>
    Uses a pre-computed cosine-similarity matrix (loaded at startup in apps.py)
    to return up to 10 movies most similar to the queried title.

    Response shape:
        { seed: MovieSerializer, recommendations: [...], similarity_scores: [...] }
    """
    api_config = apps.get_app_config('api')

    # Guard: model may still be loading on a fresh server start
    if not hasattr(api_config, 'cosine_sim') or api_config.cosine_sim is None:
        return Response({
            "error": "Recommendation engine is initializing. Please try again.",
            "status": "loading"
        }, status=503)

    query = request.query_params.get('title', '').strip().lower()
    if not query:
        return Response({"error": "Query parameter 'title' is required."}, status=400)

    # Exact match first; fallback to substring match
    if query not in api_config.movie_indices:
        matching_titles = [t for t in api_config.movie_indices.keys() if query in t]
        if matching_titles:
            query = matching_titles[0]
        else:
            return Response({
                "error": "not_found",
                "message": f"We couldn't find \"{request.query_params.get('title')}\" in our catalogue. Try a different title.",
            }, status=404)

    idx = api_config.movie_indices[query]

    # Sort all movies by similarity score, descending; skip index 0 (the seed itself)
    sim_scores = sorted(enumerate(api_config.cosine_sim[idx]), key=lambda x: x[1], reverse=True)
    similar_indices  = [i[0] for i in sim_scores[1:11]]
    similarity_scores = [i[1] for i in sim_scores[1:11]]

    # Map DataFrame indices → DB rows, preserving similarity order
    recommended_ids   = api_config.movies_df.iloc[similar_indices]['id'].tolist()
    recommended_movies = Movies.objects.filter(movie_id__in=recommended_ids)
    movie_dict = {m.movie_id: m for m in recommended_movies}
    ordered_movies = [movie_dict[mid] for mid in recommended_ids if mid in movie_dict]

    # Fetch the seed movie so the UI can display "Because you searched for…"
    seed_id = api_config.movies_df.iloc[idx]['id']
    try:
        seed_movie = Movies.objects.get(movie_id=seed_id)
    except Movies.DoesNotExist:
        seed_movie = None

    if not ordered_movies:
        return Response({
            "error": "no_results",
            "message": "We found the movie but couldn't generate recommendations right now.",
        }, status=404)

    return Response({
        "recommendations": MovieSerializer(ordered_movies, many=True).data,
        "similarity_scores": similarity_scores,
        "seed": MovieSerializer(seed_movie).data if seed_movie else None,
    })


# ── TMDB Backdrop Proxy ───────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([UserRateThrottle])
def tmdb_backdrop_view(request):
    """
    GET /api/tmdb-backdrop/?movie_id=<imdb_id>&title=<title>
    Proxies TMDB image lookups so the API key stays server-side.
    Priority: IMDB ID lookup → title search fallback.
    Throttled to prevent abuse of the TMDB quota.
    """
    movie_id = request.query_params.get('movie_id', '').strip()
    title    = request.query_params.get('title', '').strip()

    try:
        # Primary: IMDB ID → TMDB /find/ (fast, unambiguous)
        if movie_id and movie_id.startswith('tt'):
            res = requests.get(
                f'https://api.themoviedb.org/3/find/{movie_id}',
                params={'api_key': settings.TMDB_API_KEY, 'external_source': 'imdb_id'},
                timeout=5
            )
            data    = res.json()
            results = data.get('movie_results', [])
            if results:
                r       = results[0]
                backdrop = r.get('backdrop_path')
                poster   = r.get('poster_path')
                return Response({
                    "backdrop_url": f"https://image.tmdb.org/t/p/original{backdrop}" if backdrop else None,
                    "poster_url":   f"https://image.tmdb.org/t/p/w500{poster}"        if poster   else None,
                    "overview":     r.get('overview'),
                    "release_date": r.get('release_date'),
                })

        # Fallback: text search by title (less accurate for common names)
        if title:
            res = requests.get(
                'https://api.themoviedb.org/3/search/movie',
                params={'api_key': settings.TMDB_API_KEY, 'query': title},
                timeout=5
            )
            data    = res.json()
            results = data.get('results', [])
            if results and results[0].get('backdrop_path'):
                return Response({
                    "backdrop_url": f"https://image.tmdb.org/t/p/original{results[0]['backdrop_path']}"
                })

        return Response({"backdrop_url": None})

    except Exception:
        return Response({"backdrop_url": None}, status=500)


# ── Autocomplete ──────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def movie_search_suggestions(request):
    """
    GET /api/suggestions/?q=<partial title>
    Returns up to 8 movie titles matching the query (min 2 chars).
    Used by the recommendations page search-as-you-type input.
    """
    query = request.GET.get('q', '').strip()
    if len(query) < 2:
        return Response([])

    movies = Movies.objects.filter(
        title__icontains=query
    ).values('movie_id', 'title')[:8]

    return Response(list(movies))