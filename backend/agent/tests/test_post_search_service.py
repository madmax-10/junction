import uuid
from decimal import Decimal

from django.test import TestCase

from agent.services.post_search_service import search_comparable_posts
from posts.models import Post


class ComparablePostSearchTests(TestCase):
    def create_post(self, *, make="Toyota", model="Camry", year=2020, mileage=40000,
                    asking_price="18000.00", status=Post.Status.PUBLISHED,
                    issue_type=Post.IssueType.SELL, location="Austin, TX", **extra):
        return Post.objects.create(
            id=uuid.uuid4(), issue_id=uuid.uuid4(), issue_type=issue_type,
            title=f"{year} {make} {model}", content="Synthetic isolated fixture.",
            post_data={
                "make": make, "model": model, "year": year, "mileage": mileage,
                "asking_price": asking_price, "location": location, **extra,
            }, status=status,
        )

    def search(self, location=None):
        return search_comparable_posts("Toyota", "Camry", (2018, 2022), (20000, 60000), location)

    def test_matching_toyota_sell_post_is_returned(self):
        post = self.create_post()
        result = self.search()
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["comparables"][0]["post_id"], str(post.id))
        self.assertEqual(result["comparables"][0]["asking_price"], Decimal("18000.00"))

    def test_different_make_model_and_issue_type_are_excluded(self):
        self.create_post(make="Honda", model="Civic")
        self.create_post(make="Toyota", model="Corolla")
        self.create_post(issue_type=Post.IssueType.BUY)
        result = self.search()
        self.assertEqual(result["status"], "no_results")
        self.assertEqual(result["comparables"], [])

    def test_year_and_mileage_ranges_are_inclusive(self):
        included = self.create_post(year=2018, mileage=60000)
        self.create_post(year=2017, mileage=40000)
        self.create_post(year=2022, mileage=60001)
        result = self.search()
        self.assertEqual([x["post_id"] for x in result["comparables"]], [str(included.id)])

    def test_draft_and_archived_posts_are_excluded(self):
        self.create_post(status=Post.Status.DRAFT)
        self.create_post(status=Post.Status.APPROVED)
        self.create_post(status=Post.Status.ARCHIVED)
        self.assertEqual(self.search()["comparables"], [])

    def test_missing_invalid_negative_and_nonfinite_prices_are_excluded(self):
        self.create_post(asking_price=None)
        self.create_post(asking_price="not-a-price")
        self.create_post(asking_price="-1.00")
        self.create_post(asking_price="Infinity")
        self.assertEqual(self.search()["comparables"], [])

    def test_explicit_synthetic_records_are_excluded(self):
        self.create_post(synthetic=True)
        self.create_post(is_synthetic=True)
        self.assertEqual(self.search()["comparables"], [])

    def test_location_filter_is_case_insensitive_substring_match(self):
        included = self.create_post(location="Austin, TX")
        self.create_post(location="Dallas, TX")
        result = self.search(location="austin")
        self.assertEqual([x["post_id"] for x in result["comparables"]], [str(included.id)])

    def test_empty_results_do_not_fabricate(self):
        result = search_comparable_posts("Toyota", "Camry", (2030, 2031), (1, 2), "Austin")
        self.assertEqual(result["status"], "no_results")
        self.assertEqual(result["comparables"], [])

    def test_fractional_bounds_are_rejected_before_querying(self):
        for index in range(4):
            for fraction in (0.5, Decimal("0.5")):
                bounds = [2018, 2022, 20000, 60000]
                bounds[index] += fraction
                with self.subTest(index=index, fraction=fraction):
                    with self.assertNumQueries(0), self.assertRaises(ValueError):
                        search_comparable_posts(
                            "Toyota", "Camry", bounds[:2], bounds[2:]
                        )

    def test_reversed_ranges_are_rejected_before_querying(self):
        for years, mileage in (
            ((2022, 2018), (20000, 60000)),
            ((2018, 2022), (60000, 20000)),
        ):
            with self.subTest(years=years, mileage=mileage):
                with self.assertNumQueries(0), self.assertRaises(ValueError):
                    search_comparable_posts("Toyota", "Camry", years, mileage)

    def test_malformed_ranges_are_rejected_consistently(self):
        malformed = [
            None, 2020, "12", b"12", {2018, 2022}, {2018: 1, 2022: 2},
            [], [2018], [2018, 2020, 2022], [None, 2022], [True, 2022],
            [2018, False], ["2018", "2022"], [2018.0, 2022],
            [Decimal("2018"), 2022], [float("inf"), 2022],
            [2018, float("nan")], [2018, "invalid"],
        ]
        for bounds in malformed:
            for index in (0, 1):
                ranges = [(2018, 2022), (20000, 60000)]
                ranges[index] = bounds
                with self.subTest(bounds=bounds, range_index=index):
                    with self.assertNumQueries(0), self.assertRaises(ValueError):
                        search_comparable_posts("Toyota", "Camry", *ranges)
        with self.assertNumQueries(0), self.assertRaises(ValueError):
            search_comparable_posts("Toyota", "Camry", (2018, 2022), (-1, 60000))

    def test_valid_integer_lists_tuples_and_equal_bounds_still_match(self):
        included = self.create_post(year=2020, mileage=0)
        for years, mileage in (
            ([2018, 2022], [0, 60000]),
            ((2020, 2020), (0, 0)),
        ):
            with self.subTest(years=years, mileage=mileage):
                result = search_comparable_posts("Toyota", "Camry", years, mileage)
                self.assertEqual(result["status"], "completed")
                self.assertEqual(
                    [item["post_id"] for item in result["comparables"]],
                    [str(included.id)],
                )

