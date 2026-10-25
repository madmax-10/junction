import re
import shutil
from io import BytesIO
from pathlib import Path

from django.conf import settings
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers

MAX_PHOTOS = 8
MAX_BYTES = 5 * 1024 * 1024
FORMAT_EXTENSIONS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}
CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}
PHOTO_NAME = re.compile(
    r"^(?P<issue_id>[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"
    r"_(?P<index>[1-9][0-9]*)\.(?P<ext>jpg|jpeg|png|webp)$"
)


def photo_directory(issue_type, issue_id):
    return Path(settings.MEDIA_ROOT) / "issues" / issue_type / str(issue_id)


def relative_photo_path(issue_type, issue_id, filename):
    return f"issues/{issue_type}/{issue_id}/{filename}"


def content_type_for(filename):
    return CONTENT_TYPES.get(Path(filename).suffix.lower())


def _matching_name(issue_id, filename):
    match = PHOTO_NAME.match(filename)
    if match is None:
        return None
    if match.group("issue_id").lower() != str(issue_id).lower():
        return None
    return match


def list_photos(issue):
    directory = photo_directory(issue.issue_type, issue.id)
    if not directory.is_dir():
        return []
    photos = []
    for path in directory.iterdir():
        if path.is_file() and _matching_name(issue.id, path.name):
            photos.append(
                {
                    "filename": path.name,
                    "path": relative_photo_path(issue.issue_type, issue.id, path.name),
                }
            )
    photos.sort(key=lambda item: item["filename"])
    return photos


def _next_index(directory, issue_id):
    prefix = f"{issue_id}_"
    highest = 0
    if directory.exists():
        for path in directory.iterdir():
            if not path.is_file() or not path.name.startswith(prefix):
                continue
            stem = path.name[len(prefix) :].rsplit(".", 1)[0]
            if stem.isdigit():
                highest = max(highest, int(stem))
    return highest + 1


def save_photo(issue, uploaded):
    if uploaded.size and uploaded.size > MAX_BYTES:
        raise serializers.ValidationError({"file": "Photo must be 5 MB or smaller."})
    directory = photo_directory(issue.issue_type, issue.id)
    existing = [path for path in directory.iterdir() if path.is_file()] if directory.exists() else []
    if len(existing) >= MAX_PHOTOS:
        raise serializers.ValidationError({"file": f"An issue can have at most {MAX_PHOTOS} photos."})
    uploaded.seek(0)
    content = uploaded.read()
    if len(content) > MAX_BYTES:
        raise serializers.ValidationError({"file": "Photo must be 5 MB or smaller."})
    try:
        image = Image.open(BytesIO(content))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError):
        raise serializers.ValidationError({"file": "Photo must be a JPEG, PNG, or WebP image."})
    extension = FORMAT_EXTENSIONS.get(image.format)
    if extension is None:
        raise serializers.ValidationError({"file": "Photo must be a JPEG, PNG, or WebP image."})
    directory.mkdir(parents=True, exist_ok=True)
    filename = f"{issue.id}_{_next_index(directory, issue.id)}.{extension}"
    (directory / filename).write_bytes(content)
    return {
        "filename": filename,
        "path": relative_photo_path(issue.issue_type, issue.id, filename),
    }


def photo_file(issue_type, issue_id, filename):
    if _matching_name(issue_id, filename) is None:
        return None
    path = (photo_directory(issue_type, issue_id) / filename).resolve()
    root = photo_directory(issue_type, issue_id).resolve()
    if root not in path.parents or not path.is_file():
        return None
    return path


def delete_photo_file(issue, filename):
    path = photo_file(issue.issue_type, issue.id, filename)
    if path is None:
        return None
    relative = relative_photo_path(issue.issue_type, issue.id, path.name)
    path.unlink()
    _remove_photo_references(issue, relative)
    return relative


def remove_photo_directory(issue_type, issue_id):
    directory = photo_directory(issue_type, issue_id)
    if directory.exists():
        shutil.rmtree(directory)


def normalize_photo_paths(issue_type, issue_id, photos):
    if not isinstance(photos, list):
        raise serializers.ValidationError({"photos": "Must be a list of photo paths."})
    if len(photos) > MAX_PHOTOS:
        raise serializers.ValidationError({"photos": f"A post can reference at most {MAX_PHOTOS} photos."})
    cleaned = []
    prefix = f"issues/{issue_type}/{issue_id}/"
    for item in photos:
        if not isinstance(item, str) or not item.startswith(prefix):
            raise serializers.ValidationError({"photos": "Photo paths must belong to this issue."})
        filename = item[len(prefix) :]
        path = photo_file(issue_type, issue_id, filename)
        if path is None:
            raise serializers.ValidationError({"photos": "Photo paths must belong to this issue."})
        canonical = relative_photo_path(issue_type, issue_id, path.name)
        if canonical not in cleaned:
            cleaned.append(canonical)
    return cleaned


def _remove_photo_references(issue, relative_path):
    from posts.models import Post

    posts = Post.objects.filter(issue_type=issue.issue_type, issue_id=issue.id)
    for post in posts:
        post_data = dict(post.post_data or {})
        photos = list(post_data.get("photos") or [])
        kept = [path for path in photos if path != relative_path]
        if kept != photos:
            if kept:
                post_data["photos"] = kept
            else:
                post_data.pop("photos", None)
            post.post_data = post_data
            post.save(update_fields=["post_data", "updated_at"])
