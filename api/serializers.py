from rest_framework import serializers
from django.contrib.auth.models import User # Add this import
from movie_admin.models import Movies

class MovieSerializer(serializers.ModelSerializer):
    class Meta:
        model = Movies
        fields = [
            'movie_id', 'title', 'overview', 'genres',
            'release_date', 'vote_average', 'tags', 'poster_url'
        ]

# Add this back so your signup_view can find it
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'password', 'is_staff']
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user

from movie_admin.models import Watchlist # If you moved Watchlist to api/models
# OR from movie_admin.models import Watchlist

class WatchlistSerializer(serializers.ModelSerializer):
    movie_details = MovieSerializer(source='movie', read_only=True) # This sends the full movie object

    class Meta:
        model = Watchlist
        fields = ['id', 'movie', 'movie_details', 'added_at']