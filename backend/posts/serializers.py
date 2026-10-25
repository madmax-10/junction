from rest_framework import serializers

from posts.models import Post
from posts.validation import normalize_post_data


class PostSerializer(serializers.ModelSerializer):
    class Meta:
        model = Post
        fields = (
            "id",
            "issue_id",
            "issue_type",
            "title",
            "content",
            "post_data",
            "status",
            "approved_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class GeneratePostSerializer(serializers.Serializer):
    issue_type = serializers.ChoiceField(choices=Post.IssueType.choices)
    issue_id = serializers.UUIDField()
    title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    content = serializers.CharField(required=False, allow_blank=True)
    post_data = serializers.JSONField(required=False)

    def validate(self, attrs):
        post_data = attrs.get("post_data")
        if post_data is not None:
            try:
                attrs["post_data"] = normalize_post_data(
                    attrs["issue_type"],
                    attrs["issue_id"],
                    post_data,
                )
            except serializers.ValidationError as exc:
                raise serializers.ValidationError({"post_data": exc.detail})
        return attrs


class PostUpdateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255, required=False)
    content = serializers.CharField(required=False)
    post_data = serializers.JSONField(required=False)

    def validate_post_data(self, value):
        post = self.instance
        if not isinstance(value, dict):
            raise serializers.ValidationError("Expected an object.")
        if post.issue_type == Post.IssueType.REPAIR and "owner_reported" not in value:
            value = {**value, "owner_reported": True}
        try:
            return normalize_post_data(post.issue_type, post.issue_id, value)
        except serializers.ValidationError as exc:
            raise serializers.ValidationError(exc.detail)
