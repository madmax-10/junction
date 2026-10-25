"""The chat endpoint: POST /api/chat/turns/ runs one turn of the assistant."""

import logging

from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from agent.events import EventsError
from agent.runner import run_turn
from issues.photos import save_chat_photo
from agent.responses import database_operations, database_records

logger = logging.getLogger(__name__)


class ChatTurnView(APIView):
    """Takes the whole conversation so far, returns only the new events.

    Login is required (JWT, from the project-wide DRF settings). Who the user
    is comes from the token, never from the request body.
    """

    def post(self, request):
        # The body must be an object like {"events": [...]}.
        body = request.data if isinstance(request.data, dict) else {}
        events = body.get("events")
        if not isinstance(events, list):
            raise serializers.ValidationError({"events": "This field is required and must be a list."})

        try:
            new_events = run_turn(request.user.id, events, request=request)
            records = database_records(request.user, new_events)
            operations = database_operations(new_events)
        except EventsError as exc:
            # The history broke the rules; say exactly which rule so the client can fix it.
            raise serializers.ValidationError({"events": str(exc)})
        except Exception:
            # The model or another outside service failed. Log the details for us,
            # but show the user only a short, safe message.
            logger.exception("Chat turn failed for user %s", request.user.id)
            return Response(
                {"detail": "The assistant is unavailable right now. Please try again."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"events": new_events, "records": records, "database_operations": operations})


class ChatPhotoView(APIView):
    """Stage one chat photo for the signed-in user; returns the image_id the assistant reads."""

    def post(self, request):
        uploaded = request.FILES.get("file")
        if uploaded is None:
            raise serializers.ValidationError({"file": "A photo file is required."})
        return Response(save_chat_photo(request.user, uploaded), status=status.HTTP_201_CREATED)
