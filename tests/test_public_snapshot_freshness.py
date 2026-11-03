"""Offline regression tests for the publishing freshness gate (zero network)."""
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from scripts.check_public_snapshot_freshness import FreshnessError, SOURCES, check

NOW = datetime(2026, 11, 3, 15, 45, tzinfo=timezone.utc)


class TestPublicSnapshotFreshness(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        for filename, source in SOURCES.items():
            self.write(filename, {
                "source": source,
                "acquired_at": NOW.isoformat(),
                "source_updated_at": (NOW - timedelta(hours=2)).isoformat()
                    if filename == "tfg_schedule.json" else None,
                "rows": [{"vessel": "TEST SHIP"}],
            })

    def write(self, name, doc):
        (self.root / name).write_text(json.dumps(doc), encoding="utf-8")

    def read(self, name):
        return json.loads((self.root / name).read_text(encoding="utf-8"))

    def test_three_valid_snapshots_are_accepted(self):
        output = check(self.root, NOW)
        self.assertEqual(len(output), 3)
        self.assertTrue(all(v["rows"] == 1 for v in output.values()))

    def test_exact_boundary_is_allowed_but_older_is_rejected(self):
        doc = self.read("conateco.json")
        doc["acquired_at"] = (NOW - timedelta(minutes=65)).isoformat()
        self.write("conateco.json", doc)
        self.assertEqual(len(check(self.root, NOW)), 3)
        doc["acquired_at"] = (NOW - timedelta(minutes=65, seconds=1)).isoformat()
        self.write("conateco.json", doc)
        with self.assertRaisesRegex(FreshnessError, "STALE"):
            check(self.root, NOW)

    def test_missing_or_invalid_files_fail(self):
        (self.root / "sct.json").unlink()
        with self.assertRaises(FreshnessError):
            check(self.root, NOW)
        (self.root / "sct.json").write_text("{garbled", encoding="utf-8")
        with self.assertRaises(FreshnessError):
            check(self.root, NOW)

    def test_future_timestamp_is_rejected(self):
        doc = self.read("sct.json")
        doc["acquired_at"] = (NOW + timedelta(minutes=6)).isoformat()
        self.write("sct.json", doc)
        with self.assertRaisesRegex(FreshnessError, "STALE"):
            check(self.root, NOW)

    def test_untrusted_source_is_rejected(self):
        doc = self.read("tfg_schedule.json")
        doc["source"] = "https://untrusted.example"
        self.write("tfg_schedule.json", doc)
        with self.assertRaisesRegex(FreshnessError, "source mismatch"):
            check(self.root, NOW)

    def test_personal_or_unexpected_fields_are_rejected(self):
        doc = self.read("conateco.json")
        doc["rows"][0]["booking"] = "SECRET-TEST"
        self.write("conateco.json", doc)
        with self.assertRaisesRegex(FreshnessError, "unexpected vessel fields"):
            check(self.root, NOW)
        doc["rows"][0].pop("booking")
        doc["access_token"] = "SECRET-TEST"
        self.write("conateco.json", doc)
        with self.assertRaisesRegex(FreshnessError, "unexpected root fields"):
            check(self.root, NOW)

    def test_missing_tfg_official_timestamp_rejected(self):
        doc = self.read("tfg_schedule.json")
        doc["source_updated_at"] = None
        self.write("tfg_schedule.json", doc)
        with self.assertRaises(FreshnessError):
            check(self.root, NOW)

    def test_checker_has_no_write_side_effects(self):
        before = {filename: (self.root / filename).read_bytes() for filename in SOURCES}
        check(self.root, NOW)
        self.assertEqual(before, {
            filename: (self.root / filename).read_bytes() for filename in SOURCES
        })


if __name__ == "__main__":
    unittest.main()
