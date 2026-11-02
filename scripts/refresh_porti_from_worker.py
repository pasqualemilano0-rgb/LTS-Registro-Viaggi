"""Mirror only vetted PUBLIC vessel schedules from the existing Cloudflare Worker.

LTS owns this GitHub Pages mirror; Cloudflare's official-reading cron remains
authoritative. All three feeds are validated before ANY file is replaced.
No bookings, credentials, account data, private backend or user records are used.
"""
from __future__ import annotations

import json
import os
import ssl
import tempfile
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "porti" / "data"
BASE = "https://container-booking-backend.pasqualemilano0.workers.dev"
FEEDS = {
    "cnt": {
        "file": "conateco.json", "endpoint": "/api/cnt",
        "source": "https://api.conateco.it/ConatecoServicesApi/BerthForecast",
        "fields": {"vessel", "voyage", "eta", "vessel_status", "category",
                   "voyage_id", "carrier", "acceptance_flag", "acceptance_icon",
                   "stop_cargo", "external_depot", "opening", "closing",
                   "notes", "source_conflict"},
    },
    "tfg": {
        "file": "tfg_schedule.json", "endpoint": "/api/tfg/snapshot",
        "source": "https://tfg.bucci.it/@/TFGW_TP_ETA",
        "fields": {"vessel", "arrival_voyage", "departure_voyage", "eta",
                   "acceptance", "custom_close_time", "fast_corridor_cut_off",
                   "gate_cut_off", "destination"},
    },
    "sct": {
        "file": "sct.json", "endpoint": "/api/sct",
        "source": "https://www.salernocontainerterminal.com/ca/an/vessel_schedule.php",
        "fields": {"vessel", "voyage", "eta", "closing",
                   "acceptance_dry", "acceptance_reef", "status"},
    },
}
ROOT_FIELDS = {"source", "acquired_at", "source_updated_at", "rows",
               "updated_at", "data_changed_at"}
MAX_BYTES = 500_000
MAX_AGE = timedelta(minutes=45)


class SnapshotRejected(ValueError):
    """Do not publish when one official source is unverified or unavailable."""


def iso(value):
    if not isinstance(value, str) or not value:
        raise SnapshotRejected("Missing ISO timestamp")
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            raise ValueError("timezone missing")
        return dt.astimezone(timezone.utc)
    except (ValueError, OverflowError) as exc:
        raise SnapshotRejected("Invalid ISO timestamp") from exc


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_json(route):
    if route not in {"/api/monitor/status", *(x["endpoint"] for x in FEEDS.values())}:
        raise SnapshotRejected("Unexpected Worker route")
    url = BASE + route
    opener = urllib.request.build_opener(
        urllib.request.HTTPSHandler(context=ssl.create_default_context()),
        _NoRedirect(),
    )
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "LTS-Public-Schedule-Mirror/1.0",
    }, method="GET")
    try:
        with opener.open(req, timeout=20) as response:
            if response.status != 200 or response.geturl() != url:
                raise SnapshotRejected("Worker HTTP failure")
            if "application/json" not in response.headers.get("Content-Type", ""):
                raise SnapshotRejected("Worker did not return JSON")
            raw = response.read(MAX_BYTES + 1)
    except (OSError, TimeoutError) as exc:
        raise SnapshotRejected("Worker unavailable") from exc
    if len(raw) > MAX_BYTES:
        raise SnapshotRejected("Worker response exceeded size cap")
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeError, ValueError) as exc:
        raise SnapshotRejected("Worker returned malformed JSON") from exc


