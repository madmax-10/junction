# Car Owner Hub

Car Owner Hub helps people repair, sell, and buy cars. A signed-in user registers a vehicle, opens a repair, sell, or buy issue, and can ask an assistant to research it. A post stays private until that user approves it.

Repair is the main path. Sell and buy use the same accounts, vehicles, and approval rule. The platform is not limited to one manufacturer. Purchases, payments, and mechanic bookings happen outside the app.

The design documents below are the product specification. `backend/` is a Django REST Framework project with an `accounts` app for registration and JWT login. Other domain models and the frontend are not built yet.

- [Database design](car_owner_hub_database_design.md) defines the PostgreSQL models and the Django REST API.
- [System architecture](system_architecture_design.md) describes how the product behaves on that data model.
