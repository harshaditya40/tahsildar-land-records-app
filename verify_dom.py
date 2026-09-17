import re
import sys

def check_html(filepath, checks):
    print(f"\nValidating {filepath}:")
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    passed = 0
    for name, pattern in checks:
        if isinstance(pattern, str):
            found = pattern in content
        else:
            found = bool(pattern.search(content))
        status = "[PASS]" if found else "[FAIL]"
        if found: passed += 1
        print(f"  {status} {name}")
    
    print(f"  Result: {passed}/{len(checks)} checks passed.")
    return passed == len(checks)

index_checks = [
    ("Title 'TAHSILDAR'", "TAHSILDAR — Land Records & Services"),
    ("Brand Header 'TAHSILDAR'", "<h1>TAHSILDAR</h1>"),
    ("Subtitle 'Land Records & Services'", "<p>Land Records & Services</p>"),
    ("Hero 'Land records, made clearer.'", "Land records,<br>"),
    ("Hero Supporting Message", "A unified digital desk for cadastral maps, Record of Rights, land mutation and field verification."),
    ("CTA 'Access Citizen Services'", "Access Citizen Services"),
    ("CTA 'Explore the Workflow'", "Explore the Workflow"),
    ("Feature Strip: ULPIN", "ULPIN"),
    ("Feature Strip: RoR", "RoR"),
    ("Feature Strip: GIS", "GIS"),
    ("Feature Strip: Mutation", "Mutation"),
    ("Feature Strip: Field Verification", "Field Verification"),
    ("Hero Mini-Map container", 'id="hero-cadastre-map"'),
    ("Hero Parcel Details Overlay", 'id="hero-parcel-overlay"'),
    ("4 Services Cards", re.compile(r'class="service-card".*?class="service-card".*?class="service-card".*?class="service-card"', re.DOTALL)),
    ("4-Stage Workflow Section", 'id="workflow"'),
    ("Subtle Kiwis Watermark", 'Made by <b>Kiwis</b>'),
]

login_checks = [
    ("Citizen Tab", 'id="tab-citizen"'),
    ("Officer Tab", 'id="tab-officer"'),
    ("1-Click Citizen Fill", 'fillCitizenDemo()'),
    ("1-Click Officer Fill", 'fillOfficerDemo()'),
    ("Citizen Form Action", 'handleCitizenSubmit(event)'),
    ("Officer Form Action", 'handleOfficerSubmit(event)'),
    ("PIN Verification API Call", '/api/officer/verify-pin/'),
    ("Subtle Kiwis Watermark", 'Made by <b>Kiwis</b>'),
]

map_checks = [
    ("Title TAHSILDAR", "TAHSILDAR — GIS Land Governance"),
    ("Leaflet Map Container", 'id="map"'),
    ("Sliding Parcel Drawer Panel", 'id="parcel-drawer-panel"'),
    ("Drawer ULPIN Display", 'id="drawer-ulpin-val"'),
    ("Drawer RoR Badge", 'id="drawer-ror-badge"'),
    ("Drawer Mutation Badge", 'id="drawer-mut-badge"'),
    ("Drawer Action: RoR Form 1-B", 'openRoRFromDrawer()'),
    ("Drawer Action: GVMC Tax", 'openTaxFromDrawer()'),
    ("Drawer Action: Apply Mutation", 'applyMutationFromDrawer()'),
    ("Drawer Action: Bhu-AI Radar", 'runBhuAIFromDrawer()'),
    ("Citizen My Lands Vault Modal", 'id="modal-citizen-vault"'),
    ("Apply Mutation Form 6-A Modal", 'id="modal-apply-mutation"'),
    ("4-Stage Tracking Drawer", 'id="drawer-tracking"'),
    ("Tahasildar Judicial Chambers Modal", 'id="modal-tahsildar-chambers"'),
    ("Statutory Scrutiny Modal", 'id="modal-document-scrutiny"'),
    ("AI Proceedings Order Modal", 'id="modal-inquiry-order"'),
    ("Turf.js Geodesic Pothissing Modal", 'id="modal-subdivide"'),
    ("Drone DGPS RTK Ingest Modal", 'id="modal-drone-dgps"'),
    ("SRO Deed Registration Modal", 'id="modal-sro-deed"'),
    ("Collector BI War Room Modal", 'id="modal-collector-bi"'),
    ("Subtle Kiwis Watermark", 'Made by <b style="color:rgba(255,255,255,0.7);">Kiwis</b>'),
]

ok1 = check_html('index.html', index_checks)
ok2 = check_html('login.html', login_checks)
ok3 = check_html('map.html', map_checks)

if ok1 and ok2 and ok3:
    print("\nALL HTML & DOM ARCHITECTURAL INTEGRITY CHECKS PASSED WITH 100% COMPLIANCE!")
    sys.exit(0)
else:
    print("\nSOME CHECKS FAILED!")
    sys.exit(1)
