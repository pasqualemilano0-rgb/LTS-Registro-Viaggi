"""Fail-closed read-only quality gate for the three published LTS vessel JSONs.

This checks the files in the checkout after publishing. It never calls a port,
Cloudflare, private APIs or booking; it never changes any files.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "porti" / "data"
MAX_AGE = timedelta(minutes=65)
MAX_BYTES = 500_000
SOURCES = {
    "conateco.json": "https://api.conateco.it/ConatecoServicesApi/BerthForecast",
    "tfg_schedule.json": "https://tfg.bucci.it/@/TFGW_TP_ETA",
    "sct.json": "https://www.salernocontainerterminal.com/ca/an/vessel_schedule.php",
}
PUBLIC_FIELDS = {
    "conateco.json": {"vessel", "voyage", "eta", "vessel_status", "category",
                      "voyage_id", "carrier", "acceptance_flag", "acceptance_icon",
                      "stop_cargo", "external_depot", "opening", "closing",
                      "notes", "source_conflict"},
    "tfg_schedule.json": {"vessel", "arrival_voyage", "departure_voyage", "eta",
                          "acceptance", "custom_close_time", "fast_corridor_cut_off",
                          "gate_cut_off", "destination"},
    "sct.json": {"vessel", "voyage", "eta", "closing", "acceptance_dry",
                 "acceptance_reef", "status"},
}
ROOT_FIELDS = {"source", "source_updated_at", "rows", "acquired_at",
               "data_changed_at", "updated_at"}


class FreshnessError(ValueError):
    """Missing, stale or unexpected public snapshot content."""


def timestamp(value):
    if not isinstance(value, str) or not value:
        raise FreshnessError("missing acquired_at")
    try:
        instant = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if instant.tzinfo is None:
            raise ValueError("no timezone")
        return instant.astimezone(timezone.utc)
    except (ValueError, OverflowError) as exc:
        raise FreshnessError("invalid acquired_at") from exc


def check(root=ROOT, now=None):
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    result = {}
    for filename, source in SOURCES.items():
        path = root / filename
        try:
            raw = path.read_bytes()
            if len(raw) > MAX_BYTES:
                raise FreshnessError("oversized")
            document = json.loads(raw.decode("utf-8"))
        except (OSError, UnicodeError, ValueError) as exc:
            raise FreshnessError(filename + ": missing or invalid JSON") from exc
        if not isinstance(document, dict) or set(document) - ROOT_FIELDS:
            raise FreshnessError(filename + ": unexpected root fields")
        if document.get("source") != source:
            raise FreshnessError(filename + ": source mismatch")
        rows = document.get("rows")
        if not isinstance(rows, list) or not 1 <= len(rows) <= 2000:
            raise FreshnessError(filename + ": invalid row count")
        for row in rows:
            if (not isinstance(row, dict)
                    or not isinstance(row.get("vessel"), str)
                    or not row["vessel"].strip()
                    or set(row) - PUBLIC_FIELDS[filename]):
                raise FreshnessError(filename + ": unexpected vessel fields")
        acquired = timestamp(document.get("acquired_at"))
        age = now - acquired
        if age < timedelta(minutes=-5) or age > MAX_AGE:
            raise FreshnessError(filename + ": STALE_OR_FUTURE_SNAPSHOT")
        if filename == "tfg_schedule.json":
            updated = timestamp(document.get("source_updated_at"))
            if updated > now + timedelta(minutes=5):
                raise FreshnessError(filename + ": invalid TFG official update")
        result[filename] = {
            "acquired_at": acquired.isoformat(),
            "age_minutes": round(age.total_seconds() / 60, 1),
            "rows": len(rows),
        }
    return result


if __name__ == "__main__":
    for filename, info in check().items():
        print(f"{filename}: {info['rows']} righe, acquisito {info['acquired_at']}, "
              f"ritardo {info['age_minutes']} min")
    print("PASS: 3/3 snapshot pubblici freschi, nessun dato personale esaminato")
