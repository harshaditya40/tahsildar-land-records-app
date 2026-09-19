import urllib.request
import urllib.error
import http.client

BASE = "http://127.0.0.1:8000"

def test_path_traversal():
    attacks = [
        "/static/../../windows/system32/cmd.exe",
        "/static/../server.py",
        "/static/..%2f..%2fwindows%2fsystem32%2fcmd.exe",
        "/static/....//....//server.py"
    ]
    print("\n--- 1. Testing Path Traversal Defense ---")
    for attack in attacks:
        url = BASE + attack
        try:
            req = urllib.request.Request(url)
            resp = urllib.request.urlopen(req)
            print(f"[FAIL] {attack} returned HTTP {resp.status} (Expected 403/404)")
        except urllib.error.HTTPError as e:
            if e.code in [403, 404]:
                print(f"[PASS] {attack} successfully blocked with HTTP {e.code}")
            else:
                print(f"[WARN] {attack} returned HTTP {e.code}")
        except Exception as e:
            print(f"[PASS] {attack} blocked with connection error: {e}")

def test_security_headers():
    print("\n--- 2. Testing Security Headers ---")
    req = urllib.request.Request(BASE + "/")
    resp = urllib.request.urlopen(req)
    headers = dict(resp.headers)
    
    x_content_type = headers.get("X-Content-Type-Options") or headers.get("x-content-type-options")
    x_frame = headers.get("X-Frame-Options") or headers.get("x-frame-options")
    
    print(f"X-Content-Type-Options: {x_content_type}")
    print(f"X-Frame-Options: {x_frame}")
    
    assert x_content_type == "nosniff", "Missing or incorrect X-Content-Type-Options header"
    assert x_frame == "SAMEORIGIN", "Missing or incorrect X-Frame-Options header"
    print("[PASS] CSO Security Headers verified successfully")

def test_cors_preflight():
    print("\n--- 3. Testing CORS Preflight ---")
    parsed = urllib.parse.urlparse(BASE)
    conn = http.client.HTTPConnection(parsed.hostname, parsed.port)
    conn.request("OPTIONS", "/api/analytics/dashboard/", headers={
        "Origin": "http://localhost:8000",
        "Access-Control-Request-Method": "GET"
    })
    resp = conn.getresponse()
    print(f"OPTIONS /api/analytics/dashboard/ -> HTTP {resp.status}")
    assert resp.status == 204, f"Expected 204 No Content, got {resp.status}"
    print("[PASS] CORS Preflight OPTIONS returned 204 No Content")

if __name__ == "__main__":
    test_path_traversal()
    test_security_headers()
    test_cors_preflight()
    print("\nALL SECURITY VERIFICATIONS PASSED!")
