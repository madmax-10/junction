# Agent 6 — Task 6.5: Nearby repair businesses

## Purpose and signature

```python
find_nearby_mechanics(repair_issue_id, latitude, longitude,
                     radius_meters=10000, limit=5, *, user=None)
```

This synchronous Django service makes a real Google Places API (New) HTTP
request after authorizing the owner's private repair report. It discovers nearby
`car_repair` businesses; it does not diagnose a fault, endorse a business or
integrate the Google ADK Repair Agent yet. There is no fabricated runtime data.
Tests use explicitly synthetic fixtures behind a mocked HTTP boundary.

The user reported Task 6.4 complete. Tasks 6.1–6.4, their tests, the existing
models, shared authentication, configuration and service envelopes were inspected.
The existing environment provides `httpx` 0.28.1 through installed dependencies;
no new dependency or shared configuration change was needed. There was no
existing Maps/Places client or dedicated Places/Maps environment variable.

## Inputs and trusted authorization

The keyword-only user follows the established Repair service contract: trusted
server code supplies JWT-authenticated `request.user`, or a user obtained from
the existing [ADK identity bridge](../auth.py). Never turn a model/client-supplied
user ID into authorization. Missing, anonymous, unsaved, inactive or deleted
users cannot authorize a request. Current database activity is rechecked.

The report ID accepts a UUID or UUID string. The
[RepairIssue](../../issues/models.py) lookup requires both its user and its
related [UsedCar](../../vehicles/models.py) owner to match the authenticated user.
The ORM uses an existence query: no description, symptoms, AI analysis, vehicle
specifications or repair history are loaded. Staff status gives no override.
Malformed, missing, foreign and inconsistent references return the same generic
`Repair issue not found.` error without public or private results.

| Input | Validation |
| --- | --- |
| latitude | Finite int, float or Decimal, inclusive -90 through 90 |
| longitude | Finite int, float or Decimal, inclusive -180 through 180 |
| radius_meters | Finite int, float or Decimal, inclusive 1 through 50000 |
| limit | Integer 1 through 10, default 5 |

Booleans, numeric strings, null coordinates, NaN, infinity and unsupported values
are rejected. Omitting a required coordinate entirely is a Python signature
error; explicitly passing null returns the structured validation error. Radius
defaults to 10000 meters. Coordinates/radius are converted to finite JSON numbers
only after validation. Zero latitude/longitude are valid.

The caller must obtain an explicitly supplied or authorized user location before
invoking this function. A numeric coordinate cannot itself prove consent. The
function does not infer location from IP, profiles or vehicle data, collect GPS,
resolve city/ZIP codes or store coordinates. A later Coordinator must use an
approved separate location-resolution flow for city/ZIP input.

## Google request and configuration

