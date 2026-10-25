import random
from collections import defaultdict
from decimal import Decimal

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from issues.models import BuyIssue, RepairIssue, SellIssue
from posts.models import Post
from vehicles.models import NewCar, UsedCar

MOCK_DOMAIN = "mock.local"
DEFAULT_PASSWORD = "MockData-2026"
BATCH = 500

FIRST_NAMES = (
    "Ava", "Liam", "Mia", "Noah", "Sofia", "Ethan", "Isla", "Lucas",
    "Amelia", "Mateo", "Chloe", "Owen", "Priya", "Jayden", "Elena", "Andre",
    "Hannah", "Kai", "Nora", "Diego", "Leah", "Arjun", "Ruby", "Malik",
    "Grace", "Jonah", "Aisha", "Felix", "Camila", "Theo",
)
LAST_NAMES = (
    "Nguyen", "Patel", "Garcia", "Kim", "Brooks", "Singh", "Carter", "Reyes",
    "Murphy", "Ahmed", "Bennett", "Diaz", "Foster", "Shah", "Wright", "Ali",
    "Coleman", "Vargas", "Hughes", "Park", "Mitchell", "Torres", "Price", "Chen",
)
CATALOG = (
    ("Toyota", ("Camry", "Corolla", "RAV4", "Highlander", "Tacoma", "Prius")),
    ("Honda", ("Civic", "Accord", "CR-V", "Pilot", "HR-V", "Odyssey")),
    ("Ford", ("F-150", "Mustang", "Escape", "Explorer", "Maverick", "Bronco")),
    ("Chevrolet", ("Silverado", "Equinox", "Malibu", "Tahoe", "Trax", "Bolt")),
    ("Tesla", ("Model 3", "Model Y", "Model S", "Model X")),
    ("Hyundai", ("Elantra", "Tucson", "Santa Fe", "Ioniq 5", "Sonata")),
    ("Nissan", ("Altima", "Rogue", "Sentra", "Pathfinder", "Frontier")),
    ("Subaru", ("Outback", "Forester", "Crosstrek", "Impreza", "Ascent")),
    ("BMW", ("3 Series", "X3", "X5", "5 Series", "i4")),
    ("Mazda", ("CX-5", "Mazda3", "CX-50", "MX-5", "CX-90")),
)
TRIMS = ("", "Base", "LE", "SE", "XLE", "Sport", "EX", "Limited", "Touring", "Premium")
FUELS = ("gasoline", "hybrid", "electric", "diesel")
CITIES = (
    "Austin, TX",
    "Round Rock, TX",
    "Dallas, TX",
    "Fort Worth, TX",
    "Houston, TX",
    "San Antonio, TX",
    "College Station, TX",
    "El Paso, TX",
)
CONDITIONS = (
    "Clean title, garaged, no accidents.",
    "Daily driver with normal wear on the driver seat.",
    "One-owner car, dealer serviced.",
    "Highway miles, recent tires and brakes.",
    "Minor parking-lot scuffs, mechanically solid.",
)
DAMAGE = (
    "",
    "Small dent on the rear bumper.",
    "Windshield chip on the passenger side.",
    "Clear coat peeling on the hood.",
    "Curb rash on the front right wheel.",
)
SYMPTOMS = (
    "Grinding noise when braking",
    "Check-engine light stays on",
    "Car pulls to the right",
    "AC blows warm air",
    "Rough idle at stoplights",
    "Transmission slips between 2nd and 3rd",
    "Battery dies after sitting overnight",
    "Steering wheel vibrates above 60 mph",
)
CAUSES = (
    ("Worn brake pads", "Needs a visual inspection to confirm pad thickness."),
    ("Failing alternator", "Voltage drop only shows up after a long drive."),
    ("Wheel alignment is off", "Could also be a worn control arm."),
    ("Low refrigerant", "A leak test would rule out the compressor."),
    ("Dirty throttle body", "A vacuum leak would feel the same."),
)
MECHANICS = (
    ("Lone Star Auto", "Austin, TX"),
    ("Hill Country Motors", "Round Rock, TX"),
    ("Oak Cliff Garage", "Dallas, TX"),
    ("Bayou Auto Care", "Houston, TX"),
)
PARTS = ("brake pads", "rotors", "spark plugs", "cabin filter", "serpentine belt", "battery")
BUY_BLURBS = (
    "Looking for a reliable commuter that can handle a daily highway drive.",
    "Need a family hauler with room for two car seats and a dog.",
    "Want something efficient for city driving and weekend trips.",
    "Shopping for a first car that is cheap to insure and easy to park.",
    "Ready to replace an aging sedan before it needs another big repair.",
)


