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


@api_view(['POST'])
@permission_classes([AllowAny])
def signup_view(request):
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
    username = request.data.get('username')
    password = request.data.get('password')
    user = authenticate(username=username, password=password)
    if user:
        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            "token": token.key,
            "is_staff": user.is_staff,
            "username": user.username
        }, status=status.HTTP_200_OK)
    return Response({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['GET', 'POST'])
def movie_list(request):
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


class MovieListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        movies = Movies.objects.all().order_by('-vote_average')
        search = request.GET.get('search', '').strip()
        if search:
            movies = movies.filter(
                Q(title__icontains=search) | Q(genres__icontains=search)
            )
        page_number = request.GET.get('page', 1)
        paginator = Paginator(movies, 24)
        page_obj = paginator.get_page(page_number)
        serializer = MovieSerializer(page_obj.object_list, many=True)
        return Response({
            "results": serializer.data,
            "has_next": page_obj.has_next(),
            "total_pages": paginator.num_pages,
            "current_page": page_obj.number
        })


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.user.auth_token.delete()
        return Response({"message": "Successfully logged out."}, status=status.HTTP_200_OK)


@api_view(['GET', 'POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def my_list_view(request):
    if request.method == 'GET':
        watchlist = Watchlist.objects.filter(user=request.user)
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
        if Watchlist.objects.filter(user=request.user, movie=movie).exists():
            return Response({"error": "Already in watchlist"}, status=400)
        watchlist_item = Watchlist.objects.create(user=request.user, movie=movie)
        serializer = WatchlistSerializer(watchlist_item)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    elif request.method == 'DELETE':
        movie_id = request.data.get('movie_id')
        try:
            item = Watchlist.objects.get(user=request.user, movie_id=movie_id)
            item.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Watchlist.DoesNotExist:
            return Response({"error": "Movie not in watchlist"}, status=404)


@api_view(['GET'])
@permission_classes([AllowAny])
def recommend_view(request):
    api_config = apps.get_app_config('api')

    if not hasattr(api_config, 'cosine_sim') or api_config.cosine_sim is None:
        return Response({
            "error": "Recommendation engine is initializing. Please try again.",
            "status": "loading"
        }, status=503)

    query = request.query_params.get('title', '').strip().lower()
    if not query:
        return Response({"error": "Query parameter 'title' is required."}, status=400)

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
    sim_scores = sorted(enumerate(api_config.cosine_sim[idx]), key=lambda x: x[1], reverse=True)
    similar_indices = [i[0] for i in sim_scores[1:11]]
    similarity_scores = [i[1] for i in sim_scores[1:11]]

    recommended_ids = api_config.movies_df.iloc[similar_indices]['id'].tolist()
    recommended_movies = Movies.objects.filter(movie_id__in=recommended_ids)
    movie_dict = {m.movie_id: m for m in recommended_movies}
    ordered_movies = [movie_dict[mid] for mid in recommended_ids if mid in movie_dict]

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


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([UserRateThrottle])
def tmdb_backdrop_view(request):
    movie_id = request.query_params.get('movie_id', '').strip()
    title = request.query_params.get('title', '').strip()

    try:
        # ✅ Prefer IMDB ID lookup — fast and accurate
        if movie_id and movie_id.startswith('tt'):
            res = requests.get(
                f'https://api.themoviedb.org/3/find/{movie_id}',
                params={'api_key': settings.TMDB_API_KEY, 'external_source': 'imdb_id'},
                timeout=5
            )
            data = res.json()
            results = data.get('movie_results', [])
            if results:
                r = results[0]
                backdrop = r.get('backdrop_path')
                poster = r.get('poster_path')
                return Response({
                    "backdrop_url": f"https://image.tmdb.org/t/p/original{backdrop}" if backdrop else None,
                    "poster_url": f"https://image.tmdb.org/t/p/w500{poster}" if poster else None,
                    "overview": r.get('overview'),
                    "release_date": r.get('release_date'),
                })

        # Fallback: search by title
        if title:
            res = requests.get(
                'https://api.themoviedb.org/3/search/movie',
                params={'api_key': settings.TMDB_API_KEY, 'query': title},
                timeout=5
            )
            data = res.json()
            results = data.get('results', [])
            if results and results[0].get('backdrop_path'):
                return Response({
                    "backdrop_url": f"https://image.tmdb.org/t/p/original{results[0]['backdrop_path']}"
                })

        return Response({"backdrop_url": None})
    except Exception:
        return Response({"backdrop_url": None}, status=500)


@api_view(['GET'])
@permission_classes([AllowAny])
def movie_search_suggestions(request):
    query = request.GET.get('q', '').strip()
    if len(query) < 2:
        return Response([])
    movies = Movies.objects.filter(
        title__icontains=query
    ).values('movie_id', 'title')[:8]
    return Response(list(movies))