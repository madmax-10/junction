from django.contrib import admin

from posts.models import Post


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("title", "issue_type", "status", "approved_at", "created_at")
    list_filter = ("issue_type", "status")
    search_fields = ("title", "content")