The implementation follows Google's official
[Nearby Search (New) documentation](https://developers.google.com/maps/documentation/places/web-service/nearby-search).
It sends one POST to `https://places.googleapis.com/v1/places:searchNearby`.
The body includes `includedTypes: ["car_repair"]`, the validated result limit,
`rankPreference: "DISTANCE"`, and the supplied circle center and radius.

For example, these coordinates are documentation/test inputs, never an inferred
user location:

```json
{
  "includedTypes": ["car_repair"],
  "maxResultCount": 5,
  "rankPreference": "DISTANCE",
  "locationRestriction": {
    "circle": {
      "center": {"latitude": 30.2672, "longitude": -97.7431},
      "radius": 10000
    }
  }
}
```

Configure a server-only `GOOGLE_PLACES_API_KEY` through the backend process
environment or the existing dotenv-loaded backend configuration. The existing
[settings](../../config/settings.py) already load the backend environment file;
this task changes neither settings nor that file. Enable Places API (New) with
appropriate billing, API and server restrictions in the Google project. The
Gemini `GOOGLE_API_KEY` is not silently reused as a Places credential.

Required request headers are `Content-Type: application/json`, the configured
key in `X-Goog-Api-Key`, and this exact `X-Goog-FieldMask`:

```text
places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.location
```

No wildcard, phone, reviews, ratings, hours or price metadata is requested.
Google's documentation explains that requested fields affect billing. The
service uses installed `httpx.post` with a finite 10-second timeout and disables
redirect following. It makes no automatic retries, including after rate limits
or temporary failures. HTTPX's timeout bounds network operations rather than
providing a strict overall wall-clock deadline.

The request contains no issue/account/car UUID, problem description, symptoms,
preliminary analysis, private history or ownership claim. The service emits no
logs and never returns the key, request headers or raw provider errors.

## Runtime walkthrough

```text
User-authorized location + RepairIssue UUID
    -> trusted user validation and current-account SELECT
    -> owned issue AND owned-car existence SELECT
    -> coordinate/radius/limit checks
    -> server-side key configuration check
    -> one Google Places POST
    -> HTTP/JSON/record validation
    -> structured mechanic results
    -> future Coordinator response
```

For a Django learner: authorization happens before constructing any external
request. No write transaction is needed because the ORM only performs SELECTs.
Once Google responds, only the explicitly allowed public business fields are
mapped into the existing [tool envelope](../tools/result.py).

## Results and validation

An illustrative response shape is shown below. Names and IDs are placeholders;
they are not a claim of a live business lookup:

```json
{
  "status": "ok",
  "data": {
    "mechanics": [{
      "place_id": "<Google Place ID>",
      "name": "<Google business display name>",
      "formatted_address": "<address, when provided>",
      "google_maps_url": "<HTTPS Google Maps URL, when valid>",
      "coordinates": {"latitude": "30.26", "longitude": "-97.74"},
      "source": "Google Places",
      "ranking_explanation": "Nearby results in Google Places DISTANCE preference order; not driving time."
    }],
    "result_count": 1,
    "limitations": ["<business-verification and vehicle-safety limitations>"]
  },
  "ids": {"issue": {"type": "repair", "id": "<authorized issue UUID>"}, "place_ids": ["<Google Place ID>"]},
  "provenance": "google_places",
  "error": null
}
```

Coordinates are decimal strings in results because the project's result contract
rejects floats and serializes Decimal as strings. Outbound API coordinates remain
JSON numbers. The input search location is not echoed into results.

A result requires a nonblank string Place ID and business display name. Invalid
records are skipped; duplicate Place IDs count once. At most the first `limit`
provider records are considered. Remaining valid records preserve Google's order;
there is no invented distance or local re-ranking.

Optional absent/malformed addresses, URLs and coordinates are omitted. Maps URLs
must use HTTPS and one of `google.com`, `www.google.com`, `maps.google.com` or
`maps.app.goo.gl`, without embedded credentials. No URL is synthesized. Returned
coordinates require a valid numeric pair within geographic bounds. Unknown
provider fields are never forwarded. Partial valid responses can return fewer
records than requested; result_count is the actual validated count.

HTTP 200 with `{}` or `{"places": []}` is a normal empty success with `status:
ok`, an empty mechanics list, count zero and empty Place IDs. Invalid JSON,
non-object envelopes, a non-list places field, an error envelope or a nonempty
list containing no usable records returns a failure instead of pretending no
businesses exist.

## Failure cases

All failures use the project's `error` envelope, null data and empty IDs.
Messages distinguish authentication, generic issue lookup, invalid input, missing
configuration, Google permission/authentication errors (401/403), rate limits
(429), temporary server errors (5xx), other HTTP failures, timeouts, network
failures and invalid responses. Database failures stop before HTTP. Provider
bodies and exception text are not returned. No error is replaced with fake
mechanics and there are no retry loops that could increase charges.

## Safety, privacy and future integration

The service does not promise Toyota certification, capability for a specific
repair, availability, affordability or application endorsement. Google's distance
preference is not driving time. It never claims that a vehicle is safe to drive
to a listed business. Serious symptoms still require the broader Repair
Agent/Coordinator safety handling; they are not sent to Google.

RepairIssues, vehicles and search results are not created or updated. User
coordinates are not stored or logged by this function. They are necessarily sent
to Google for the authorized lookup; deployment-level HTTP logging and Google
data policies remain outside this service. A future caller must present source
attribution appropriately and preserve the limitations.

The future ADK wrapper can resolve trusted identity through the existing bridge
and call this synchronous service via `sync_to_async(thread_sensitive=True)`.
This task adds no ADK tool, Coordinator changes, geocoding, frontend or other-agent
integration.

## Tests, actual verification and limitations

From `backend/`, the existing Python 3.12 environment ran:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_repair_mechanic_service agent.tests.test_repair_cost_service agent.tests.test_repair_search_service agent.tests.test_repair_issue_service agent.tests.test_repair_diagnosis_service issues.tests agent.tests.test_auth -v 1 --noinput
```

**133 passed / 0 failed**: 27 new Places tests and 106 existing Repair/issue/auth
regressions. Tests cover the exact HTTP endpoint/body/headers/timeout, trusted
ownership, location bounds and invalid types, optional fields, empty results,
provider errors, timeouts, malformed responses, Google ordering, deduplication,
privacy and no writes. Real isolated Django records exercise authorization;
only HTTP is mocked. No paid API calls were made.

Django system checks and editor diagnostics found no errors. Python syntax,
function-count and whitespace checks cover the three new files. The test suite
exercises imports. Exactly one production function was added and only the three
permitted task files were written. Existing content is preserved; final native
Git status/diff verification remains for local Terminal because this environment's
Apple Git launcher cannot find developer tools. No system tools, dependencies,
commits or pushes were added.

**Live connectivity is not verified.** Inspection found no dedicated Places key
in the backend environment file; the configuration-error path is implemented.
Mocked success proves request/response handling, not that a deployed key, billing,
permissions or real Google data work. An authorized live check with a configured
key and user-authorized coordinates remains necessary before claiming live
integration verification.


## SerpApi fallback and city search (update)

The sections above describe the Google Places path, which is still tried first
when `GOOGLE_PLACES_API_KEY` is set.

- **Fallback:** if Places fails, is not configured, or returns no businesses, and
  `SERPAPI_API_KEY` is set, `find_nearby_mechanics` queries SerpApi's
  `google_maps` engine (`q="car repair"`, `ll=@lat,lng,<zoom>z`). Zoom is derived
  from `radius_meters`; results outside the radius are dropped and the rest are
  sorted by straight-line distance (`distance_meters`). If SerpApi also fails, the
  original Places result or error is returned. Provenance is `serpapi_google_maps`.
- **City search:** `find_mechanics_in_city(repair_issue_id, city, limit=5, *, user=None)`
  uses the same authorization, then sends only `q="car repair in {city}"` to
  SerpApi. Results keep SerpApi's order and have no distance.
- **Fields:** SerpApi results add `phone`, `rating` and `review_count` when
  present. A result needs a place ID, title and valid coordinates. Maps links are
  built from the place ID. HTTP 200 with an `error` key is treated as a failure.
- **Limitations are unchanged:** listings are not endorsed or manufacturer-certified,
  and distance is not driving time. Tests mock all HTTP; live use needs a real key.