def _money(rng, low, high):
    return Decimal(rng.randrange(low, high))


def _vehicle(rng):
    make, models = rng.choice(CATALOG)
    year = rng.randint(2008, 2026)
    return make, rng.choice(models), year, rng.choice(TRIMS)


def _contact(user, rng):
    contact = {"email": user.email}
    if rng.random() < 0.7:
        contact["phone"] = f"512-555-{rng.randint(1000, 9999):04d}"
    if rng.random() < 0.25:
        contact["link"] = "https://example.com/seller"
    return contact


def _preferences(rng):
    make, models = rng.choice(CATALOG)
    other_make, _ = rng.choice(CATALOG)
    prefs = {
        "preferred_makes": [make] if rng.random() < 0.5 else [make, other_make],
        "preferred_models": [rng.choice(models)],
        "minimum_year": rng.choice((2012, 2015, 2018, 2020)),
        "maximum_mileage": rng.choice((40000, 60000, 80000, 120000)),
        "vehicle_type": rng.choice(("new", "used")),
        "fuel_type": rng.choice(FUELS),
        "location": rng.choice(CITIES),
    }
    if rng.random() < 0.15:
        return None
    return prefs


def _condition_details(rng):
    return {
        "mechanical": rng.choice(
            ("Starts and drives with no warning lights.", "Recent oil change and new brakes.")
        ),
        "exterior": rng.choice(("Light scratches.", "Paint is original and glossy.")),
        "interior": rng.choice(("Cloth seats, no tears.", "Leather with normal creasing.")),
        "maintenance_history": rng.choice(
            ("Records available from the dealer.", "Oil changes done on schedule.")
        ),
    }


class Command(BaseCommand):
    help = "Seed a large set of mock users, cars, issues, and posts."

    def add_arguments(self, parser):
        parser.add_argument(
            "--users",
            type=int,
            default=200,
            help="How many mock users to create, including the admin and demo accounts (default: 200).",
        )
        parser.add_argument(
            "--seed",
            type=int,
            default=25,
            help="Random seed so the same data can be regenerated (default: 25).",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help=f"Delete existing *@{MOCK_DOMAIN} users and the cars, issues, and posts tied to them before seeding.",
        )

    def handle(self, *args, **options):
        count = options["users"]
        if count < 2:
            raise CommandError("--users must be at least 2 (admin and demo).")

        if options["clear"]:
            removed = _clear_mock_data()
            self.stdout.write(f"Cleared {removed} mock users.")
        elif User.objects.filter(email__iendswith=f"@{MOCK_DOMAIN}").exists():
            raise CommandError(
                f"Mock users (*@{MOCK_DOMAIN}) already exist. Re-run with --clear to replace them."
            )

        rng = random.Random(options["seed"])
        password = make_password(DEFAULT_PASSWORD)
        with transaction.atomic():
            users = _users(count, password)
            new_cars, used_cars = _cars(users, rng)
            buy_issues, sell_issues, repair_issues = _issues(users, used_cars, rng)
            posts = _posts(buy_issues, sell_issues, repair_issues, rng)

        self.stdout.write(self.style.SUCCESS("Mock data seeded."))
        self.stdout.write(f"  users:         {len(users)}")
        self.stdout.write(f"  new cars:      {len(new_cars)}")
        self.stdout.write(f"  used cars:     {len(used_cars)}")
        self.stdout.write(f"  buy issues:    {len(buy_issues)}")
        self.stdout.write(f"  sell issues:   {len(sell_issues)}")
        self.stdout.write(f"  repair issues: {len(repair_issues)}")
        self.stdout.write(f"  posts:         {len(posts)}")
        self.stdout.write(f"Login (password for every mock account): {DEFAULT_PASSWORD}")
        self.stdout.write(f"  admin@{MOCK_DOMAIN}  staff superuser")
        self.stdout.write(f"  demo@{MOCK_DOMAIN}   sample driver")


def _clear_mock_data():
    users = User.objects.filter(email__iendswith=f"@{MOCK_DOMAIN}")
    user_count = users.count()
    issue_ids = []
    for model in (BuyIssue, SellIssue, RepairIssue):
        issue_ids.extend(model.objects.filter(user__in=users).values_list("id", flat=True))
    for start in range(0, len(issue_ids), BATCH):
        Post.objects.filter(issue_id__in=issue_ids[start : start + BATCH]).delete()
    SellIssue.objects.filter(user__in=users).delete()
    RepairIssue.objects.filter(user__in=users).delete()
    users.delete()
    return user_count


