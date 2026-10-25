import django_filters
from django.db.models import Q

from issues.models import BuyIssue, RepairIssue, SellIssue


class BuyIssueFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=BuyIssue.Status.choices)
    min_budget = django_filters.NumberFilter(method="filter_min_budget")
    max_budget = django_filters.NumberFilter(method="filter_max_budget")

    class Meta:
        model = BuyIssue
        fields = []

    def filter_min_budget(self, queryset, name, value):
        return queryset.filter(Q(max_budget__isnull=True) | Q(max_budget__gte=value))

    def filter_max_budget(self, queryset, name, value):
        return queryset.filter(Q(min_budget__isnull=True) | Q(min_budget__lte=value))


class SellIssueFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=SellIssue.Status.choices)
    used_car = django_filters.UUIDFilter(field_name="used_car")
    location = django_filters.CharFilter(lookup_expr="icontains")
    asking_price_min = django_filters.NumberFilter(field_name="asking_price", lookup_expr="gte")
    asking_price_max = django_filters.NumberFilter(field_name="asking_price", lookup_expr="lte")

    class Meta:
        model = SellIssue
        fields = []


class RepairIssueFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=RepairIssue.Status.choices)
    used_car = django_filters.UUIDFilter(field_name="used_car")

    class Meta:
        model = RepairIssue
        fields = []
