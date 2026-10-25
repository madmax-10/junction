"""Helpers that make the plain Django tool functions safe to use inside ADK."""

import functools

from asgiref.sync import sync_to_async


def as_async_tool(func):
    """Wrap a normal (blocking) tool so ADK can run it without blocking its event loop.

    ADK runs tools inside an async event loop, and Django refuses database
    access there. This wrapper moves the call onto a worker thread instead.
    The function's name, arguments and docstring are kept, because ADK reads
    them to tell the model how to call the tool.
    """

    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        return await sync_to_async(func)(*args, **kwargs)

    return wrapper
