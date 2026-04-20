# watch/views.py
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from .watch_resolver import WatchResolver


@require_http_methods(["GET"])
def watch_movie(request):
    """
    API endpoint to resolve movie to watchable URL
    Query params:
        - title (required): Movie title
        - year (optional): Release year for better accuracy
    Returns:
        {
            'url': 'embed_url',
            'source': 'YouTube'/'Internet Archive',
            'type': 'full_movie'/'trailer'/'public_domain',
            'message': 'error message if any'
        }
    """
    movie_title = request.GET.get('title', '').strip()
    year = request.GET.get('year', '').strip()

    if not movie_title:
        return JsonResponse({'error': 'Movie title required'}, status=400)

    resolver = WatchResolver()
    result = resolver.resolve(movie_title, year if year else None)

    return JsonResponse(result)