def _users(count, password):
    now = timezone.now()
    users = [
        User(
            name="Mock Admin",
            email=f"admin@{MOCK_DOMAIN}",
            password=password,
            is_staff=True,
            is_superuser=True,
            is_active=True,
            date_joined=now,
        ),
        User(
            name="Demo Driver",
            email=f"demo@{MOCK_DOMAIN}",
            password=password,
            is_active=True,
            date_joined=now,
        ),
    ]
    for index in range(count - 2):
        name = f"{FIRST_NAMES[index % len(FIRST_NAMES)]} {LAST_NAMES[index % len(LAST_NAMES)]}"
        users.append(
            User(
                name=name,
                email=f"driver{index + 1:04d}@{MOCK_DOMAIN}",
                password=password,
                is_active=True,
                date_joined=now,
            )
        )
    return User.objects.bulk_create(users, batch_size=BATCH)


def _cars(users, rng):
    new_cars = []
    used_cars = []
    for user in users:
        for _ in range(rng.randint(2, 5)):
            make, model, year, trim = _vehicle(rng)
            new_cars.append(
                NewCar(
                    owner_id=user.id,
                    make=make,
                    model=model,
                    year=year,
                    trim=trim,
                    msrp=None if rng.random() < 0.1 else _money(rng, 22000, 78000),
                )
            )
        for _ in range(rng.randint(3, 6)):
            make, model, year, trim = _vehicle(rng)
            age = max(2026 - year, 1)
            used_cars.append(
                UsedCar(
                    owner_id=user.id,
                    make=make,
                    model=model,
                    year=year,
                    trim=trim,
                    mileage=rng.randint(800, 18000) * age,
                    condition=rng.choice(CONDITIONS),
                )
            )
    return (
        NewCar.objects.bulk_create(new_cars, batch_size=BATCH),
        UsedCar.objects.bulk_create(used_cars, batch_size=BATCH),
    )


def _issues(users, used_cars, rng):
    cars_by_owner = defaultdict(list)
    for car in used_cars:
        cars_by_owner[car.owner_id].append(car)

    buy_issues = []
    sell_issues = []
    repair_issues = []
    for user in users:
        for _ in range(rng.randint(2, 5)):
            low = rng.randrange(4000, 28000, 500)
            high = low + rng.randrange(3000, 25000, 500)
            buy_issues.append(
                BuyIssue(
                    user=user,
                    description=rng.choice(BUY_BLURBS),
                    min_budget=_money(rng, low, low + 1),
                    max_budget=_money(rng, high, high + 1),
                    preferences=_preferences(rng),
                    status=rng.choices(
                        [BuyIssue.Status.OPEN, BuyIssue.Status.CLOSED],
                        weights=(4, 1),
                    )[0],
                )
            )
        owned = cars_by_owner[user.id]
        for _ in range(rng.randint(2, 4)):
            car = rng.choice(owned)
            sell_issues.append(_sell_issue(user, car, rng))
        for _ in range(rng.randint(2, 4)):
            car = rng.choice(owned)
            repair_issues.append(_repair_issue(user, car, rng))

    return (
        BuyIssue.objects.bulk_create(buy_issues, batch_size=BATCH),
        SellIssue.objects.bulk_create(sell_issues, batch_size=BATCH),
        RepairIssue.objects.bulk_create(repair_issues, batch_size=BATCH),
    )


def _sell_issue(user, car, rng):
    return SellIssue(
        user=user,
        used_car=car,
        description=f"Selling my {car.year} {car.make} {car.model}. {car.condition}",
        asking_price=_money(rng, 4500, 42000),
        condition_details=_condition_details(rng),
        known_damage=rng.choice(DAMAGE),
        location=rng.choice(CITIES),
        contact_info=_contact(user, rng),
        status=rng.choices(
            [SellIssue.Status.OPEN, SellIssue.Status.CLOSED],
            weights=(4, 1),
        )[0],
    )


def _repair_issue(user, car, rng):
    confirmed = rng.sample(SYMPTOMS, k=rng.randint(1, 3))
    inferred = rng.sample(SYMPTOMS, k=rng.randint(0, 2))
    status = rng.choices(
        [
            RepairIssue.Status.OPEN,
            RepairIssue.Status.RESOLVED,
            RepairIssue.Status.UNRESOLVED,
            RepairIssue.Status.UNSURE,
        ],
        weights=(5, 3, 1, 1),
    )[0]
    details = None
    resolved_at = None
    if status != RepairIssue.Status.OPEN:
        details = _resolution(rng)
        if status == RepairIssue.Status.RESOLVED:
            resolved_at = timezone.now()
    analysis = None
    if rng.random() < 0.65:
        cause, uncertainty = rng.choice(CAUSES)
        analysis = {
            "possibilities": [{"cause": cause, "uncertainty": uncertainty}],
            "notes": f"Reported on a {car.year} {car.make} {car.model}.",
        }
    return RepairIssue(
        user=user,
        used_car=car,
        description=f"{confirmed[0]} on my {car.year} {car.make} {car.model}.",
        symptoms={"confirmed": confirmed, "inferred": inferred} if inferred else {"confirmed": confirmed},
        ai_analysis=analysis,
        status=status,
        resolution_details=details,
        resolved_at=resolved_at,
    )


