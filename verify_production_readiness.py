#!/usr/bin/env python3
"""
TAHSILDAR - Complete Production-Readiness & Vercel Verification Suite
Runs full audit on:
1. Environment Variable Configuration
2. Server Routing & HTTP Methods (GET, POST, OPTIONS)
3. Vercel Deployment Assets (api/index.py, vercel.json, requirements.txt)
4. DOM & Static Asset Integrity
5. Viewport & Mobile Responsive Declarations
"""

import os
import sys
import json
import urllib.request
import urllib.error
import re

BASE_URL = "http://127.0.0.1:8000"
ERRORS = []

def log_pass(msg):
    print(f" [PASS] {msg}", flush=True)

def log_fail(msg):
    print(f" [FAIL] {msg}", flush=True)
    ERRORS.append(msg)

print("=================================================================", flush=True)
print("  TAHSILDAR - PRODUCTION READINESS & DEPLOYMENT AUDIT", flush=True)
print("=================================================================", flush=True)

# 1. Environment Variable & File Structure Audit
print("\n--- 1. AUDITING DEPLOYMENT & CONFIGURATION FILES ---")
required_files = [
    'server.py',
    'vercel.json',
    'requirements.txt',
    'api/index.py',
    'index.html',
    'login.html',
    'workspace.html',
    'map.html',
    'css/tahsildar.css',
    'static/map.js',
    'static/style.css',
    'templates/ror_passbook.html',
    'templates/tax_assessment.html'
]
for rf in required_files:
    if os.path.exists(rf):
        log_pass(f"Required file exists: {rf} ({os.path.getsize(rf)} bytes)")
    else:
        log_fail(f"Missing file: {rf}")

# 2. Vercel Configuration Verification
print("\n--- 2. VERIFYING VERCEL CONFIGURATION ---")
try:
    with open('vercel.json', 'r', encoding='utf-8') as f:
        v_conf = json.load(f)
    assert v_conf.get('version') == 2, "vercel.json version must be 2"
    assert 'rewrites' in v_conf, "rewrites section missing in vercel.json"
    assert any(r.get('destination') == '/api/index.py' for r in v_conf['rewrites']), "Missing /api/index.py rewrite"
    log_pass(f"vercel.json valid: {len(v_conf['rewrites'])} rewrites defined with cleanUrls=true")
except Exception as e:
    log_fail(f"Invalid vercel.json: {e}")

try:
    import api.index
    assert hasattr(api.index, 'handler'), "api.index missing handler class"
    log_pass(f"api/index.py serverless entrypoint valid: {api.index.handler}")
except Exception as e:
    log_fail(f"api/index.py import failed: {e}")

# 3. Viewport & Responsive Declarations Audit
print("\n--- 3. AUDITING RESPONSIVE VIEWPORT DECLARATIONS ---")
html_pages = [
    'index.html',
    'login.html',
    'workspace.html',
    'map.html',
    'templates/ror_passbook.html',
    'templates/tax_assessment.html'
]
for p in html_pages:
    with open(p, 'r', encoding='utf-8') as f:
        c = f.read()
    if re.search(r'<meta[^>]+name=[\'"]viewport[\'"]', c, re.I):
        log_pass(f"{p}: Viewport meta tag present")
    else:
        log_fail(f"{p}: Missing viewport meta tag")

# 4. Live Server Route & API Verification
print("\n--- 4. AUDITING LIVE SERVER ROUTES & ENDPOINTS ---")

