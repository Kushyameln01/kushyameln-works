import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('compare_phases', Path(__file__).resolve().parents[1] / 'tools/vr180/compare-phases.py')
comparison = importlib.util.module_from_spec(spec)
spec.loader.exec_module(comparison)


class NetworkRestriction(unittest.TestCase):
    def test_two_argument_callback_keeps_each_origin_and_rejects_other_requests(self):
        origins = ['http://127.0.0.1:1234', 'http://127.0.0.1:5678']
        handlers = [comparison.local_only(origin) for origin in origins]
        for origin, handler in zip(origins, handlers):
            for url, expected in [(origin + '/vr180-studio/', 'continue'),
                                  (origin + '.example.org/test', 'abort'),
                                  ('https://example.org/', 'abort'),
                                  (origins[1 - origins.index(origin)] + '/', 'abort')]:
                calls = []
                route = SimpleNamespace(continue_=lambda: calls.append('continue'), abort=lambda: calls.append('abort'))
                handler(route, SimpleNamespace(url=url))
                self.assertEqual(calls, [expected])


if __name__ == '__main__':
    unittest.main()
