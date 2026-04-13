from movie_admin.models import Movies, Watchlist
from .serializers import MovieSerializer, UserSerializer, WatchlistSerializer

# api/views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate
from django.db import transaction
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

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

    # Returns specific errors like "Username already exists"
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
        # USERS & ADMINS can do this
        movies = Movies.objects.all()
        serializer = MovieSerializer(movies, many=True)
        return Response(serializer.data)

    elif request.method == 'POST':
        # ACTOR CHECK: Only Admin (is_staff) can add movies
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
        serializer = MovieSerializer(movies, many=True)
        return Response(serializer.data)

class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Simply delete the token from the server-side database
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
    title = request.query_params.get('title', '').strip()
    if not title:
        return Response({"error": "title is required"}, status=400)

    # ================================================================
    # TODO: Uncomment this block when your .pkl model is ready
    # ================================================================
    # import pickle
    # with open('model/cosine_sim.pkl', 'rb') as f:
    #     cosine_sim = pickle.load(f)
    # with open('model/df.pkl', 'rb') as f:
    #     df = pickle.load(f)
    #
    # try:
    #     index = df[df["Title"] == title].index[0]
    #     sim_scores = sorted(
    #         enumerate(cosine_sim[index]),
    #         key=lambda x: x[1], reverse=True
    #     )[1:6]
    #     recommended_titles = df.iloc[[i[0] for i in sim_scores]]["Title"].tolist()
    #     recommended = Movies.objects.filter(title__in=recommended_titles)
    # except IndexError:
    #     return Response({"error": "Movie not found in model"}, status=404)
    # ================================================================

    # --- Temporary placeholder until model is integrated ---
    # Returns top-rated movies excluding the seed as stand-in results
    try:
        seed_movie = Movies.objects.get(title__iexact=title)
    except Movies.DoesNotExist:
        return Response({"error": "Movie not found"}, status=404)

    recommended = Movies.objects.exclude(title__iexact=title).order_by('-vote_average')[:5]

    return Response({
        "seed": MovieSerializer(seed_movie).data,
        "recommendations": MovieSerializer(recommended, many=True).data
    })