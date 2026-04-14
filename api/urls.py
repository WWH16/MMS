from django.urls import path
from . import views
from .views import LogoutView, MovieListView

urlpatterns = [
    path('signup/', views.signup_view, name='api-signup'),
    path('login/', views.login_view, name='api-login'),

    # Use the Class-Based View for the feed (limited to 20)
    path('movies/', MovieListView.as_view(), name='movie-list'),

    # Add the watchlist path that your JavaScript is calling
    path('watchlist/', views.my_list_view, name='api-watchlist'),

    path('logout/', LogoutView.as_view(), name='api_logout'),
path('recommend/', views.recommend_view, name='api-recommend'),
path('tmdb-backdrop/', views.tmdb_backdrop_view, name='api-tmdb-backdrop'),
]