import json
from pathlib import Path

from app.core import ProcessingError


def check_cancelled(path: str | None) -> None:
    if path is not None and Path(path).with_suffix(".cancel").exists():
        raise ProcessingError("Pemrosesan PDF dibatalkan.", 499)


def write_progress(
    path: str | None, completed: int, total: int, *, finished: bool = False
) -> None:
    if path is None:
        return
    percentage = 100 if finished else min(99, completed * 100 // max(1, total))
    destination = Path(path)
    staging = destination.with_suffix(".tmp")
    try:
        staging.write_text(json.dumps({"percentage": percentage}), encoding="utf-8")
        staging.replace(destination)
    except OSError:
        # Progress reporting must not fail an otherwise valid PDF operation.
        pass


def read_progress(path: Path) -> dict[str, int]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        percentage = data["percentage"]
        if type(percentage) is int and 0 <= percentage <= 100:
            return {"percentage": percentage}
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return {"percentage": 0}
