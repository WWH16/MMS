from django.urls import path
from . import views
from .views import LogoutView, MovieListView, movie_search_suggestions

urlpatterns = [
    # Auth Endpoints
    path('signup/', views.signup_view, name='api-signup'),
    path('login/', views.login_view, name='api-login'),
    path('logout/', LogoutView.as_view(), name='api_logout'),

    # Movie & List Endpoints
    path('movies/', MovieListView.as_view(), name='movie-list'),
    path('watchlist/', views.my_list_view, name='watchlist'),

    # Recommendation & AI Endpoints
    path('recommend/', views.recommend_view, name='api-recommend'),
    path('tmdb-backdrop/', views.tmdb_backdrop_view, name='api-tmdb-backdrop'),
    path('suggestions/', movie_search_suggestions, name='api-suggestions'),
]