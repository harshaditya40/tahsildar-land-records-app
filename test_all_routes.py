import urllib.request
import urllib.error
import json

BASE_URL = "http://127.0.0.1:8000"

def test_route(name, path, method="GET", body=None, expected_status=200):
    url = BASE_URL + path
    headers = {"Content-Type": "application/json"} if body else {}
    data = json.dumps(body).encode("utf-8") if body else None
    
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            status = response.getcode()
            content = response.read().decode("utf-8", errors="ignore")
            assert status == expected_status, f"Expected {expected_status}, got {status}"
            print(f" [PASS] {name}: {method} {path} -> {status} (Length: {len(content)})")
            return content
    except urllib.error.HTTPError as e:
        print(f" [FAIL] {name}: {method} {path} -> HTTP {e.code}")
        raise e
    except Exception as e:
        print(f" [FAIL] {name}: {method} {path} -> Error: {e}")
        raise e

def main():
    print("=== TESTING TAHSILDAR GOVERNMENT DPI SERVER ===")
    
    # 1. Page Routes
    test_route("Landing Page", "/")
    test_route("Citizen Login Page", "/login/?role=citizen")
    test_route("Officer Login Page", "/login/?role=officer")
    test_route("Unified Workspace (Citizen)", "/workspace/?role=citizen&view=dashboard")
    test_route("Unified Workspace (Officer)", "/workspace/?role=officer&view=officer-dashboard")
    test_route("GIS Map Page (Citizen)", "/map/?role=citizen&locate=true")
    test_route("GIS Map Page (Officer)", "/map/?role=officer")
    test_route("RoR 1-B e-Passbook", "/ror/2370/")
    test_route("GVMC Tax Assessment", "/tax/2370/")

    # 2. Asset Normalization Tests (Ensuring /login/css/ and /map/js/ resolve properly)
    test_route("Unified Tahsildar CSS", "/css/tahsildar.css")
    test_route("Normalized Login CSS", "/login/css/auth.css")
    test_route("Normalized Map CSS", "/map/css/map.css")
    test_route("Normalized Map JS", "/map/js/data/parcels.js")

    # 3. REST API Endpoints
    map_data_raw = test_route("Parcels Map Data (256 Array)", "/api/parcels/map_data/")
    parcels_list = json.loads(map_data_raw)
    assert len(parcels_list) >= 250, f"Expected 255+ parcels, got {len(parcels_list)}"
    print(f"       -> Verified {len(parcels_list)} cadastral parcels loaded.")

    geojson_raw = test_route("Parcels GeoJSON FeatureCollection", "/api/parcels/geojson/")
    geojson_data = json.loads(geojson_raw)
    assert geojson_data.get("type") == "FeatureCollection"
    print(f"       -> Verified GeoJSON FeatureCollection with {len(geojson_data.get('features', []))} features.")

    test_route("Collector Analytics BI", "/api/analytics/dashboard/")
    test_route("Officer Pending Tasks Queue", "/api/officer/pending-tasks/")
    test_route("Citizen Recent Applications", "/api/citizen/recent-applications/")
    test_route("Citizen Track Mutation by App No", "/api/citizen/track-mutation/?app_no=MUT-2026-00481")
    test_route("Citizen Track Mutation by ULPIN", "/api/citizen/track-mutation/?ulpin=79Q5RUS004501")

    # 4. POST Endpoints
    test_route("Officer PIN Verification (Valid)", "/api/officer/verify-pin/", method="POST", body={"pin": "2026"})
    test_route("Citizen Apply Form 6-A Mutation", "/api/citizen/apply-mutation/", method="POST", body={
        "ulpin": "79Q5CNX8ICNOEL",
        "survey_number": "Sy. No. 148/24",
        "applicant_name": "Sri K. Rama Rao",
        "mutation_type": "Sale Deed Title Transfer",
        "reason": "Test registration submission"
    })
    test_route("Officer Approve Task & Digital Sign", "/api/officer/approve-task/", method="POST", body={
        "application_no": "MUT-2026-00481",
        "officer_role": "tahsildar",
        "remarks": "Order approved post 15-day notice."
    })
    test_route("Citizen Advance Demo Stage", "/api/citizen/advance-stage/", method="POST", body={
        "application_no": "MUT-2026-00481"
    })
    test_route("Turf.js Geodesic Subdivision", "/api/parcels/2422/subdivide/", method="POST", body={
        "owner_a": "Sri K. Rama Rao (Plot A)",
        "owner_b": "Smt. K. Lakshmi (Plot B)",
        "area_a": 1200,
        "area_b": 1200
    })
    test_route("SRO Deed Registration", "/api/parcels/2422/register-sro-deed/", method="POST", body={
        "deed_type": "Absolute Sale Deed",
        "buyer_name": "Sri K. Rama Rao",
        "stamp_duty_inr": "₹ 3,75,000"
    })
    test_route("Officer Verify Document", "/api/officer/verify-document/", method="POST", body={
        "application_no": "MUT-2026-00481",
        "doc_id": "doc_sale_deed_01"
    })
    test_route("Officer Logout", "/api/officer/logout/", method="POST", body={})

    # New & Resilient Production Endpoints
    test_route("CORS Preflight OPTIONS Check", "/api/analytics/dashboard/", method="OPTIONS", expected_status=204)
    test_route("Register / Demarcate New Parcel", "/api/parcels/", method="POST", expected_status=201, body={
        "survey_number": "Sy. No. 202/A",
        "lot_number": "Plot 501 (Madhurawada)",
        "zone": "Madhurawada",
        "property_type": "Residential",
        "owner_name": "Sri A. Venkatesh",
        "address": "Madhurawada Hill View, Visakhapatnam",
        "status": "available",
        "area_sqft": 3600
    })
    test_route("Commit Drone RTK DGPS Demarcation", "/api/parcels/2422/ingest-drone-shapefile/", method="POST", body={
        "coordinates": [[83.32, 17.74], [83.33, 17.74], [83.33, 17.75], [83.32, 17.75]],
        "flight_ref": "DRONE-VSP-2026-F801"
    })
    test_route("ESRI Shapefile Parser (.zip/.shp)", "/api/parcels/parse-shapefile/", method="POST", body={
        "file_name": "vizag_railway_station.zip"
    })
    test_route("Drone Survey GeoJSON Resilient Fallback", "/static/drone_survey_79Q5CNX8ICNOELA.geojson")
    test_route("Demo Parcel Zip Asset", "/static/new_parcel_demo.zip")
    test_route("Root RoR Template Route (no trailing slash)", "/ror")
    test_route("Root Tax Assessment Template Route (no trailing slash)", "/tax")

    print("\nALL 28 ENDPOINTS AND ROUTE NORMALIZATIONS TESTED SUCCESSFULLY! 100% OPERATIONAL.")

if __name__ == "__main__":
    main()
