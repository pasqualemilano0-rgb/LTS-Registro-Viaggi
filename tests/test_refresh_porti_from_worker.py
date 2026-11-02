"""Offline regression tests: no calls to Cloudflare or private user records."""
import copy
import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / "scripts" / "refresh_porti_from_worker.py"
spec = importlib.util.spec_from_file_location("lts_public_vessel_mirror", MODULE)
mirror = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mirror)
NOW = datetime(2026, 11, 2, 21, 30, tzinfo=timezone.utc)


def ts(minutes=0):
    return (NOW + timedelta(minutes=minutes)).isoformat()


def fixture():
    outputs = {}
    monitor = {"backend": "cloudflare-workers", "terminals": {}}
    for terminal, detail in mirror.FEEDS.items():
        row = {"vessel": "TEST SHIP"}
        rows = [dict(row) for _ in range(6)]
        result = {"source": detail["source"], "source_updated_at": None,
                  "acquired_at": ts(), "rows": rows,
                  "mode": "cloudflare_scheduled", "stale": False, "live": False,
                  "booking_verified": False, "monitor_origin": "cloudflare_official_read"}
        if terminal == "tfg":
            result["source_updated_at"] = ts(-120)
        monitor["terminals"][terminal] = {
            "state": "ok", "rows": len(rows), "last_acquired_at": ts()}
        outputs[detail["endpoint"]] = result
    outputs["/api/monitor/status"] = monitor
    return outputs


def prior(terminal):
    item = mirror.FEEDS[terminal]
    result = {"source": item["source"], "source_updated_at": None,
              "acquired_at": ts(-20), "rows": [{"vessel": "PRIOR"}] * 6}
    if terminal == "tfg":
        result["source_updated_at"] = ts(-180)
    return result


class TestMirror(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "porti" / "data"
        self.root.mkdir(parents=True)
        for terminal, item in mirror.FEEDS.items():
            (self.root / item["file"]).write_text(json.dumps(prior(terminal)),
                                                  encoding="utf-8")
        self.responses = fixture()

    def files(self):
        return {item["file"]: (self.root / item["file"]).read_bytes()
                for item in mirror.FEEDS.values()}

    def call(self):
        return mirror.collect(root=self.root, now=NOW,
                              fetcher=lambda path: self.responses[path])

    def test_all_three_updated_only_after_validation(self):
        result = self.call()
        self.assertEqual(set(result), {"cnt", "tfg", "sct"})
        self.assertTrue(all(item["updated"] for item in result.values()))
        for terminal, detail in mirror.FEEDS.items():
            published = json.loads((self.root / detail["file"]).read_text())
            self.assertEqual(published["acquired_at"], ts())
            self.assertEqual(len(published["rows"]), 6)
            self.assertNotIn("mode", published)
            self.assertNotIn("monitor_origin", published)
            self.assertNotIn("booking_verified", published)
        self.assertTrue(all(not entry["updated"] for entry in self.call().values()))

    def assert_rejected_without_partial_writes(self, reason):
        original = self.files()
        with self.assertRaises(mirror.SnapshotRejected, msg=reason):
            self.call()
        self.assertEqual(original, self.files(), reason)

    def test_any_source_error_blocks_all_three(self):
        self.responses[mirror.FEEDS["tfg"]["endpoint"]]["stale"] = True
        self.assert_rejected_without_partial_writes("stale TFG")

    def test_fallback_is_never_republished_as_new_acquisition(self):
        self.responses[mirror.FEEDS["cnt"]["endpoint"]]["mode"] = "github_verified_fallback"
        self.assert_rejected_without_partial_writes("GitHub fallback")

    def test_error_or_missing_monitor_blocks_publication(self):
        self.responses["/api/monitor/status"]["terminals"]["sct"]["state"] = "error"
        self.assert_rejected_without_partial_writes("SCT failed")
        self.responses["/api/monitor/status"]["terminals"]["sct"]["state"] = "ok"
        self.responses["/api/monitor/status"]["terminals"]["tfg"]["last_acquired_at"] = ts(-1)
        self.assert_rejected_without_partial_writes("schedule does not match monitor")

    def test_no_downgrade_of_official_tfg_version(self):
        self.responses[mirror.FEEDS["tfg"]["endpoint"]]["source_updated_at"] = ts(-400)
        self.assert_rejected_without_partial_writes("TFG source regressed")

    def test_missing_rows_or_unexpected_shrink_is_rejected(self):
        self.responses[mirror.FEEDS["cnt"]["endpoint"]]["rows"] = [{"vessel": "ONLY"}]
        self.responses["/api/monitor/status"]["terminals"]["cnt"]["rows"] = 1
        self.assert_rejected_without_partial_writes("unexpected schedule shrink")

    def test_personal_data_and_unexpected_fields_are_never_published(self):
        self.responses[mirror.FEEDS["sct"]["endpoint"]]["rows"][0]["booking"] = "PERSONAL-123"
        self.assert_rejected_without_partial_writes("booking is not a public field")
        del self.responses[mirror.FEEDS["sct"]["endpoint"]]["rows"][0]["booking"]
        self.responses[mirror.FEEDS["sct"]["endpoint"]]["rows"][0]["customer"] = "PRIVATE"
        self.assert_rejected_without_partial_writes("customer is not a public field")

    def test_rejects_future_acquisition_and_old_acquisition(self):
        data = self.responses[mirror.FEEDS["cnt"]["endpoint"]]
        data["acquired_at"] = ts(8)
        self.responses["/api/monitor/status"]["terminals"]["cnt"]["last_acquired_at"] = ts(8)
        self.assert_rejected_without_partial_writes("future acquisition")
        data["acquired_at"] = ts(-60)
        self.responses["/api/monitor/status"]["terminals"]["cnt"]["last_acquired_at"] = ts(-60)
        self.assert_rejected_without_partial_writes("old acquisition")

    def test_existing_newer_copy_wins(self):
        first = self.root / mirror.FEEDS["cnt"]["file"]
        old = json.loads(first.read_text())
        old["acquired_at"] = ts(5)
        first.write_text(json.dumps(old))
        self.assert_rejected_without_partial_writes("no rollback")

    def test_bad_existing_snapshot_blocks_unsafe_overwrite(self):
        (self.root / mirror.FEEDS["tfg"]["file"]).write_text("{bad")
        self.assert_rejected_without_partial_writes("do not overwrite damaged recovery data")

    def test_nested_values_rejected(self):
        self.responses[mirror.FEEDS["cnt"]["endpoint"]]["rows"][0]["notes"] = {"admin": True}
        self.assert_rejected_without_partial_writes("unexpected nested object")

    def test_monitor_and_source_spoofing_fails(self):
        self.responses[mirror.FEEDS["tfg"]["endpoint"]]["source"] = "https://evil.example"
        self.assert_rejected_without_partial_writes("source mismatch")


if __name__ == "__main__":
    unittest.main()
