from django.db.models.deletion import ProtectedError
from rest_framework import generics, permissions, status
from rest_framework.response import Response

from vehicles.filters import NewCarFilter, UsedCarFilter
from vehicles.models import NewCar, UsedCar
from vehicles.serializers import NewCarSerializer, UsedCarSerializer
from vehicles.services import (
    create_new_car,
    create_used_car,
    delete_new_car,
    delete_used_car,
    update_new_car,
    update_used_car,
)


class NewCarListCreateView(generics.ListCreateAPIView):
    serializer_class = NewCarSerializer
    queryset = NewCar.objects.all()
    filterset_class = NewCarFilter

    def get_permissions(self):
        if self.request.method == "POST":
            return [permissions.IsAdminUser()]
        return [permissions.AllowAny()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        car = create_new_car(request.user, serializer.validated_data)
        return Response(self.get_serializer(car).data, status=status.HTTP_201_CREATED)


class NewCarDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = NewCarSerializer
    queryset = NewCar.objects.all()
    lookup_field = "id"
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [permissions.AllowAny()]
        return [permissions.IsAdminUser()]

    def partial_update(self, request, *args, **kwargs):
        car = self.get_object()
        serializer = self.get_serializer(car, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        car = update_new_car(car, serializer.validated_data)
        return Response(self.get_serializer(car).data)

    def destroy(self, request, *args, **kwargs):
        delete_new_car(self.get_object())
        return Response(status=status.HTTP_204_NO_CONTENT)


class UsedCarListCreateView(generics.ListCreateAPIView):
    serializer_class = UsedCarSerializer
    filterset_class = UsedCarFilter

    def get_queryset(self):
        return UsedCar.objects.filter(owner=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        car = create_used_car(request.user, serializer.validated_data)
        return Response(self.get_serializer(car).data, status=status.HTTP_201_CREATED)


class UsedCarDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UsedCarSerializer
    lookup_field = "id"
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return UsedCar.objects.filter(owner=self.request.user)

    def partial_update(self, request, *args, **kwargs):
        car = self.get_object()
        serializer = self.get_serializer(car, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        car = update_used_car(car, serializer.validated_data)
        return Response(self.get_serializer(car).data)

    def destroy(self, request, *args, **kwargs):
        try:
            delete_used_car(self.get_object())
        except ProtectedError:
            return Response(
                {"detail": "Delete this car's issues before deleting the car."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
