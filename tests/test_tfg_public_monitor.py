"""Offline monitor contract; no request reaches the production endpoint."""
import contextlib
import importlib.util
import io
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError
from urllib.request import Request

spec = importlib.util.spec_from_file_location(
    'monitor', Path(__file__).resolve().parents[1] / 'scripts/qa_tfg_public_backend.py'
)
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)


class MonitorTests(unittest.TestCase):
    def setUp(self):
        now = datetime.now(timezone.utc).isoformat()
        self.data = dict(source=monitor.SOURCE, live=True, booking_verified=False,
                         acquired_at=now, source_updated_at=now,
                         rows=[dict(vessel='QA', fast_corridor_cut_off='',
                                    custom_close_time='', gate_cut_off='')])
        self.headers = {'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': monitor.ORIGIN,
                        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
                        'Access-Control-Allow-Methods': 'GET, OPTIONS'}

    def run_monitor(self, first_status=200, preflight_status=204, hostile_headers=None):
        with patch.object(monitor, 'request', side_effect=[
            (first_status, self.headers, json.dumps(self.data).encode()),
            (preflight_status, self.headers, b''),
            (200, hostile_headers or {}, b'')
        ]) as req, contextlib.redirect_stdout(io.StringIO()):
            monitor.main()
            self.assertEqual(req.call_count, 3)

    def test_valid(self):
        self.run_monitor()

    def test_bad_http(self):
        with self.assertRaises(AssertionError):
            self.run_monitor(first_status=503)

    def test_bad_cors(self):
        self.headers['Access-Control-Allow-Origin'] = '*'
        with self.assertRaises(AssertionError):
            self.run_monitor()

    def test_stale(self):
        self.data['acquired_at'] = (datetime.now(timezone.utc)-timedelta(hours=1)).isoformat()
        with self.assertRaises(AssertionError):
            self.run_monitor()

    def test_booking_not_certified(self):
        self.data['booking_verified'] = True
        with self.assertRaises(AssertionError):
            self.run_monitor()

    def test_no_rows(self):
        self.data['rows'] = []
        with self.assertRaises(AssertionError):
            self.run_monitor()

    def test_preflight(self):
        with self.assertRaises(AssertionError):
            self.run_monitor(preflight_status=200)

    def test_hostile_origin(self):
        with self.assertRaises(AssertionError):
            self.run_monitor(hostile_headers={'Access-Control-Allow-Origin': '*'})

    def test_reject_redirect_before_following(self):
        handler = monitor.RejectRedirects()
        for method in ('GET', 'OPTIONS'):
            for status in (301, 302, 303, 307, 308):
                for target in ('https://other.example/', monitor.API + '?redirect=1',
                               monitor.API.replace('https:', 'http:')):
                    with self.subTest(method=method, status=status, target=target):
                        with self.assertRaises(HTTPError):
                            handler.redirect_request(Request(monitor.API, method=method),
                                                     None, status, 'redirect', {}, target)

    def test_bounded_read(self):
        response = MagicMock()
        response.read.return_value = b'x' * (monitor.MAX_RESPONSE_BYTES + 1)
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value = response
        with patch.object(monitor, 'build_opener', return_value=opener) as build:
            with self.assertRaises(ValueError):
                monitor.request()
            self.assertIsInstance(build.call_args.args[0], monitor.RejectRedirects)
            response.read.assert_called_once_with(monitor.MAX_RESPONSE_BYTES + 1)

    def test_fixed_request(self):
        response = MagicMock()
        response.read.return_value = b'{}'
        response.status = 204
        response.headers = {}
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value = response
        with patch.object(monitor, 'build_opener', return_value=opener):
            self.assertEqual(monitor.request('OPTIONS'), (204, {}, b'{}'))
            req = opener.open.call_args.args[0]
            self.assertEqual(req.full_url, monitor.API)
            self.assertEqual(req.get_method(), 'OPTIONS')
            self.assertEqual(req.get_header('Origin'), monitor.ORIGIN)
            self.assertEqual(opener.open.call_args.kwargs['timeout'], 35)


if __name__ == '__main__':
    unittest.main()
