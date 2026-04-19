# api/serializers.py
from rest_framework import serializers
from accounts.models import Movies, Watchlist
from django.contrib.auth.models import User  # Add this import

class MovieSerializer(serializers.ModelSerializer):
    genres_list = serializers.SerializerMethodField()
    release_year = serializers.SerializerMethodField()

    class Meta:
        model = Movies
        fields = [
            'movie_id', 'title', 'overview', 'genres', 'genres_list',
            'release_date', 'release_year', 'vote_average', 'vote_count',
            'tagline', 'poster_url', 'directors', 'stars'
        ]

    def get_genres_list(self, obj):
        return obj.genres_list

    def get_release_year(self, obj):
        if obj.release_date and len(str(obj.release_date)) >= 4:
            return str(obj.release_date)[:4]
        return None


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User  # Now this will work
        fields = ['id', 'username', 'password', 'email']
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user


class WatchlistSerializer(serializers.ModelSerializer):
    movie_details = MovieSerializer(source='movie', read_only=True)  # ← ADD THIS LINE
    movie_id = serializers.CharField(write_only=True)  # ← CHANGED to CharField (your movie_id is a string like 'tt0111161')

    class Meta:
        model = Watchlist
        fields = ['id', 'user', 'movie_details', 'movie_id', 'added_at']  # ← CHANGED 'movie' to 'movie_details'
        read_only_fields = ['user', 'added_at']