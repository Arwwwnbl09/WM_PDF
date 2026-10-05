from tempfile import SpooledTemporaryFile

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class BodyLimitMiddleware:
    """Bound multipart intake before Starlette creates upload spools, including chunked bodies."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app, self.max_bytes = app, max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] != "POST":
            await self.app(scope, receive, send)
            return
        length = dict(scope.get("headers", [])).get(b"content-length")
        if length:
            try:
                parsed_length = int(length)
                if parsed_length < 0:
                    raise ValueError
                oversized = parsed_length > self.max_bytes
            except ValueError:
                await JSONResponse(
                    {"detail": "Permintaan tidak valid. Silakan pilih PDF kembali."},
                    status_code=400,
                )(scope, receive, send)
                return
            if oversized:
                await JSONResponse(
                    {"detail": "Ukuran unggahan PDF melebihi batas."},
                    status_code=413,
                )(scope, receive, send)
                return
        with SpooledTemporaryFile(max_size=1024 * 1024) as body:
            total = 0
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                chunk = message.get("body", b"")
                total += len(chunk)
                if total > self.max_bytes:
                    await JSONResponse(
                        {"detail": "Ukuran unggahan PDF melebihi batas."},
                        status_code=413,
                    )(scope, receive, send)
                    return
                body.write(chunk)
                if not message.get("more_body", False):
                    break
            body.seek(0)
            replayed = False

            async def bounded_receive() -> Message:
                nonlocal replayed
                if replayed:
                    return await receive()
                chunk = body.read(1024 * 1024)
                more = body.tell() < total
                if not more:
                    replayed = True
                return {"type": "http.request", "body": chunk, "more_body": more}

            await self.app(scope, bounded_receive, send)
