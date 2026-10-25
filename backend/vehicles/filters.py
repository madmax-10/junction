import django_filters

from vehicles.models import NewCar, UsedCar


class NewCarFilter(django_filters.FilterSet):
    make = django_filters.CharFilter(lookup_expr="icontains")
    model = django_filters.CharFilter(lookup_expr="icontains")
    trim = django_filters.CharFilter(lookup_expr="icontains")
    year = django_filters.NumberFilter()
    year_min = django_filters.NumberFilter(field_name="year", lookup_expr="gte")
    year_max = django_filters.NumberFilter(field_name="year", lookup_expr="lte")
    msrp_min = django_filters.NumberFilter(field_name="msrp", lookup_expr="gte")
    msrp_max = django_filters.NumberFilter(field_name="msrp", lookup_expr="lte")

    class Meta:
        model = NewCar
        fields = []


class UsedCarFilter(django_filters.FilterSet):
    make = django_filters.CharFilter(lookup_expr="icontains")
    model = django_filters.CharFilter(lookup_expr="icontains")
    year = django_filters.NumberFilter()
    year_min = django_filters.NumberFilter(field_name="year", lookup_expr="gte")
    year_max = django_filters.NumberFilter(field_name="year", lookup_expr="lte")
    mileage_min = django_filters.NumberFilter(field_name="mileage", lookup_expr="gte")
    mileage_max = django_filters.NumberFilter(field_name="mileage", lookup_expr="lte")

    class Meta:
        model = UsedCar
        fields = []
