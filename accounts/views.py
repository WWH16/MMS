from django.shortcuts import render

def index(request):
    return render(request, 'accounts/index.html')

def signin(request):
    return render(request, 'accounts/signin.html')

def signup(request):
    return render(request, 'accounts/signup.html')

def homeFeed(request):
    return render(request, 'accounts/homeFeed.html', {'active_page': 'browse'})

def myList(request):
    return render(request, 'accounts/myList.html', {'active_page': 'mylist'})

def recommendations(request):
    return render(request, 'accounts/recommendations.html', {'active_page': 'recommendations'})