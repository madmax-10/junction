from rest_framework import serializers

from common.validators import validate_model_year
from vehicles.models import NewCar, UsedCar


def _clean_name(value, label):
    cleaned = value.strip()
    if not cleaned:
        raise serializers.ValidationError(f"{label} is required.")
    return cleaned


class NewCarSerializer(serializers.ModelSerializer):
    class Meta:
        model = NewCar
        fields = ("id", "owner", "make", "model", "year", "trim", "msrp", "created_at")
        read_only_fields = ("id", "owner", "created_at")
        extra_kwargs = {"msrp": {"min_value": 0}}

    def validate_make(self, value):
        return _clean_name(value, "Make")

    def validate_model(self, value):
        return _clean_name(value, "Model")

    def validate_year(self, value):
        return validate_model_year(value)

    def validate_trim(self, value):
        return value.strip()


class UsedCarSerializer(serializers.ModelSerializer):
    class Meta:
        model = UsedCar
        fields = (
            "id",
            "owner",
            "make",
            "model",
            "year",
            "trim",
            "mileage",
            "condition",
            "created_at",
        )
        read_only_fields = ("id", "owner", "created_at")

    def validate_make(self, value):
        return _clean_name(value, "Make")

    def validate_model(self, value):
        return _clean_name(value, "Model")

    def validate_year(self, value):
        return validate_model_year(value)

    def validate_trim(self, value):
        return value.strip()

    def validate_condition(self, value):
        return value.strip()