def validate(terminal, status, payload, previous, now):
    spec = FEEDS[terminal]
    if not isinstance(payload, dict) or set(payload) - (
        ROOT_FIELDS | {"mode", "stale", "live", "booking_verified", "monitor_origin"}
    ):
        raise SnapshotRejected("Unexpected snapshot fields")
    if payload.get("source") != spec["source"] or payload.get("mode") != "cloudflare_scheduled":
        raise SnapshotRejected("Official source or acquisition mode not verified")
    if payload.get("stale") is not False or payload.get("live") is not False \
            or payload.get("booking_verified") is not False:
        raise SnapshotRejected("Unverified operational status")
    if not isinstance(status, dict) or status.get("state") != "ok":
        raise SnapshotRejected("Terminal health is not OK")
    acquired = iso(payload.get("acquired_at"))
    if acquired > now + timedelta(minutes=5) or now - acquired > MAX_AGE:
        raise SnapshotRejected("Snapshot is not freshly acquired")
    if iso(status.get("last_acquired_at")) != acquired:
        raise SnapshotRejected("Monitor and snapshot disagree")
    rows = payload.get("rows")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 2000 \
            or len(rows) != status.get("rows"):
        raise SnapshotRejected("Vessel row count is invalid")
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("vessel"), str) \
                or not row["vessel"].strip() or set(row) - spec["fields"]:
            raise SnapshotRejected("Unexpected vessel fields")
        if any(type(value) not in (str, bool, int, float, type(None))
               or (isinstance(value, str) and len(value) > 500)
               for value in row.values()):
            raise SnapshotRejected("Nested or oversized vessel values")
    source_updated = payload.get("source_updated_at")
    if terminal == "tfg" and not source_updated:
        raise SnapshotRejected("TFG official update time missing")
    if source_updated is not None and iso(source_updated) > now + timedelta(minutes=5):
        raise SnapshotRejected("Future official update")
    old_rows = previous.get("rows", []) if isinstance(previous, dict) else []
    if isinstance(old_rows, list) and len(old_rows) >= 4 \
            and len(rows) < max(2, len(old_rows) // 2):
        raise SnapshotRejected("Unexpected loss of vessel rows")
    if previous:
        old_time = iso(previous.get("acquired_at"))
        if acquired < old_time:
            raise SnapshotRejected("Would replace a newer snapshot")
        if terminal == "tfg" and previous.get("source_updated_at") \
                and iso(source_updated) < iso(previous["source_updated_at"]):
            raise SnapshotRejected("TFG official version regressed")
    output = {key: payload[key] for key in ("source", "source_updated_at", "rows", "acquired_at")
              if key in payload}
    if terminal == "sct":
        for field in ("data_changed_at", "updated_at"):
            if payload.get(field) is not None:
                iso(payload[field])
                output[field] = payload[field]
    raw = (json.dumps(output, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if len(raw) > MAX_BYTES:
        raise SnapshotRejected("Clean snapshot exceeds size cap")
    return raw, acquired


def collect(*, root=DEST, fetcher=fetch_json, now=None, terminals=None):
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    monitor = fetcher("/api/monitor/status")
    if not isinstance(monitor, dict) or monitor.get("backend") != "cloudflare-workers" \
            or not isinstance(monitor.get("terminals"), dict):
        raise SnapshotRejected("Monitor unavailable")
    candidates = {}
    status = {}
    selected = tuple(terminals) if terminals is not None else tuple(FEEDS)
    if not selected or any(term not in FEEDS for term in selected):
        raise SnapshotRejected('Unexpected terminal selection')
    for terminal in selected:
        spec = FEEDS[terminal]
        path = root / spec["file"]
        try:
            old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        except (OSError, UnicodeError, ValueError) as exc:
            raise SnapshotRejected("Existing snapshot cannot be checked") from exc
        if old and (not isinstance(old, dict) or old.get("source") != spec["source"]):
            raise SnapshotRejected("Existing snapshot source differs")
        payload = fetcher(spec["endpoint"])
        raw, acquired = validate(terminal, monitor["terminals"].get(terminal), payload, old, now)
        old_acquired = iso(old["acquired_at"]) if old else None
        if old_acquired is None or acquired > old_acquired:
            candidates[path] = raw
        status[terminal] = {"rows": len(payload["rows"]), "acquired_at": acquired.isoformat(),
                            "updated": path in candidates}
    # Do not touch any output until all three sources have passed validation.
    if candidates:
        root.mkdir(parents=True, exist_ok=True)
        staged = []
        try:
            for path, raw in candidates.items():
                fd, tmpname = tempfile.mkstemp(prefix=".lts-vessel-", dir=root)
                os.close(fd)
                tmp = Path(tmpname)
                staged.append((path, tmp))
                tmp.write_bytes(raw)
            for path, tmp in staged:
                tmp.replace(path)
        finally:
            for _, tmp in staged:
                tmp.unlink(missing_ok=True)
    return status


if __name__ == "__main__":
    # A failure at one terminal must never freeze independently healthy feeds.
    # Every terminal retains its own last verified copy; no cross-terminal reuse.
    outcomes = {}
    failed = {}
    for terminal in FEEDS:
        try:
            outcomes.update(collect(terminals=(terminal,)))
        except SnapshotRejected as error:
            failed[terminal] = str(error)
            print(f"::warning title=LTS Porti {terminal.upper()}::"
                  f"Programma non verificato: {error}. Conservata l'ultima copia valida.")
    for name, info in outcomes.items():
        print(f"{name.upper()}: {info['rows']} righe, acquired_at={info['acquired_at']}, "
              f"nuova_copia={'sì' if info['updated'] else 'no'}")
    if failed:
        print("AVVISO: terminali non aggiornati: " + ", ".join(sorted(failed)))
    if not outcomes:
        raise SystemExit("FAIL CLOSED: nessuna nuova fonte verificata; nessuna pubblicazione")
