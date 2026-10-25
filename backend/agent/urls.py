from django.urls import path

from agent.views import ChatTurnView

urlpatterns = [
    path("turns/", ChatTurnView.as_view(), name="chat-turn"),
]
