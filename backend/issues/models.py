import uuid

from django.conf import settings
from django.db import models

from vehicles.models import UsedCar


class BuyIssue(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        CLOSED = "closed", "Closed"

    issue_type = "buy"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="buy_issues",
    )
    description = models.TextField()
    min_budget = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    max_budget = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    preferences = models.JSONField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "buy_issues"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(min_budget__isnull=True) | models.Q(min_budget__gte=0),
                name="buy_issue_min_budget_nonnegative",
            ),
            models.CheckConstraint(
                check=models.Q(max_budget__isnull=True) | models.Q(max_budget__gte=0),
                name="buy_issue_max_budget_nonnegative",
            ),
            models.CheckConstraint(
                check=models.Q(min_budget__isnull=True)
                | models.Q(max_budget__isnull=True)
                | models.Q(max_budget__gte=models.F("min_budget")),
                name="buy_issue_budget_order",
            ),
        ]

    def __str__(self):
        return self.description[:50]


class SellIssue(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        CLOSED = "closed", "Closed"

    issue_type = "sell"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sell_issues",
    )
    used_car = models.ForeignKey(UsedCar, on_delete=models.PROTECT, related_name="sell_issues")
    description = models.TextField()
    asking_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    condition_details = models.JSONField(null=True, blank=True)
    known_damage = models.TextField(blank=True)
    location = models.CharField(max_length=255, blank=True)
    contact_info = models.JSONField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "sell_issues"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["used_car"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(asking_price__isnull=True) | models.Q(asking_price__gte=0),
                name="sell_issue_asking_price_nonnegative",
            ),
        ]

    def __str__(self):
        return self.description[:50]


class RepairIssue(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        RESOLVED = "resolved", "Resolved"
        UNRESOLVED = "unresolved", "Unresolved"
        UNSURE = "unsure", "Unsure"

    issue_type = "repair"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="repair_issues",
    )
    used_car = models.ForeignKey(UsedCar, on_delete=models.PROTECT, related_name="repair_issues")
    description = models.TextField()
    symptoms = models.JSONField(null=True, blank=True)
    ai_analysis = models.JSONField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    resolution_details = models.JSONField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "repair_issues"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["used_car"]),
        ]

    def __str__(self):
        return self.description[:50]
