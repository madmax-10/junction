from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, serializers, status
from rest_framework.exceptions import NotAuthenticated, NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from issues.photos import content_type_for, photo_file, relative_photo_path
from posts.filters import PostFilter
from posts.models import Post
from posts.serializers import GeneratePostSerializer, PostSerializer, PostUpdateSerializer
from posts.services import (
    approve_post,
    can_read_post,
    delete_post,
    generate_post,
    posts_for_user,
    update_draft,
)


class PostListView(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = PostSerializer
    filterset_class = PostFilter

    def get_queryset(self):
        if self.request.query_params.get("mine") == "true":
            if not self.request.user.is_authenticated:
                return Post.objects.none()
            queryset = posts_for_user(self.request.user)
            status_param = self.request.query_params.get("status")
            if status_param:
                if status_param not in Post.Status.values:
                    raise serializers.ValidationError({"status": "Invalid status."})
                queryset = queryset.filter(status=status_param)
            return queryset
        return Post.objects.filter(status=Post.Status.PUBLISHED)


class PostDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = PostSerializer
    queryset = Post.objects.all()
    lookup_field = "id"
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_object(self):
        post = super().get_object()
        if self.request.method in ("GET", "HEAD") and not can_read_post(self.request.user, post):
            raise NotFound("Post not found.")
        return post

    def partial_update(self, request, *args, **kwargs):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        post = self.get_object()
        serializer = PostUpdateSerializer(post, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        post = update_draft(request.user, post, serializer.validated_data)
        return Response(PostSerializer(post).data)

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        delete_post(request.user, self.get_object())
        return Response(status=status.HTTP_204_NO_CONTENT)


class GeneratePostView(APIView):
    def post(self, request):
        serializer = GeneratePostSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        post = generate_post(
            request.user,
            data["issue_type"],
            data["issue_id"],
            title=data.get("title", ""),
            content=data.get("content", ""),
            post_data=data.get("post_data"),
        )
        return Response(PostSerializer(post).data, status=status.HTTP_201_CREATED)


class ApprovePostView(APIView):
    def post(self, request, id):
        post = approve_post(request.user, id)
        return Response(PostSerializer(post).data)


class PostPhotoView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, id, filename):
        post = get_object_or_404(Post, pk=id)
        if not can_read_post(request.user, post):
            raise NotFound("Photo not found.")
        relative = relative_photo_path(post.issue_type, post.issue_id, filename)
        photos = (post.post_data or {}).get("photos") or []
        if relative not in photos:
            raise NotFound("Photo not found.")
        path = photo_file(post.issue_type, post.issue_id, filename)
        if path is None:
            raise NotFound("Photo not found.")
        return FileResponse(path.open("rb"), content_type=content_type_for(path.name))
