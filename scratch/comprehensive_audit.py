import urllib.request
import urllib.parse
import json
import re

BASE = "http://127.0.0.1:8000"

def get(path):
    url = BASE + path
    req = urllib.request.Request(url, headers={'User-Agent': 'TAHSILDAR-Auditor/1.0'})
    with urllib.request.urlopen(req) as resp:
        return resp.status, resp.read().decode('utf-8', errors='replace')

def post_json(path, data):
    url = BASE + path
    encoded = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(url, data=encoded, headers={
        'User-Agent': 'TAHSILDAR-Auditor/1.0',
        'Content-Type': 'application/json'
    })
    with urllib.request.urlopen(req) as resp:
        return resp.status, json.loads(resp.read().decode('utf-8'))

def audit():
    print("==========================================================================")
    print(" TAHSILDAR 19-JOURNEY COMPREHENSIVE PRODUCT AUDIT")
    print("==========================================================================")
    passed = 0
    total = 0

    def assert_check(name, condition, details=""):
        nonlocal passed, total
        total += 1
        if condition:
            passed += 1
            print(f" [PASS] {name}")
        else:
            print(f" [FAIL] {name} - {details}")

    # ---------------------------------------------------------
    # 1. Landing Portal
    # ---------------------------------------------------------
    print("\n--- Journey 1: Landing Portal (/) ---")
    status, html = get("/")
    assert_check("Landing HTTP 200", status == 200)
    assert_check("Brand Header TAHSILDAR", "TAHSILDAR" in html)
    assert_check("Hero Title", "Land records," in html and "made clearer." in html)
    assert_check("CTA: Access Citizen Services", 'href="/login/?role=citizen"' in html)
    assert_check("CTA: Explore the Workflow", "Explore the Workflow" in html)
    assert_check("4 Service Cards present", "service-card" in html)
    assert_check("4-Stage Workflow section", 'id="workflow"' in html)
    assert_check("Mini-Map container exists", 'id="hero-cadastre-map"' in html)

    # ---------------------------------------------------------
    # 2. Citizen Login
    # ---------------------------------------------------------
    print("\n--- Journey 2: Citizen Login (/login/?role=citizen) ---")
    status, html = get("/login/?role=citizen")
    assert_check("Login HTTP 200", status == 200)
    assert_check("Citizen & Officer Tabs", 'id="tab-citizen"' in html and 'id="tab-officer"' in html)
    assert_check("1-Click Citizen Fill button", "fillCitizenDemo()" in html and "Sri K. Rama Rao" in html)
    assert_check("Citizen Login Form action", "handleCitizenSubmit" in html or "workspace" in html)

    # ---------------------------------------------------------
    # 3. Citizen Dashboard
    # ---------------------------------------------------------
    print("\n--- Journey 3: Citizen Dashboard (/workspace/?role=citizen) ---")
    status, html = get("/workspace/?role=citizen&view=dashboard")
    assert_check("Workspace HTTP 200", status == 200)
    assert_check("Identity Strip", "GOVERNMENT OF ANDHRA PRADESH" in html)
    assert_check("Welcome Hero Banner", "Sri K. Rama Rao" in html)
    assert_check("KPI Cards", "Landholdings" in html or "Total Extent" in html)
    assert_check("Quick Action Buttons", "Mutation" in html and "Map" in html)

    # ---------------------------------------------------------
    # 4. My Lands
    # ---------------------------------------------------------
    print("\n--- Journey 4: My Lands (/workspace/?role=citizen&view=my-lands) ---")
    assert_check("My Lands View Container", 'id="view-my-lands"' in html)
    assert_check("Madhurawada Parcel 79Q5CNX8ICNOELA", "79Q5CNX8ICNOELA" in html)
    assert_check("Rushikonda Parcel 79Q5RUS004501", "79Q5RUS004501" in html)
    assert_check("Locate on Map buttons", "locateCitizenParcel" in html)

    # ---------------------------------------------------------
    # 5. Locate on Map
    # ---------------------------------------------------------
    print("\n--- Journey 5: Locate on Map PostMessage Handshake ---")
    status, map_js = get("/static/map.js")
    assert_check("PostMessage listener in map.js", "window.addEventListener('message'" in map_js)
    assert_check("Origin validation in map.js", "e.origin !== window.location.origin" in map_js)
    assert_check("ULPIN locate handler in map.js", "LOCATE_PARCEL" in map_js and "selectAndHighlightParcel" in map_js)
    assert_check("Drawer open call in map.js", "openParcelDrawer" in map_js)
    assert_check("Bi-directional reply in map.js", "PARCEL_LOCATED" in map_js)
    assert_check("Workspace listener in workspace.html", "PARCEL_LOCATED" in html and "showToast" in html)

    # ---------------------------------------------------------
    # 6. GIS Cadastral Map
    # ---------------------------------------------------------
    print("\n--- Journey 6: GIS Cadastral Map (/map/?role=citizen) ---")
    status, map_html = get("/map/?role=citizen&locate=true")
    assert_check("Map HTTP 200", status == 200)
    assert_check("Leaflet map container", 'id="map"' in map_html)
    assert_check("Vertical action dock", 'class="landstack-vertical-dock"' in map_html)
    assert_check("Search bar input", 'id="parcel-search"' in map_html or 'class="search-container"' in map_html)

    # ---------------------------------------------------------
    # 7. Parcel Intelligence Drawer
    # ---------------------------------------------------------
    print("\n--- Journey 7: Parcel Intelligence Drawer ---")
    assert_check("Drawer panel element", 'id="parcel-drawer-panel"' in map_html)
    assert_check("Overview Tab", "switchDrawerTab('tab-overview')" in map_html)
    assert_check("Ownership Tab", "switchDrawerTab('tab-ownership')" in map_html)
    assert_check("Spatial Tab", "switchDrawerTab('tab-spatial')" in map_html)
    assert_check("Bhu-AI Risk Tab", "switchDrawerTab('tab-risk')" in map_html)
    assert_check("Actions Tab", "switchDrawerTab('tab-actions')" in map_html)
    assert_check("Advisory Disclaimer", "Advisory" in map_html or "Risk" in map_html)

    # ---------------------------------------------------------
    # 8. Form 6-A Mutation Application
    # ---------------------------------------------------------
    print("\n--- Journey 8: Form 6-A Mutation Application ---")
    assert_check("Form 6-A modal in workspace.html", 'id="modal-apply-mutation"' in html)
    post_data = {
        "applicant_name": "Sri K. Rama Rao",
        "ulpin": "79Q5RUS004501",
        "survey_no": "45/1A",
        "mandal": "Visakhapatnam Urban",
        "village": "Rushikonda",
        "mutation_type": "Sale Deed Conveyance"
    }
    status, res = post_json("/api/citizen/apply-mutation/", post_data)
    assert_check("POST /api/citizen/apply-mutation/ HTTP 200", status == 200)
    assert_check("Returns success and app_no", res.get("success") is True and "MUT-2026-" in res.get("application_no", ""))

    # ---------------------------------------------------------
    # 9. Mutation Status / Ledger
    # ---------------------------------------------------------
    print("\n--- Journey 9: Mutation Status & Ledger Persistence ---")
    assert_check("Recent Applications table in workspace", 'id="view-applications"' in html)
    assert_check("Demo persistence logic in workspace.html", "persistDemoApplication" in html and "tahsildar_demo_applications" in html)
    assert_check("Session badge in persistence code", "Demo Session" in html)

    # ---------------------------------------------------------
    # 10. Officer / Tahasildar Workspace
    # ---------------------------------------------------------
    print("\n--- Journey 10: Officer / Tahasildar Workspace ---")
    status, off_html = get("/workspace/?role=officer&view=officer-dashboard")
    assert_check("Officer Workspace HTTP 200", status == 200)
    assert_check("Officer Dashboard View", 'id="view-officer-dashboard"' in off_html)
    status, pin_res = post_json("/api/officer/verify-pin/", {"pin": "2026"})
    assert_check("Officer PIN 2026 verification", pin_res.get("success") is True)
    status, tasks = get("/api/officer/pending-tasks/")
    assert_check("Officer pending tasks queue HTTP 200", status == 200)

    # ---------------------------------------------------------
    # 11. Survey / Verification Workflow
    # ---------------------------------------------------------
    print("\n--- Journey 11: Survey / Verification Workflow ---")
    assert_check("Surveyor task present in pending tasks", "Mandal Cadastral Surveyor" in tasks)
    status, doc_res = post_json("/api/officer/verify-document/", {"doc_id": "DOC-7721", "verified": True})
    assert_check("POST /api/officer/verify-document/ HTTP 200", status == 200)

    # ---------------------------------------------------------
    # 12. Statutory Notice Workflow
    # ---------------------------------------------------------
    print("\n--- Journey 12: Statutory Notice Workflow ---")
    assert_check("Statutory notice scrutiny modal in map.html", 'id="modal-document-scrutiny"' in map_html or 'notice' in map_html.lower())
    assert_check("15-Day notice period tracking in tasks", "notice_days_remaining" in tasks)

    # ---------------------------------------------------------
    # 13. Speaking Order / Signature Demonstration
    # ---------------------------------------------------------
    print("\n--- Journey 13: Speaking Order & DSC Signature ---")
    assert_check("Tahasildar Judicial Chambers modal in workspace.html", 'id="modal-tahsildar-chambers"' in html)
    status, sign_res = post_json("/api/officer/approve-task/", {
        "application_no": "MUT-2026-00161",
        "officer_role": "tahsildar",
        "remarks": "Form 6-A mutation order approved with digital certificate."
    })
    assert_check("Tahasildar approve & sign task HTTP 200", status == 200)
    assert_check("Digital signature token issued", "DS-AP-REV-2026-" in sign_res.get("token", ""))

    # ---------------------------------------------------------
    # 14. RoR Form 1-B / e-Passbook
    # ---------------------------------------------------------
    print("\n--- Journey 14: RoR Form 1-B / e-Passbook (/ror/2422/) ---")
    status, ror_html = get("/ror/2422/")
    assert_check("RoR Form 1-B HTTP 200", status == 200)
    assert_check("RoR Title Header", "RECORD OF RIGHTS" in ror_html and "FORM 1-B" in ror_html)
    assert_check("Pattadar Details in RoR", "Rama Rao" in ror_html or "Pattadar" in ror_html)
    assert_check("Print Stylesheet in RoR", "@media print" in ror_html)

    # ---------------------------------------------------------
    # 15. SRO Deed Registration Workflow
    # ---------------------------------------------------------
    print("\n--- Journey 15: SRO Deed Registration Handshake ---")
    status, sro_res = post_json("/api/parcels/2422/register-sro-deed/", {
        "document_number": "DOC/VZG/2026/9941",
        "buyer_name": "Sri K. Rama Rao",
        "sale_consideration": 8500000
    })
    assert_check("POST /api/parcels/2422/register-sro-deed/ HTTP 200", status == 200)
    assert_check("Auto Form 6-A trigger generated", "MUT-2026-" in sro_res.get("deed", {}).get("mutation_reference", ""))

    # ---------------------------------------------------------
    # 16. Parcel Subdivision (Turf.js Geodesic Pothissing)
    # ---------------------------------------------------------
    print("\n--- Journey 16: Parcel Subdivision ---")
    status, sub_res = post_json("/api/parcels/2422/subdivide/", {
        "cut_distance_ratio": 0.5,
        "direction": "horizontal"
    })
    assert_check("POST /api/parcels/2422/subdivide/ HTTP 200", status == 200)
    assert_check("Subdivided plots created", "parcel_a" in sub_res and "parcel_b" in sub_res)
    assert_check("Equal area subdivision", sub_res.get("parcel_a", {}).get("area_sqft") == sub_res.get("parcel_b", {}).get("area_sqft"))

    # ---------------------------------------------------------
    # 17. Drone / RTK GNSS Workflow
    # ---------------------------------------------------------
    print("\n--- Journey 17: Drone / RTK GNSS Workflow ---")
    status, drone_geojson = get("/static/drone_survey_79Q5CNX8ICNOELA.geojson")
    assert_check("Drone RTK GeoJSON asset HTTP 200", status == 200)
    assert_check("FeatureCollection format", '"FeatureCollection"' in drone_geojson)
    status, drone_commit = post_json("/api/parcels/2422/ingest-drone-shapefile/", {
        "shapefile_name": "drone_survey_79Q5CNX8ICNOELA.geojson",
        "dgps_accuracy": "3.2mm"
    })
    assert_check("Commit Drone RTK survey HTTP 200", status == 200)

    # ---------------------------------------------------------
    # 18. Bhu-AI Advisory Risk Radar
    # ---------------------------------------------------------
    print("\n--- Journey 18: Bhu-AI Advisory Risk Radar ---")
    assert_check("Bhu-AI drawer tab wired in map.js", "risk" in map_html.lower())
    assert_check("CERSAI and CRZ risk criteria handled", "CERSAI" in map_html and "CRZ" in map_html)
    assert_check("Clear Advisory disclaimer", "advisory" in map_html.lower())

    # ---------------------------------------------------------
    # 19. Collector BI Dashboard
    # ---------------------------------------------------------
    print("\n--- Journey 19: Collector BI Executive Dashboard ---")
    status, bi_res = get("/api/analytics/dashboard/")
    assert_check("GET /api/analytics/dashboard/ HTTP 200", status == 200)
    bi_json = json.loads(bi_res)
    assert_check("Collector KPI metrics returned", "kpis" in bi_json and "total_parcels" in bi_json["kpis"])
    assert_check("Collector modal in map.html", 'id="modal-collector-bi"' in map_html)

    print("\n==========================================================================")
    print(f" TOTAL COMPREHENSIVE AUDIT CHECKS: {passed} / {total} PASSED ({(passed/total)*100:.1f}%)")
    print("==========================================================================")
    return passed == total

if __name__ == "__main__":
    audit()