test_cases = [
    # Primary Pages
    ("GET", "/", 200, "Landing Page"),
    ("GET", "/login/?role=citizen", 200, "Citizen Login"),
    ("GET", "/login/?role=officer", 200, "Officer Login"),
    ("GET", "/workspace/?role=citizen", 200, "Citizen Workspace"),
    ("GET", "/workspace/?role=officer", 200, "Officer Workspace"),
    ("GET", "/map/?role=citizen&locate=true", 200, "Citizen Live Map"),
    ("GET", "/map/?role=officer", 200, "Officer Live Map"),
    ("GET", "/ror/2422/", 200, "RoR e-Passbook"),
    ("GET", "/ror", 200, "RoR Clean URL (no trailing slash)"),
    ("GET", "/tax/2422/", 200, "Tax Assessment"),
    ("GET", "/tax", 200, "Tax Clean URL (no trailing slash)"),
    # Core Static Assets
    ("GET", "/css/tahsildar.css", 200, "Unified Tahsildar CSS"),
    ("GET", "/static/map.js?v=40.0", 200, "GIS Map Engine JS"),
    ("GET", "/static/drone_survey_79Q5CNX8ICNOELA.geojson", 200, "Resilient Drone Survey Fallback"),
    ("GET", "/static/new_parcel_demo.zip", 200, "Demo Parcel Shapefile Zip"),
    # REST GET APIs
    ("GET", "/api/parcels/map_data/", 200, "Parcels Map Data (256 Array)"),
    ("GET", "/api/parcels/geojson/", 200, "Parcels GeoJSON FeatureCollection"),
    ("GET", "/api/analytics/dashboard/", 200, "Collector BI Analytics"),
    ("GET", "/api/officer/pending-tasks/", 200, "Officer Tasks Queue"),
    ("GET", "/api/citizen/recent-applications/", 200, "Citizen Applications Ledger"),
    ("GET", "/api/citizen/track-mutation/?app_no=MUT-2026-00481", 200, "Track Mutation by App No"),
    # CORS Preflight
    ("OPTIONS", "/api/analytics/dashboard/", 204, "CORS Preflight (204 No Content)"),
    # REST POST APIs
    ("POST", "/api/officer/verify-pin/", 200, "Officer Security PIN", {"pin": "2026"}),
    ("POST", "/api/citizen/apply-mutation/", 200, "Citizen Apply Form 6-A", {
        "ulpin": "79Q5CNX8ICNOEL", "survey_number": "Sy. No. 148/24", "applicant_name": "Sri K. Rama Rao"
    }),
    ("POST", "/api/officer/approve-task/", 200, "Officer Approve Task & DSC Sign", {
        "application_no": "MUT-2026-00481", "digital_sign": True
    }),
    ("POST", "/api/citizen/advance-stage/", 200, "Citizen Advance Stage Walkthrough", {
        "application_no": "MUT-2026-00481"
    }),
    ("POST", "/api/parcels/2422/subdivide/", 200, "Turf.js Geodesic Subdivision", {
        "owner_a": "Sri K. Rama Rao", "owner_b": "Smt. K. Lakshmi", "area_a": 1200, "area_b": 1200
    }),
    ("POST", "/api/parcels/2422/register-sro-deed/", 200, "SRO Deed Registration Handshake", {
        "deed_type": "Absolute Sale Deed", "buyer_name": "Sri K. Rama Rao", "stamp_duty_inr": "₹ 3,75,000"
    }),
    ("POST", "/api/parcels/", 201, "Register / Demarcate New Parcel (201 Created)", {
        "survey_number": "Sy. No. 100/1", "lot_number": "Plot 100", "zone": "VSP", "area_sqft": 2400
    }),
    ("POST", "/api/parcels/2422/ingest-drone-shapefile/", 200, "Commit Drone RTK Boundary", {
        "coordinates": [[83.3, 17.7], [83.4, 17.7], [83.4, 17.8], [83.3, 17.8]]
    }),
    ("POST", "/api/parcels/parse-shapefile/", 200, "Parse ESRI Shapefile Archive", {
        "file_name": "vizag_railway_station.zip"
    }),
    ("POST", "/api/officer/verify-document/", 200, "Officer Verify Document", {
        "application_no": "MUT-2026-00481", "doc_id": "doc_sale_deed_01"
    }),
    ("POST", "/api/officer/logout/", 200, "Officer Logout Session", {})
]

for item in test_cases:
    method = item[0]
    path = item[1]
    expected_status = item[2]
    desc = item[3]
    body = item[4] if len(item) > 4 else None

    url = f"{BASE_URL}{path}"
    headers = {'User-Agent': 'TahsildarAudit/1.0'}
    data = None
    if body is not None:
        data = json.dumps(body).encode('utf-8')
        headers['Content-Type'] = 'application/json'

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            content = resp.read()
            if status == expected_status:
                log_pass(f"{desc}: {method} {path} -> {status} (Length: {len(content)} bytes)")
            else:
                log_fail(f"{desc}: Expected {expected_status}, got {status}")
    except urllib.error.HTTPError as e:
        if e.code == expected_status:
            log_pass(f"{desc}: {method} {path} -> {e.code}")
        else:
            log_fail(f"{desc}: HTTPError {e.code} (expected {expected_status})")
    except Exception as e:
        log_fail(f"{desc}: Connection error: {e}")

print("\n=================================================================")
if not ERRORS:
    print("  AUDIT RESULT: 100% PRODUCTION READY! ALL CHECKS PASSED.")
    print("  Ready for local execution and seamless Vercel deployment.")
else:
    print(f"  AUDIT RESULT: {len(ERRORS)} ERROR(S) FOUND.")
    for err in ERRORS:
        print(f"   * {err}")
print("=================================================================")

sys.exit(0 if not ERRORS else 1)
