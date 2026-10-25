from django.urls import path

from agent.views import ChatPhotoView, ChatTurnView

urlpatterns = [
    path("turns/", ChatTurnView.as_view(), name="chat-turn"),
    path("photos/", ChatPhotoView.as_view(), name="chat-photo"),
]
