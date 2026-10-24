from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from accounts.models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "name", "email", "is_staff", "date_joined")
        read_only_fields = fields


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ("id", "name", "email", "password")
        read_only_fields = ("id",)

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Name is required.")
        return name

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, attrs):
        candidate = User(name=attrs["name"], email=attrs["email"])
        validate_password(attrs["password"], candidate)
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)
