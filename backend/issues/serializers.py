from rest_framework import serializers

from common.validators import (
    normalize_ai_analysis,
    normalize_condition_details,
    normalize_contact,
    normalize_preferences,
    normalize_resolution_details,
    normalize_symptoms,
)
from issues.models import BuyIssue, RepairIssue, SellIssue
from vehicles.models import UsedCar


def _clean_description(value):
    cleaned = value.strip()
    if not cleaned:
        raise serializers.ValidationError("Description is required.")
    return cleaned


class BuyIssueSerializer(serializers.ModelSerializer):
    class Meta:
        model = BuyIssue
        fields = (
            "id",
            "user",
            "description",
            "min_budget",
            "max_budget",
            "preferences",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "user", "created_at", "updated_at")
        extra_kwargs = {
            "min_budget": {"min_value": 0},
            "max_budget": {"min_value": 0},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is None:
            self.fields["status"].read_only = True

    def validate_description(self, value):
        return _clean_description(value)

    def validate_preferences(self, value):
        return normalize_preferences(value)

    def validate(self, attrs):
        min_budget = attrs.get("min_budget", getattr(self.instance, "min_budget", None))
        max_budget = attrs.get("max_budget", getattr(self.instance, "max_budget", None))
        if min_budget is not None and max_budget is not None and max_budget < min_budget:
            raise serializers.ValidationError(
                {"max_budget": "Maximum budget cannot be less than minimum budget."}
            )
        return attrs


class SellIssueSerializer(serializers.ModelSerializer):
    used_car = serializers.PrimaryKeyRelatedField(queryset=UsedCar.objects.all())

    class Meta:
        model = SellIssue
        fields = (
            "id",
            "user",
            "used_car",
            "description",
            "asking_price",
            "condition_details",
            "known_damage",
            "location",
            "contact_info",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "user", "created_at", "updated_at")
        extra_kwargs = {"asking_price": {"min_value": 0}}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is None:
            self.fields["status"].read_only = True

    def validate_description(self, value):
        return _clean_description(value)

    def validate_condition_details(self, value):
        return normalize_condition_details(value)

    def validate_contact_info(self, value):
        return normalize_contact(value)

    def validate_known_damage(self, value):
        return value.strip()

    def validate_location(self, value):
        return value.strip()


class RepairIssueSerializer(serializers.ModelSerializer):
    used_car = serializers.PrimaryKeyRelatedField(queryset=UsedCar.objects.all())

    class Meta:
        model = RepairIssue
        fields = (
            "id",
            "user",
            "used_car",
            "description",
            "symptoms",
            "ai_analysis",
            "status",
            "resolution_details",
            "resolved_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "user",
            "status",
            "resolution_details",
            "resolved_at",
            "created_at",
            "updated_at",
        )

    def validate_description(self, value):
        return _clean_description(value)

    def validate_symptoms(self, value):
        return normalize_symptoms(value)

    def validate_ai_analysis(self, value):
        return normalize_ai_analysis(value)


class ResolutionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[
            RepairIssue.Status.RESOLVED,
            RepairIssue.Status.UNRESOLVED,
            RepairIssue.Status.UNSURE,
        ]
    )
    resolution_details = serializers.JSONField()

    def validate_resolution_details(self, value):
        return normalize_resolution_details(value)
