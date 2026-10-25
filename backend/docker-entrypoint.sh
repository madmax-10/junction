#!/bin/sh
set -eu

python manage.py migrate --noinput

needs_seed="$(python - <<'PY'
import os

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from accounts.models import User

print(
    "no"
    if User.objects.filter(email__iendswith="@mock.local").exists()
    else "yes"
)
PY
)"

if [ "$needs_seed" = "yes" ]; then
  python manage.py seed_mock_data
fi

exec python manage.py runserver 0.0.0.0:8000
