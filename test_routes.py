import urllib.request
import json
import sys

def test_endpoint(url, desc, expected_status=200):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'TahsildarTest/1.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            status = response.getcode()
            body = response.read().decode('utf-8')
            assert status == expected_status, f"Expected {expected_status} but got {status}"
            print(f"  [PASS] {desc}: {status} (Bytes: {len(body)})")
            return True, body
    except Exception as e:
        print(f"  [FAIL] {desc}: {e}")
        return False, str(e)

def test_post(url, desc, payload):
    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=5) as response:
            status = response.getcode()
            body = response.read().decode('utf-8')
            parsed = json.loads(body)
            assert parsed.get('success') == True, f"API failed: {body}"
            print(f"  [PASS] {desc}: {status} (Response: {parsed.get('message', 'OK')})")
            return True, parsed
    except Exception as e:
        print(f"  [FAIL] {desc}: {e}")
        return False, str(e)

if __name__ == '__main__':
    port = sys.argv[1] if len(sys.argv) > 1 else "8000"
    base = f"http://127.0.0.1:{port}"
    print(f"Testing TAHSILDAR server at {base} ...")

    all_passed = True
    for route, desc in [
        ("/", "Landing Page (index.html)"),
        ("/login/", "Auth Portal (login.html)"),
        ("/login/?role=citizen", "Citizen Login Tab"),
        ("/login/?role=officer", "Officer Login Tab"),
        ("/map/", "GIS Map Workspace (map.html)"),
        ("/map/?role=citizen", "Citizen GIS Desk"),
        ("/map/?role=officer", "Officer / Tahasildar Desk"),
        ("/ror/2370/", "RoR Form 1-B e-Passbook"),
        ("/tax/2370/", "GVMC Property Tax Demand Notice"),
        ("/api/parcels/geojson/", "REST API: Parcels GeoJSON"),
        ("/api/analytics/dashboard/", "REST API: Collector Analytics"),
        ("/api/officer/pending-tasks/", "REST API: Officer Pending Tasks"),
        ("/api/citizen/recent-applications/", "REST API: Citizen Applications"),
    ]:
        ok, _ = test_endpoint(f"{base}{route}", desc)
        if not ok: all_passed = False

    # Test POST Officer Verify PIN
    ok, _ = test_post(f"{base}/api/officer/verify-pin/", "POST: Officer Verify PIN (2026)", {"pin": "2026"})
    if not ok: all_passed = False

    # Test POST Citizen Apply Mutation
    ok, data = test_post(f"{base}/api/citizen/apply-mutation/", "POST: Citizen Form 6-A Application", {
        "ulpin": "79Q5CNX8ICNOEL",
        "survey_number": "Sy. No. 148/24",
        "applicant_name": "Sri K. Rama Rao",
        "mutation_type": "Sale Deed Mutation",
        "deed_ref": "AP/SRO/VSKP/2026/009999"
    })
    if not ok: all_passed = False
    new_app = data.get('application_no') if isinstance(data, dict) else None

    # Test POST Officer Approve Task
    if new_app:
        ok, _ = test_post(f"{base}/api/officer/approve-task/", f"POST: Tahasildar Approve Task ({new_app})", {
            "application_no": new_app,
            "officer_role": "tahsildar"
        })
        if not ok: all_passed = False

    print("\nSummary:", "ALL TESTS PASSED!" if all_passed else "SOME TESTS FAILED!")
    sys.exit(0 if all_passed else 1)
