from django.shortcuts import render

def homeFeed(request):
    return render(request, 'accounts/homeFeed.html')

def myList(request):
    # In a real scenario, you'd fetch movies here:
    # movies = Movie.objects.filter(user=request.user)
    # return render(request, 'accounts/myList.html', {'movies': movies})
    return render(request, 'accounts/myList.html')

def index(request):
    return render(request, 'accounts/index.html')

def signup(request):
    return render(request, 'accounts/signup.html')

def signin(request):
    return render(request, 'accounts/signin.html')

def recommendations(request):
    return render(request, 'accounts/recommendations.html')