#!/usr/bin/env python3
"""Read-only external checks for public LTS endpoints; no credentials."""
import argparse
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

BASE = "https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/"
AUTH = "https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-phone-auth"
CHECKS = {
    "site": (BASE, "GET", "text/html", (b'id="app"', b"<title>LTS")),
    "admin": (BASE + "amministratore/", "GET", "text/html", (b'id="login-panel"', b"<title>LTS")),
    "bundle": (BASE + "app.mjs", "GET", "", (b"import ",)),
    "auth": (AUTH, "OPTIONS", "", ()),
}

def verify_response(name, status, content_type, body, final_url, headers):
    url, method, expected_type, markers = CHECKS[name]
    expected, actual = urlparse(url), urlparse(final_url)
    if (expected.scheme, expected.netloc) != (actual.scheme, actual.netloc):
        raise ValueError("Redirect a dominio imprevisto")
    if status != (204 if name == "auth" else 200):
        raise ValueError(f"HTTP {status} inatteso")
    if name == "auth":
        if headers.get("access-control-allow-origin") != "https://pasqualemilano0-rgb.github.io":
            raise ValueError("Preflight CORS non valido")
        return
    if expected_type and expected_type not in content_type.lower():
        raise ValueError("Content-Type inatteso")
    if any(marker not in body for marker in markers):
        raise ValueError("Contenuto atteso non trovato")

def check(name, tries=2):
    url, method, _, _ = CHECKS[name]
    headers = {"User-Agent": "LTS-Public-Health-Monitor/1.0", "Cache-Control": "no-cache"}
    if name == "auth":
        headers.update({"Origin": "https://pasqualemilano0-rgb.github.io",
                        "Access-Control-Request-Method": "POST"})
    for attempt in range(tries):
        try:
            req = Request(url, headers=headers, method=method)
            with urlopen(req, timeout=18) as response:
                body = response.read(250000) if method == "GET" else b""
                verify_response(name, response.status,
                                response.headers.get("Content-Type", ""), body,
                                response.geturl(),
                                {key.lower(): val for key, val in response.headers.items()})
            print(f"OK: {name}")
            return
        except (HTTPError, URLError, ValueError, TimeoutError, OSError) as exc:
            if attempt + 1 == tries:
                raise RuntimeError(f"FAIL: {name} — {type(exc).__name__}: {exc}") from exc
            time.sleep(2)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", choices=CHECKS.keys(), required=True)
    name = parser.parse_args().check
    try:
        check(name)
        return 0
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
