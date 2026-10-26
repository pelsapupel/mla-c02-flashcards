from pathlib import Path
import hashlib
import sys
import time
import urllib.error
import urllib.request

expected = (Path(__file__).resolve().parents[1] / "index.html").read_bytes()
url = sys.argv[1]
for attempt in range(24):
    try:
        request = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
        with urllib.request.urlopen(request, timeout=20) as response:
            actual = response.read()
        if actual == expected:
            print("Verified production page: " + hashlib.sha256(actual).hexdigest())
            break
    except (urllib.error.URLError, TimeoutError):
        pass
    if attempt == 23:
        raise SystemExit("Production did not serve the tested HTML after 24 attempts")
    time.sleep(5)
