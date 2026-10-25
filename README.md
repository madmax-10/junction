# Junction

Junction helps people after a car accident find what others in a similar situation decided, what happened next, and what they learned. The assistant answers from retrieved community posts. It does not invent experiences, statistics, or outcomes, and it does not treat repair, selling, or replacement as a final recommendation.

The main path is: describe the situation, find similar experiences, read the outcomes, then share your own story if you want to. A post stays private until that person approves it. The marketplace, for listing a damaged car or looking at replacements, is secondary. Purchases, payments, and shop bookings happen outside the app.

The running app is branded Junction. The design documents below still use the earlier name, Car Owner Hub.

## Layout

| Path | What it is |
| --- | --- |
| `frontend/` | React, TypeScript, and Vite client |
| `backend/` | Django REST API, domain models, and the Google ADK assistant |
| [Database design](car_owner_hub_database_design.md) | Tables, columns, and invariants |
| [System architecture](system_architecture_design.md) | How the product behaves on that data model |
| [Agent architecture](car_owner_hub_agent_architecture.md) | The six agents, tools, and chat event history |

## Prerequisites

- Node.js and npm
- Python 3.10 or newer

## Backend

From `backend/`:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Add a `SECRET_KEY` to `backend/.env`. Django reads it on startup and will not boot without one. The other variables in `.env.example` are optional until you use that feature:

- `GOOGLE_API_KEY` and `AGENT_MODEL` run the assistant (Google ADK / Gemini).
- `MODEL_API_KEY` reads images.
- `SERPAPI_API_KEY` looks up nearby repair shops.
- `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` default to local Vite (`http://localhost:5173`) and Django.

Local data is SQLite at `backend/db.sqlite3`. Create the tables, load synthetic demo data, and start the API:

```bash
python manage.py migrate
python manage.py seed_mock_data
python manage.py runserver
```

The API listens at `http://127.0.0.1:8000`. `seed_mock_data` creates accounts on `mock.local` only. Every one of those accounts uses the password `MockData-2026`. Two logins are fixed:

- `demo@mock.local` is a sample driver.
- `admin@mock.local` is a staff superuser.

Re-run the seed with `--clear` to replace existing `*@mock.local` rows. `--users` and `--seed` change the volume and the random sequence. This data is synthetic demo content.

Check the API with `GET /api/health/`.

## Frontend

From `frontend/`:

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. `VITE_API_URL` defaults to `http://127.0.0.1:8000`.

Sign in to reach the workspace. Public routes are the landing page (`/`), the describe flow (`/describe`), and sign-in (`/sign-in`). Chat (`/chat`), stories (`/stories`), and the marketplace (`/marketplace`) require an account.

## API

All routes sit under `/api/`. Authenticated routes expect `Authorization: Bearer <access token>` from `POST /api/auth/login/`.

| Prefix | Owns |
| --- | --- |
| `/api/auth/` | Register, login, refresh, and the current user |
| `/api/cars/` | New-car catalog and the signed-in user's used cars |
| `/api/issues/` | Buy, sell, and repair issues, plus issue photos |
| `/api/posts/` | Drafts, approval, and published posts |
| `/api/chat/turns/` | One assistant turn. The client sends the event history and appends the new events |

## Checks

Backend, from `backend/` with the virtualenv active:

```bash
python manage.py test
```

Frontend, from `frontend/`:

```bash
npm run lint
npm run build
```
