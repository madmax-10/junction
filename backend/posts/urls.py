from django.urls import path

from posts.views import ApprovePostView, GeneratePostView, PostDetailView, PostListView, PostPhotoView

urlpatterns = [
    path("", PostListView.as_view(), name="post-list"),
    path("generate/", GeneratePostView.as_view(), name="post-generate"),
    path("<uuid:id>/", PostDetailView.as_view(), name="post-detail"),
    path("<uuid:id>/approve/", ApprovePostView.as_view(), name="post-approve"),
    path("<uuid:id>/photos/<str:filename>/", PostPhotoView.as_view(), name="post-photo"),
]
