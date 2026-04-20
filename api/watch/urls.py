# watch/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # ... your existing routes ...
    path('', views.watch_movie, name='watch_movie'),
]