def _resolution(rng):
    cost = int(_money(rng, 40, 1800))
    if rng.random() < 0.55:
        name, location = rng.choice(MECHANICS)
        return {
            "method": "mechanic",
            "mechanic_name": name,
            "location": location,
            "work_performed": rng.choice(
                ("Replaced the worn parts and test drove the car.", "Diagnosed and cleared the fault code.")
            ),
            "cost": cost,
            "insurance_settlement": "The insurer paid the repair bill.",
        }
    return {
        "method": "self",
        "instructions": "Followed the service manual and confirmed the symptom was gone on a short drive.",
        "insurance_settlement": "Paid the parts through my own policy.",
        "parts_used": rng.sample(PARTS, k=rng.randint(1, 2)),
        "cost": cost,
    }


def _posts(buy_issues, sell_issues, repair_issues, rng):
    posts = []
    for issue in buy_issues:
        prefs = issue.preferences or {}
        makes = ", ".join(prefs.get("preferred_makes") or ["a used car"])
        posts.append(
            _post(
                issue.id,
                Post.IssueType.BUY,
                f"Looking to buy {makes}",
                issue.description,
                _buy_post_data(issue, prefs),
                rng,
            )
        )
    for issue in sell_issues:
        car = issue.used_car
        posts.append(
            _post(
                issue.id,
                Post.IssueType.SELL,
                f"{car.year} {car.make} {car.model} for sale",
                issue.description,
                _sell_post_data(issue, car),
                rng,
            )
        )
    for issue in repair_issues:
        car = issue.used_car
        posts.append(
            _post(
                issue.id,
                Post.IssueType.REPAIR,
                f"Repair help: {car.year} {car.make} {car.model}",
                issue.description,
                _repair_post_data(issue, car),
                rng,
            )
        )
    return Post.objects.bulk_create(posts, batch_size=BATCH)


def _post(issue_id, issue_type, title, content, post_data, rng):
    status = rng.choices(
        [Post.Status.DRAFT, Post.Status.APPROVED, Post.Status.PUBLISHED, Post.Status.ARCHIVED],
        weights=(2, 1, 5, 1),
    )[0]
    approved_at = timezone.now() if status in {Post.Status.APPROVED, Post.Status.PUBLISHED} else None
    return Post(
        issue_id=issue_id,
        issue_type=issue_type,
        title=title[:255],
        content=content,
        post_data=post_data,
        status=status,
        approved_at=approved_at,
    )


def _buy_post_data(issue, prefs):
    data = {
        "min_budget": int(issue.min_budget),
        "max_budget": int(issue.max_budget),
        "contact": {"email": issue.user.email},
    }
    for key in (
        "preferred_makes",
        "preferred_models",
        "minimum_year",
        "maximum_mileage",
        "vehicle_type",
        "fuel_type",
        "location",
    ):
        if prefs.get(key) not in (None, [], ""):
            data[key] = prefs[key]
    return data


def _sell_post_data(issue, car):
    data = {
        "make": car.make,
        "model": car.model,
        "year": car.year,
        "mileage": car.mileage,
        "asking_price": int(issue.asking_price),
        "condition_details": issue.condition_details,
        "location": issue.location,
        "contact": issue.contact_info,
    }
    if car.trim:
        data["trim"] = car.trim
    if issue.known_damage:
        data["known_damage"] = issue.known_damage
    return data


def _repair_post_data(issue, car):
    data = {
        "make": car.make,
        "model": car.model,
        "year": car.year,
        "mileage": car.mileage,
        "symptoms": issue.symptoms,
        "owner_reported": True,
    }
    if car.trim:
        data["trim"] = car.trim
    details = issue.resolution_details or {}
    if details.get("method"):
        data["method"] = details["method"]
    if details.get("work_performed"):
        data["work_performed"] = details["work_performed"]
    if details.get("mechanic_name"):
        data["mechanic_name"] = details["mechanic_name"]
    if details.get("cost") is not None:
        data["cost"] = details["cost"]
    if details.get("insurance_settlement"):
        data["insurance_settlement"] = details["insurance_settlement"]
    return data
