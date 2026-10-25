import uuid

from django.db import models


class Post(models.Model):
    class IssueType(models.TextChoices):
        BUY = "buy", "Buy"
        SELL = "sell", "Sell"
        REPAIR = "repair", "Repair"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        APPROVED = "approved", "Approved"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    issue_id = models.UUIDField()
    issue_type = models.CharField(max_length=10, choices=IssueType.choices)
    title = models.CharField(max_length=255)
    content = models.TextField()
    post_data = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "posts"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["issue_type", "status"]),
            models.Index(fields=["issue_id", "issue_type"]),
        ]

    def __str__(self):
        return self.title
