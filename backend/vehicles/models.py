import uuid

from django.conf import settings
from django.db import models


class NewCar(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="new_cars",
    )
    make = models.CharField(max_length=100)
    model = models.CharField(max_length=100)
    year = models.PositiveIntegerField()
    trim = models.CharField(max_length=100, blank=True)
    msrp = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "new_cars"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["make", "model", "year"]),
        ]
        constraints = [
            models.CheckConstraint(check=models.Q(year__gte=1900), name="new_car_year_min"),
            models.CheckConstraint(
                check=models.Q(msrp__isnull=True) | models.Q(msrp__gte=0),
                name="new_car_msrp_nonnegative",
            ),
        ]

    def __str__(self):
        return f"{self.year} {self.make} {self.model}"


class UsedCar(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="used_cars",
    )
    make = models.CharField(max_length=100)
    model = models.CharField(max_length=100)
    year = models.PositiveIntegerField()
    trim = models.CharField(max_length=100, blank=True)
    mileage = models.PositiveIntegerField()
    condition = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "used_cars"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "make"]),
            models.Index(fields=["make", "model", "year"]),
        ]
        constraints = [
            models.CheckConstraint(check=models.Q(year__gte=1900), name="used_car_year_min"),
            models.CheckConstraint(check=models.Q(mileage__gte=0), name="used_car_mileage_nonnegative"),
        ]

    def __str__(self):
        return f"{self.year} {self.make} {self.model}"
