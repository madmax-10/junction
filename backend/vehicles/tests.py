from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User

PASSWORD = "Sup3r-Secret-Pass"


def results(response):
    return response.data["results"]


class ApiFixture(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="ada@example.com",
            password=PASSWORD,
            name="Ada",
        )
        cls.other = User.objects.create_user(
            email="bea@example.com",
            password=PASSWORD,
            name="Bea",
        )
        cls.staff = User.objects.create_user(
            email="staff@example.com",
            password=PASSWORD,
            name="Staff",
            is_staff=True,
        )

    def setUp(self):
        self.client.force_authenticate(self.user)


class VehicleApiTests(ApiFixture):
    def test_health_and_login_stay_public(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/health/").status_code, status.HTTP_200_OK)
        login = self.client.post("/api/auth/login/", {}, format="json")
        self.assertEqual(login.status_code, status.HTTP_400_BAD_REQUEST)

    def test_new_car_reads_are_public_and_writes_are_staff_only(self):
        self.client.force_authenticate(self.staff)
        created = self.client.post(
            "/api/cars/new/",
            {"make": "Honda", "model": "Civic", "year": 2024, "trim": "EX", "msrp": "22000.00"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data["owner"], self.staff.id)
        car_id = created.data["id"]

        self.client.force_authenticate(None)
        listing = self.client.get("/api/cars/new/")
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(results(listing)[0]["make"], "Honda")
        detail = self.client.get(f"/api/cars/new/{car_id}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(self.user)
        denied = self.client.post(
            "/api/cars/new/",
            {"make": "Toyota", "model": "Camry", "year": 2024},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.staff)
        updated = self.client.patch(
            f"/api/cars/new/{car_id}/",
            {"trim": "Sport"},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["trim"], "Sport")
        deleted = self.client.delete(f"/api/cars/new/{car_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)

    def test_new_car_filters(self):
        self.client.force_authenticate(self.staff)
        self.client.post(
            "/api/cars/new/",
            {"make": "Honda", "model": "Civic", "year": 2020, "msrp": "18000.00"},
            format="json",
        )
        self.client.post(
            "/api/cars/new/",
            {"make": "Toyota", "model": "Camry", "year": 2024, "trim": "XLE", "msrp": "30000.00"},
            format="json",
        )
        self.client.force_authenticate(None)
        response = self.client.get("/api/cars/new/", {"make": "hon", "year_min": 2019, "msrp_max": 25000})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row["model"] for row in results(response)], ["Civic"])

    def test_used_cars_are_private_to_the_owner(self):
        created = self.client.post(
            "/api/cars/used/",
            {"make": "Honda", "model": "Civic", "year": 2018, "mileage": 40000, "condition": "Good"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        car_id = created.data["id"]

        self.client.force_authenticate(self.other)
        hidden = self.client.get("/api/cars/used/")
        self.assertEqual(results(hidden), [])
        missing = self.client.get(f"/api/cars/used/{car_id}/")
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(self.staff)
        staff_hidden = self.client.get(f"/api/cars/used/{car_id}/")
        self.assertEqual(staff_hidden.status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(None)
        anonymous = self.client.get("/api/cars/used/")
        self.assertEqual(anonymous.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_used_car_update_delete_and_filters(self):
        older = self.client.post(
            "/api/cars/used/",
            {"make": "Honda", "model": "Civic", "year": 2016, "mileage": 80000},
            format="json",
        )
        newer = self.client.post(
            "/api/cars/used/",
            {"make": "Toyota", "model": "Corolla", "year": 2021, "mileage": 15000},
            format="json",
        )
        filtered = self.client.get("/api/cars/used/", {"make": "toyota", "mileage_max": 20000, "year_min": 2020})
        self.assertEqual([row["id"] for row in results(filtered)], [newer.data["id"]])

        updated = self.client.patch(
            f"/api/cars/used/{older.data['id']}/",
            {"mileage": 81000},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["mileage"], 81000)
        deleted = self.client.delete(f"/api/cars/used/{older.data['id']}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)

    def test_rejects_invalid_year_mileage_and_price(self):
        response = self.client.post(
            "/api/cars/used/",
            {"make": "Honda", "model": "Civic", "year": 1800, "mileage": 10},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        negative = self.client.post(
            "/api/cars/used/",
            {"make": "Honda", "model": "Civic", "year": 2018, "mileage": -1},
            format="json",
        )
        self.assertEqual(negative.status_code, status.HTTP_400_BAD_REQUEST)
        self.client.force_authenticate(self.staff)
        priced = self.client.post(
            "/api/cars/new/",
            {"make": "Honda", "model": "Civic", "year": 2024, "msrp": "-1"},
            format="json",
        )
        self.assertEqual(priced.status_code, status.HTTP_400_BAD_REQUEST)
