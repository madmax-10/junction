import django_filters
from django.db.models import FloatField, Q
from django.db.models.fields.json import KeyTextTransform
from django.db.models.functions import Cast

from posts.models import Post


def _annotate_prices(queryset):
    if "asking_price_num" in queryset.query.annotations:
        return queryset
    return queryset.annotate(
        asking_price_num=Cast(KeyTextTransform("asking_price", "post_data"), FloatField()),
        max_budget_num=Cast(KeyTextTransform("max_budget", "post_data"), FloatField()),
        cost_num=Cast(KeyTextTransform("cost", "post_data"), FloatField()),
    )


def _price_query(lookup, value):
    number = float(value)
    return (
        Q(issue_type=Post.IssueType.SELL, **{f"asking_price_num__{lookup}": number})
        | Q(issue_type=Post.IssueType.BUY, **{f"max_budget_num__{lookup}": number})
        | Q(issue_type=Post.IssueType.REPAIR, **{f"cost_num__{lookup}": number})
    )


class PostFilter(django_filters.FilterSet):
    issue_type = django_filters.ChoiceFilter(choices=Post.IssueType.choices)
    make = django_filters.CharFilter(method="filter_make")
    model = django_filters.CharFilter(method="filter_model")
    year = django_filters.NumberFilter(method="filter_year")
    year_min = django_filters.NumberFilter(method="filter_year_min")
    year_max = django_filters.NumberFilter(method="filter_year_max")
    price_min = django_filters.NumberFilter(method="filter_price_min")
    price_max = django_filters.NumberFilter(method="filter_price_max")
    location = django_filters.CharFilter(method="filter_location")

    class Meta:
        model = Post
        fields = []

    def filter_make(self, queryset, name, value):
        return queryset.filter(
            Q(post_data__make__icontains=value) | Q(post_data__preferred_makes__icontains=value)
        )

    def filter_model(self, queryset, name, value):
        return queryset.filter(
            Q(post_data__model__icontains=value) | Q(post_data__preferred_models__icontains=value)
        )

    def filter_year(self, queryset, name, value):
        year = int(value)
        return queryset.filter(Q(post_data__year=year) | Q(post_data__minimum_year=year))

    def filter_year_min(self, queryset, name, value):
        year = int(value)
        return queryset.filter(Q(post_data__year__gte=year) | Q(post_data__minimum_year__gte=year))

    def filter_year_max(self, queryset, name, value):
        year = int(value)
        return queryset.filter(Q(post_data__year__lte=year) | Q(post_data__minimum_year__lte=year))

    def filter_location(self, queryset, name, value):
        return queryset.filter(post_data__location__icontains=value)

    def filter_price_min(self, queryset, name, value):
        return _annotate_prices(queryset).filter(_price_query("gte", value))

    def filter_price_max(self, queryset, name, value):
        return _annotate_prices(queryset).filter(_price_query("lte", value))
