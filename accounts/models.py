from django.db import models
import ast
import re

# Create your models here.

class Movies(models.Model):
    movie_id = models.CharField(max_length=20, primary_key=True)  # Change to CharField
    title = models.CharField(max_length=255, db_index=True)
    overview = models.TextField(blank=True, null=True)
    genres = models.TextField(blank=True, null=True)
    release_date = models.CharField(max_length=50, blank=True, null=True)
    vote_average = models.FloatField(blank=True, null=True)
    vote_count = models.IntegerField(blank=True, null=True)
    tagline = models.TextField(blank=True, null=True)
    poster_url = models.URLField(max_length=500, blank=True, null=True)
    directors = models.TextField(blank=True, null=True)
    stars = models.TextField(blank=True, null=True)

    @property
    def genres_list(self):
        """Return genres as a proper Python list"""
        if not self.genres:
            return []

        try:
            # Try to evaluate as Python list
            if self.genres.startswith('[') and self.genres.endswith(']'):
                return ast.literal_eval(self.genres)
            # Try splitting by comma
            elif ',' in self.genres:
                return [genre.strip() for genre in self.genres.split(',')]
            else:
                return [self.genres.strip()]
        except (ValueError, SyntaxError):
            # Fallback: extract quoted strings
            genres = re.findall(r"['\"]([^'\"]+)['\"]", self.genres)
            return genres if genres else [self.genres]

    def __str__(self):
        return self.title

from django.conf import settings # Import this for the User model

class Watchlist(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='watchlist')
    movie = models.ForeignKey(Movies, on_delete=models.CASCADE)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'movie')

    def __str__(self):
        return f"{self.user.username} - {self.movie.title}"