from django.contrib import admin

from vehicles.models import NewCar, UsedCar


@admin.register(NewCar)
class NewCarAdmin(admin.ModelAdmin):
    list_display = ("year", "make", "model", "trim", "msrp", "owner", "created_at")
    search_fields = ("make", "model", "trim")
    list_filter = ("make", "year")


@admin.register(UsedCar)
class UsedCarAdmin(admin.ModelAdmin):
    list_display = ("year", "make", "model", "mileage", "owner", "created_at")
    search_fields = ("make", "model", "trim", "owner__email")
    list_filter = ("make", "year")
