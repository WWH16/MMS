from django.shortcuts import render

def homeFeed(request):
    return render(request, 'movie_admin/homeFeed.html')

def myList(request):
    # In a real scenario, you'd fetch movies here:
    # movies = Movie.objects.filter(user=request.user)
    # return render(request, 'movie_admin/myList.html', {'movies': movies})
    return render(request, 'movie_admin/myList.html')

def index(request):
    return render(request, 'movie_admin/index.html')

def signup(request):
    return render(request, 'movie_admin/signup.html')

def signin(request):
    return render(request, 'movie_admin/signin.html')

def recommendations(request):
    return render(request, 'movie_admin/recommendations.html')