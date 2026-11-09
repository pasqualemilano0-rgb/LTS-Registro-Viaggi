import importlib.util
import pathlib
import unittest

file = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'lts_health_monitor.py'
spec = importlib.util.spec_from_file_location('lts_health_monitor', file)
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)

class MonitorTests(unittest.TestCase):
    def test_site_valid(self):
        monitor.verify_response('site', 200, 'text/html', b'<title>LTS</title> id="app"',
                                monitor.BASE, {})
    def test_auth_preflight_valid(self):
        monitor.verify_response('auth', 204, '', b'', monitor.AUTH,
                                {'access-control-allow-origin':'https://pasqualemilano0-rgb.github.io'})
    def test_auth_reject_wrong_cors(self):
        with self.assertRaises(ValueError):
            monitor.verify_response('auth', 204, '', b'', monitor.AUTH,
                                    {'access-control-allow-origin':'*'})
    def test_redirect_to_untrusted_host_rejected(self):
        with self.assertRaises(ValueError):
            monitor.verify_response('site',200,'text/html',b'<title>LTS</title> id="app"',
                                    'https://example.com/',{})
    def test_maintenance_page_not_reported_up(self):
        with self.assertRaises(ValueError):
            monitor.verify_response('site',200,'text/html',b'<title>Maintenance</title>',
                                    monitor.BASE,{})

if __name__ == '__main__':
    unittest.main()
