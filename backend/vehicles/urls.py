from django.urls import path

from vehicles.views import (
    NewCarDetailView,
    NewCarListCreateView,
    UsedCarDetailView,
    UsedCarListCreateView,
)

urlpatterns = [
    path("new/", NewCarListCreateView.as_view(), name="new-car-list"),
    path("new/<uuid:id>/", NewCarDetailView.as_view(), name="new-car-detail"),
    path("used/", UsedCarListCreateView.as_view(), name="used-car-list"),
    path("used/<uuid:id>/", UsedCarDetailView.as_view(), name="used-car-detail"),
]
