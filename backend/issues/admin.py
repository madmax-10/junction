from django.contrib import admin

from issues.models import BuyIssue, RepairIssue, SellIssue


@admin.register(BuyIssue)
class BuyIssueAdmin(admin.ModelAdmin):
    list_display = ("description", "user", "status", "min_budget", "max_budget", "created_at")
    list_filter = ("status",)
    search_fields = ("description", "user__email")


@admin.register(SellIssue)
class SellIssueAdmin(admin.ModelAdmin):
    list_display = ("description", "user", "used_car", "asking_price", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("description", "user__email", "location")


@admin.register(RepairIssue)
class RepairIssueAdmin(admin.ModelAdmin):
    list_display = ("description", "user", "used_car", "status", "resolved_at", "created_at")
    list_filter = ("status",)
    search_fields = ("description", "user__email")
