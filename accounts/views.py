from django.shortcuts import render
from django.conf import settings

def index(request):
    return render(request, 'accounts/index.html')

def signin(request):
    return render(request, 'accounts/signin.html', {
        'recaptcha_site_key': settings.RECAPTCHA_SITE_KEY
    })

def signup(request):
    return render(request, 'accounts/signup.html', {
        'recaptcha_site_key': settings.RECAPTCHA_SITE_KEY
    })

def homeFeed(request):
    return render(request, 'accounts/homeFeed.html', {'active_page': 'browse'})

def myList(request):
    return render(request, 'accounts/myList.html', {'active_page': 'mylist'})

def recommendations(request):
    return render(request, 'accounts/recommendations.html', {'active_page': 'recommendations'})