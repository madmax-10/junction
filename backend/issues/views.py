from django.http import FileResponse
from rest_framework import generics, serializers, status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from issues.filters import BuyIssueFilter, RepairIssueFilter, SellIssueFilter
from issues.models import BuyIssue, RepairIssue, SellIssue
from issues.photos import content_type_for, delete_photo_file, list_photos, photo_file, save_photo
from issues.serializers import (
    BuyIssueSerializer,
    RepairIssueSerializer,
    ResolutionSerializer,
    SellIssueSerializer,
)
from issues.services import (
    create_buy_issue,
    create_repair_issue,
    create_sell_issue,
    delete_issue,
    get_owned_issue,
    record_resolution,
    update_buy_issue,
    update_repair_issue,
    update_sell_issue,
)


class OwnedIssueListCreateView(generics.ListCreateAPIView):
    model = None
    select_related_fields = ()
    create_service = None

    def get_queryset(self):
        queryset = self.model.objects.filter(user=self.request.user)
        if self.select_related_fields:
            queryset = queryset.select_related(*self.select_related_fields)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        issue = self.create_service(request.user, serializer.validated_data)
        return Response(self.get_serializer(issue).data, status=status.HTTP_201_CREATED)


class OwnedIssueDetailView(generics.RetrieveUpdateDestroyAPIView):
    model = None
    lookup_field = "id"
    select_related_fields = ()
    update_service = None
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        queryset = self.model.objects.filter(user=self.request.user)
        if self.select_related_fields:
            queryset = queryset.select_related(*self.select_related_fields)
        return queryset

    def partial_update(self, request, *args, **kwargs):
        issue = self.get_object()
        serializer = self.get_serializer(issue, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        issue = self.update_service(issue, serializer.validated_data)
        return Response(self.get_serializer(issue).data)

    def destroy(self, request, *args, **kwargs):
        delete_issue(self.get_object())
        return Response(status=status.HTTP_204_NO_CONTENT)


class BuyIssueListCreateView(OwnedIssueListCreateView):
    serializer_class = BuyIssueSerializer
    model = BuyIssue
    filterset_class = BuyIssueFilter
    create_service = staticmethod(create_buy_issue)


class BuyIssueDetailView(OwnedIssueDetailView):
    serializer_class = BuyIssueSerializer
    model = BuyIssue
    update_service = staticmethod(update_buy_issue)


class SellIssueListCreateView(OwnedIssueListCreateView):
    serializer_class = SellIssueSerializer
    model = SellIssue
    filterset_class = SellIssueFilter
    select_related_fields = ("used_car",)
    create_service = staticmethod(create_sell_issue)


class SellIssueDetailView(OwnedIssueDetailView):
    serializer_class = SellIssueSerializer
    model = SellIssue
    select_related_fields = ("used_car",)
    update_service = staticmethod(update_sell_issue)


class RepairIssueListCreateView(OwnedIssueListCreateView):
    serializer_class = RepairIssueSerializer
    model = RepairIssue
    filterset_class = RepairIssueFilter
    select_related_fields = ("used_car",)
    create_service = staticmethod(create_repair_issue)


class RepairIssueDetailView(OwnedIssueDetailView):
    serializer_class = RepairIssueSerializer
    model = RepairIssue
    select_related_fields = ("used_car",)
    update_service = staticmethod(update_repair_issue)


class RepairResolutionView(APIView):
    def patch(self, request, id):
        issue = get_owned_issue(request.user, "repair", id)
        serializer = ResolutionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        issue = record_resolution(
            issue,
            serializer.validated_data["status"],
            serializer.validated_data["resolution_details"],
        )
        return Response(RepairIssueSerializer(issue).data)


class IssuePhotoListView(APIView):
    def get(self, request, intent, id):
        issue = get_owned_issue(request.user, intent, id)
        return Response({"photos": list_photos(issue)})

    def post(self, request, intent, id):
        issue = get_owned_issue(request.user, intent, id)
        uploaded = request.FILES.get("file")
        if uploaded is None:
            raise serializers.ValidationError({"file": "A photo file is required."})
        return Response(save_photo(issue, uploaded), status=status.HTTP_201_CREATED)


class IssuePhotoDetailView(APIView):
    def get(self, request, intent, id, filename):
        issue = get_owned_issue(request.user, intent, id)
        path = photo_file(issue.issue_type, issue.id, filename)
        if path is None:
            raise NotFound("Photo not found.")
        return FileResponse(path.open("rb"), content_type=content_type_for(path.name))

    def delete(self, request, intent, id, filename):
        issue = get_owned_issue(request.user, intent, id)
        if delete_photo_file(issue, filename) is None:
            raise NotFound("Photo not found.")
        return Response(status=status.HTTP_204_NO_CONTENT)
