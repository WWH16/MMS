# api/watch/watch_resolver.py
import requests
from django.conf import settings


class WatchResolver:
    """Resolves movie titles to YouTube trailer URLs"""

    def __init__(self):
        self.youtube_api_key = getattr(settings, 'YOUTUBE_API_KEY', None)

    def resolve(self, movie_title, year=None):
        """Returns YouTube trailer URL for the movie"""
        results = {
            'url': None,
            'source': 'YouTube',
            'type': 'trailer',
            'message': None
        }

        if not self.youtube_api_key:
            results['message'] = 'YouTube API key not configured'
            return results

        trailer_url = self._get_trailer(movie_title, year)
        if trailer_url:
            results['url'] = trailer_url
            return results

        results['message'] = 'No trailer found for this title'
        return results

    def _get_trailer(self, title, year=None):
        """Search YouTube for official trailer"""
        try:
            # Build search query
            query = f"{title}"
            if year:
                query += f" {year}"
            query += " Official Trailer"

            url = "https://www.googleapis.com/youtube/v3/search"
            params = {
                'part': 'snippet',
                'q': query,
                'type': 'video',
                'videoEmbeddable': 'true',
                'maxResults': 5,
                'order': 'relevance',
                'key': self.youtube_api_key
            }

            response = requests.get(url, params=params, timeout=5)
            data = response.json()

            if 'items' in data and len(data['items']) > 0:
                # Try to find a working embeddable video
                for item in data['items']:
                    video_id = item['id']['videoId']
                    # Check if video is actually embeddable
                    if self._is_embeddable(video_id):
                        # Use youtube-nocookie.com without origin if causing issues, or use a flexible origin
                        return f"https://www.youtube-nocookie.com/embed/{video_id}?autoplay=0&rel=0&modestbranding=1&enablejsapi=1"

                # If no embeddable video found in first few, return first one anyway
                video_id = data['items'][0]['id']['videoId']
                return f"https://www.youtube-nocookie.com/embed/{video_id}?autoplay=0&rel=0&modestbranding=1&enablejsapi=1"

            return None

        except Exception as e:
            print(f"YouTube API error: {e}")
            return None

    def _is_embeddable(self, video_id):
        """Check if video is embeddable"""
        try:
            url = "https://www.googleapis.com/youtube/v3/videos"
            params = {
                'part': 'status,contentDetails',
                'id': video_id,
                'key': self.youtube_api_key
            }
            response = requests.get(url, params=params, timeout=3)
            data = response.json()

            if 'items' in data and len(data['items']) > 0:
                status = data['items'][0].get('status', {})
                return status.get('embeddable', False)
            return True  # Assume embeddable if can't check
        except:
            return True  # Assume embeddable if check fails

    def _get_origin(self):
        """Get the origin for embed URL"""
        from django.conf import settings
        try:
            # Try to get from settings
            return getattr(settings, 'ALLOWED_HOSTS', ['localhost'])[0]
        except:
            return 'localhost'