from django.urls import path

from issues.views import (
    BuyIssueDetailView,
    BuyIssueListCreateView,
    IssuePhotoDetailView,
    IssuePhotoListView,
    RepairIssueDetailView,
    RepairIssueListCreateView,
    RepairResolutionView,
    SellIssueDetailView,
    SellIssueListCreateView,
)

urlpatterns = [
    path("buy/", BuyIssueListCreateView.as_view(), name="buy-issue-list"),
    path("buy/<uuid:id>/", BuyIssueDetailView.as_view(), name="buy-issue-detail"),
    path("sell/", SellIssueListCreateView.as_view(), name="sell-issue-list"),
    path("sell/<uuid:id>/", SellIssueDetailView.as_view(), name="sell-issue-detail"),
    path("repair/", RepairIssueListCreateView.as_view(), name="repair-issue-list"),
    path("repair/<uuid:id>/resolution/", RepairResolutionView.as_view(), name="repair-issue-resolution"),
    path("repair/<uuid:id>/", RepairIssueDetailView.as_view(), name="repair-issue-detail"),
    path("<str:intent>/<uuid:id>/photos/", IssuePhotoListView.as_view(), name="issue-photo-list"),
    path(
        "<str:intent>/<uuid:id>/photos/<str:filename>/",
        IssuePhotoDetailView.as_view(),
        name="issue-photo-detail",
    ),
]
