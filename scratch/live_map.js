/* =========================================================
   LAND STACK - INTERACTIVE GIS MAP & SPATIAL GOVERNANCE
   SIH26014: Cadastral Survey & Parcel Management
   ========================================================= */

// Global Role & State Variables
var currentRole = 'citizen';
var activeDrawingTool = null;
var drawPoints = [];
var drawPreviewLine = null;
var drawPreviewPolygon = null;
var selectedParcelForSplit = null;
var splitLinePoints = [];

// Global Modal Helpers
window.openModal = function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'flex';
};

window.closeModal = function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
};

// Open Official Government Form 1-B Record of Rights Document
window.openRoRCertificate = function(parcelId) {
    if (!parcelId) return;
    window.open(`/ror/${parcelId}/`, '_blank');
};

// Open Official GVMC Municipal Property Tax Assessment & Demand Notice Document
window.openPropertyTaxModal = function(parcelId) {
    if (!parcelId) return;
    window.open(`/tax/${parcelId}/`, '_blank');
};
window.openPropertyTaxDocument = window.openPropertyTaxModal;

// ==========================================
// CLIENT-SIDE CROSS-TAB INDEXEDDB FILE STORE
// ==========================================
const LANDSTACK_FILE_DB_NAME = 'LandStackDocumentStore';
const LANDSTACK_FILE_STORE = 'uploaded_documents';

window.uploadedFileBlobs = window.uploadedFileBlobs || {};

window.initLandstackFileDB = function() {
    return new Promise(function(resolve) {
        if (!window.indexedDB) {
            resolve(null);
            return;
        }
        var req = window.indexedDB.open(LANDSTACK_FILE_DB_NAME, 1);
        req.onupgradeneeded = function(e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains(LANDSTACK_FILE_STORE)) {
                db.createObjectStore(LANDSTACK_FILE_STORE, { keyPath: 'key' });
            }
        };
        req.onsuccess = function(e) { resolve(e.target.result); };
        req.onerror = function() { resolve(null); };
    });
};

window.saveFileToIndexedDB = function(key, dataUrl, fileName) {
    if (!key || !dataUrl) return;
    window.uploadedFileBlobs = window.uploadedFileBlobs || {};
    window.uploadedFileBlobs[key] = dataUrl;
    window.uploadedFileBlobs[key.toLowerCase()] = dataUrl;
    if (fileName) {
        window.uploadedFileBlobs[fileName] = dataUrl;
        window.uploadedFileBlobs[fileName.toLowerCase()] = dataUrl;
    }

    window.initLandstackFileDB().then(function(db) {
        if (!db) return;
        try {
            var tx = db.transaction(LANDSTACK_FILE_STORE, 'readwrite');
            var store = tx.objectStore(LANDSTACK_FILE_STORE);
            store.put({ key: key.toLowerCase(), dataUrl: dataUrl, fileName: fileName, updated: Date.now() });
            if (fileName && fileName.toLowerCase() !== key.toLowerCase()) {
                store.put({ key: fileName.toLowerCase(), dataUrl: dataUrl, fileName: fileName, updated: Date.now() });
            }
        } catch (e) {
            console.warn('IndexedDB write error:', e);
        }
    });
};

window.getFileFromIndexedDB = function(key) {
    return new Promise(function(resolve) {
        if (!key) { resolve(null); return; }
        if (window.uploadedFileBlobs && window.uploadedFileBlobs[key]) {
            resolve(window.uploadedFileBlobs[key]);
            return;
        }
        if (window.uploadedFileBlobs && window.uploadedFileBlobs[key.toLowerCase()]) {
            resolve(window.uploadedFileBlobs[key.toLowerCase()]);
            return;
        }
        window.initLandstackFileDB().then(function(db) {
            if (!db) { resolve(null); return; }
            try {
                var tx = db.transaction(LANDSTACK_FILE_STORE, 'readonly');
                var store = tx.objectStore(LANDSTACK_FILE_STORE);
                var req = store.get(key.toLowerCase());
                req.onsuccess = function() {
                    if (req.result && req.result.dataUrl) {
                        window.uploadedFileBlobs = window.uploadedFileBlobs || {};
                        window.uploadedFileBlobs[key] = req.result.dataUrl;
                        window.uploadedFileBlobs[key.toLowerCase()] = req.result.dataUrl;
                        resolve(req.result.dataUrl);
                    } else {
                        resolve(null);
                    }
                };
                req.onerror = function() { resolve(null); };
            } catch (e) {
                resolve(null);
            }
        });
    });
};

// Tab-Isolated Role Management (Per-Tab Session & URL Context)
function isOfficerTabAuthenticated() {
    return sessionStorage.getItem('landstack_officer_auth') === 'true';
}

function getTabRole() {
    var urlParams = new URLSearchParams(window.location.search);
    var urlRole = (urlParams.get('role') || '').toLowerCase();
    
    // Explicit URL override for this tab
    if (urlRole === 'citizen') {
        sessionStorage.removeItem('landstack_officer_auth');
        sessionStorage.setItem('landstack_role', 'citizen');
        return 'citizen';
    }
    if (urlRole === 'officer') {
        if (sessionStorage.getItem('landstack_officer_auth') === 'true') {
            sessionStorage.setItem('landstack_role', 'officer');
            return 'officer';
        }
        return 'citizen'; // Unverified in this tab -> defaults to citizen until PIN entered
    }
    
    // Stored tab state
    var storedRole = sessionStorage.getItem('landstack_role');
    if (storedRole === 'officer' && isOfficerTabAuthenticated()) {
        return 'officer';
    }
    return 'citizen';
}

var currentRole = getTabRole();
var isOfficerAuthenticated = (currentRole === 'officer');

window.applyTabRoleUI = function(forcedRole) {
    var role = forcedRole || getTabRole();
    currentRole = role;
    isOfficerAuthenticated = (role === 'officer');
    
    var dockActive = document.getElementById('dock-officer-active');
    var dockLogin = document.getElementById('dock-officer-login');
    var spatialDock = document.getElementById('officer-spatial-dock');
    
    if (role === 'officer') {
        if (dockActive) dockActive.style.display = 'flex';
        if (dockLogin) dockLogin.style.display = 'none';
        if (spatialDock) spatialDock.style.display = 'block';
        if (document.body) document.body.classList.add('role-officer');
    } else {
        if (dockActive) dockActive.style.display = 'none';
        if (dockLogin) dockLogin.style.display = 'flex';
        if (spatialDock) spatialDock.style.display = 'none';
        if (document.body) document.body.classList.remove('role-officer');
        if (window.cancelActiveTool) window.cancelActiveTool();
    }
    
    // If a parcel popup is currently open, refresh it with appropriate role action buttons
    if (typeof activeParcelId !== 'undefined' && activeParcelId && typeof parcelFeatureMap !== 'undefined' && parcelFeatureMap[activeParcelId]) {
        var feature = parcelFeatureMap[activeParcelId];
        if (typeof activePolygonLayer !== 'undefined' && activePolygonLayer) {
            var layers = activePolygonLayer.getLayers();
            if (layers.length > 0 && layers[0].getPopup && layers[0].getPopup() && layers[0].isPopupOpen()) {
                layers[0].setPopupContent(createPopupHTML(feature.properties));
            }
        }
    }
};

// Global Role Switcher with Tab-Isolated Auth Gate
window.switchRole = function(role) {
    if (role === 'officer' && !isOfficerTabAuthenticated()) {
        window.openModal('modal-officer-auth');
        return;
    }
    sessionStorage.setItem('landstack_role', role);
    if (role === 'officer') {
        sessionStorage.setItem('landstack_officer_auth', 'true');
        var newUrl = new URL(window.location);
        newUrl.searchParams.set('role', 'officer');
        window.history.replaceState(null, '', newUrl.toString());
    } else {
        sessionStorage.removeItem('landstack_officer_auth');
        var newUrl = new URL(window.location);
        newUrl.searchParams.set('role', 'citizen');
        window.history.replaceState(null, '', newUrl.toString());
    }
    window.applyTabRoleUI(role);
};

window.submitOfficerAuth = function() {
    var pinEl = document.getElementById('officer-security-pin');
    var errEl = document.getElementById('officer-auth-error');
    if (!pinEl) return;
    var pin = pinEl.value.trim();
    if (!pin) {
        errEl.textContent = 'Please enter your Officer PIN (e.g. 2026)';
        errEl.style.display = 'block';
        return;
    }
    fetch('/api/officer/verify-pin/', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ pin: pin })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            sessionStorage.setItem('landstack_officer_auth', 'true');
            sessionStorage.setItem('landstack_role', 'officer');
            var newUrl = new URL(window.location);
            newUrl.searchParams.set('role', 'officer');
            window.history.replaceState(null, '', newUrl.toString());
            window.closeModal('modal-officer-auth');
            pinEl.value = '';
            if (errEl) errEl.style.display = 'none';
            window.applyTabRoleUI('officer');
        } else {
            errEl.textContent = data.message || 'Invalid Officer PIN';
            errEl.style.display = 'block';
        }
    })
    .catch(err => {
        errEl.textContent = 'Verification error. Please try again.';
        errEl.style.display = 'block';
    });
};

window.logoutOfficer = function() {
    sessionStorage.removeItem('landstack_officer_auth');
    sessionStorage.setItem('landstack_role', 'citizen');
    var newUrl = new URL(window.location);
    newUrl.searchParams.set('role', 'citizen');
    window.history.replaceState(null, '', newUrl.toString());
    window.applyTabRoleUI('citizen');
    fetch('/api/officer/logout/', { method: 'POST' }).catch(() => {});
};

var _mapModuleInitialized = false;
function initMapModule() {
    if (_mapModuleInitialized) return;
    _mapModuleInitialized = true;
    if (typeof L === 'undefined') {
        console.error("Leaflet library not loaded");
        return;
    }

    // Check if user attempted officer access in URL without auth in this tab
    var urlParams = new URLSearchParams(window.location.search);
    var urlRole = (urlParams.get('role') || '').toLowerCase();
    if (urlRole === 'officer' && !isOfficerTabAuthenticated()) {
        window.openModal('modal-officer-auth');
    }
    window.applyTabRoleUI();

    // ========== 1. BASE MAP TILES ==========
    // Ultra High-Resolution Satellite (Native zoom up to 20)
    var satelliteHighRes = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 22,
        maxNativeZoom: 20,
        attribution: '© Google Satellite'
    });

    // Esri World Imagery (Native zoom up to 17 in AP rural/suburban regions)
    var esriImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 22,
        maxNativeZoom: 17,
        attribution: 'Tiles © Esri'
    });

    var esriLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 22,
        maxNativeZoom: 17,
        attribution: 'Labels © Esri'
    });

    var esriSatellite = L.layerGroup([esriImagery, esriLabels]);

    var streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 22,
        maxNativeZoom: 19,
        attribution: '© OpenStreetMap contributors'
    });

    var topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 22,
        maxNativeZoom: 17,
        attribution: 'Map data: © OpenStreetMap, SRTM | Map style: © OpenTopoMap'
    });

    // ========== 2. STATUS COLOR SCHEME ==========
    var statusColors = {
        'available': { fill: '#22c55e', stroke: '#15803d' },  // Emerald Green
        'occupied': { fill: '#3b82f6', stroke: '#1d4ed8' },   // Royal Blue
        'disputed': { fill: '#ef4444', stroke: '#b91c1c' }    // Crimson Red
    };

    function getPlotStyle(feature) {
        var status = (feature.properties && feature.properties.status) ? feature.properties.status.toLowerCase() : 'available';
        var colors = statusColors[status] || { fill: '#3b82f6', stroke: '#1d4ed8' };
        
        return {
            fillColor: colors.fill,
            weight: 2,
            opacity: 1,
            color: '#0f172a',
            fillOpacity: 0.45
        };
    }

    function highlightPlot(e) {
        if (activeDrawingTool) return;
        var layer = e.target;
        layer.setStyle({
            weight: 3.5,
            color: '#ffffff',
            fillOpacity: 0.75
        });
        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            layer.bringToFront();
        }
    }

    function resetPlotHighlight(e) {
        if (activeDrawingTool) return;
        parcelPlotLayer.resetStyle(e.target);
    }

    function formatZoneName(zoneCode) {
        if (!zoneCode) return 'Visakhapatnam';
        return zoneCode.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    // ========== 3. 3-TIER LAYER GROUPS & STYLES ==========
    // Tier 1: Cadastral & Base Dots
    var parcelDotsLayer = L.layerGroup();
    var activePolygonLayer = L.featureGroup();
    var splitPreviewLayer = L.featureGroup();
    var parcelFeatureMap = {};
    var activeParcelId = null;

    // Tier 2: Essential Governance Layers
    var masterPlanZoningLayer = L.layerGroup();
    var buildingPermissionsLayer = L.layerGroup();
    var encumbranceLienLayer = L.layerGroup();

    // Tier 3: Use-Case & Infrastructure Layers
    var propertyTaxationLayer = L.layerGroup();
    var utilityWaterLayer = L.layerGroup();
    var utilityPowerLayer = L.layerGroup();
    var crzRestrictionLayer = L.layerGroup();

    // Module E: Innovation Differentiators (AI Satellite Temporal Encroachment Detection)

    var zoningStyles = {
        'residential': { fill: '#eab308', stroke: '#ca8a04', name: 'Residential Zone (R1/R2)' },
        'commercial': { fill: '#3b82f6', stroke: '#1d4ed8', name: 'Commercial Zone (C1/C2)' },
        'industrial': { fill: '#a855f7', stroke: '#7e22ce', name: 'Industrial Zone (I1/I2)' },
        'it_sez': { fill: '#06b6d4', stroke: '#0891b2', name: 'IT SEZ / Tech Park' },
        'institutional': { fill: '#ea580c', stroke: '#c2410c', name: 'Institutional & Public' },
        'green_belt': { fill: '#22c55e', stroke: '#15803d', name: 'Recreational & Green Belt' }
    };

    // Helper: Retrieve all ULPINs registered to the authenticated citizen's Aadhaar
    window.getCitizenLinkedULPINs = function() {
        try {
            var raw = sessionStorage.getItem('landstack_citizen_ulpins');
            if (raw) {
                var arr = JSON.parse(raw);
                if (Array.isArray(arr) && arr.length > 0) return arr.map(u => u.toUpperCase().trim());
            }
        } catch(e) {}
        var single = sessionStorage.getItem('landstack_citizen_ulpin');
        if (single) return [single.toUpperCase().trim(), '79Q5RUS004501'];
        // Default authenticated citizen (Sri K. Rama Rao) owns 2 verified cadastral parcels:
        return ['79Q5CNX8ICNOELA', '79Q5RUS004501'];
    };

    function isCitizenOwnedParcel(p) {
        if (!p) return false;
        var linked = window.getCitizenLinkedULPINs();
        var pUlpin = (p.ulpin || '').toUpperCase().trim();
        if (pUlpin && linked.includes(pUlpin)) return true;
        if (p.owner_name && p.owner_name.toLowerCase().includes('rama rao')) return true;
        return false;
    }

    function createPopupHTML(p) {
        var statusClass = `status-${p.status}`;
        var zoneFormatted = formatZoneName(p.zone);
        var landmarkName = p.lot_number || p.parcel_id || `Parcel #${p.id}`;
        var ulpinCode = p.ulpin || `AP-VSP-${(p.zone||'GEN').toUpperCase().slice(0,3)}-${String(p.id||100).padStart(6,'0')}`;
        var rorCode = p.ror_number || `ROR-2026-VSP-${String(p.id||100).padStart(5,'0')}`;
        var formattedValue = p.market_value ? `₹ ${Number(p.market_value).toLocaleString('en-IN')}` : `₹ ${(Number(p.area_sqft||2400) * 4200).toLocaleString('en-IN')}`;

        var isOfficer = (getTabRole() === 'officer' && isOfficerTabAuthenticated());
        var isMyParcel = isCitizenOwnedParcel(p);

        var actionButtons = '';
        var ownershipPill = '';

        if (isOfficer) {
            // Government Officer View: Full Administrative Controls
            actionButtons = `
                <button class="btn-popup-action btn-cert-popup" onclick="openRoRCertificate(${p.id})">
                    <i class="fas fa-certificate"></i> RoR (1B)
                </button>
                <button class="btn-popup-action btn-tax-popup" style="background:#0f766e; color:#fff;" onclick="openPropertyTaxModal(${p.id})">
                    <i class="fas fa-receipt"></i> GVMC Tax
                </button>
                <button class="btn-popup-action btn-mutation-popup" onclick="openCitizenMutationModal(${p.id})" title="Review or Order Cadastral Mutation">
                    <i class="fas fa-file-invoice"></i> Mutation
                </button>
                <button class="btn-popup-action btn-sro-popup" style="background:#0f2b5c; color:#fff;" onclick="openSRODeedModal(${p.id})">
                    <i class="fas fa-file-signature"></i> SRO Deed
                </button>
                <button class="btn-popup-action btn-subdivide-popup" onclick="initiateSubdivisionForParcel(${p.id})">
                    <i class="fas fa-cut"></i> Subdivide
                </button>
            `;
            ownershipPill = `
                <div style="font-size: 11px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px; padding: 4px 8px; margin: 6px 0; color: #1e40af; font-weight: 700; display: flex; align-items: center; gap: 6px;">
                    <i class="fas fa-user-shield" style="color: #2563eb;"></i>
                    <span>Officer Administration Desk • Full Jurisdiction</span>
                </div>
            `;
        } else if (isMyParcel) {
            // Citizen View for THEIR OWN registered property
            actionButtons = `
                <button class="btn-popup-action btn-cert-popup" onclick="openRoRCertificate(${p.id})">
                    <i class="fas fa-certificate"></i> RoR (1B)
                </button>
                <button class="btn-popup-action btn-tax-popup" style="background:#0f766e; color:#fff;" onclick="openPropertyTaxModal(${p.id})">
                    <i class="fas fa-receipt"></i> GVMC Tax
                </button>
                <button class="btn-popup-action btn-mutation-popup" style="background:#059669; color:#fff; font-weight:700;" onclick="openCitizenMutationModal(${p.id})" title="Apply for Mutation / Resurvey on your registered property">
                    <i class="fas fa-file-invoice"></i> Apply Mutation
                </button>
            `;
            ownershipPill = `
                <div style="font-size: 11px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 4px; padding: 4px 8px; margin: 6px 0; color: #065f46; font-weight: 700; display: flex; align-items: center; gap: 6px;">
                    <i class="fas fa-check-circle" style="color: #059669;"></i>
                    <span>Your Registered Property • Linked to Aadhaar (${sessionStorage.getItem('landstack_citizen_aadhaar') || '5489 2104 8921'})</span>
                </div>
            `;
        } else {
            // Citizen View for OTHER citizens' properties / public cadastral parcels:
            // STRICT PRIVACY & OWNERSHIP GUARD: Public verification ONLY!
            actionButtons = `
                <button class="btn-popup-action btn-cert-popup" onclick="openRoRCertificate(${p.id})" title="Verify Public Record of Rights (Form 1B)">
                    <i class="fas fa-certificate"></i> RoR (1B)
                </button>
                <button class="btn-popup-action btn-tax-popup" style="background:#0f766e; color:#fff;" onclick="openPropertyTaxModal(${p.id})" title="View GVMC Municipal Property Tax Assessment">
                    <i class="fas fa-receipt"></i> GVMC Tax
                </button>
            `;
            ownershipPill = `
                <div style="font-size: 10.5px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 3px 8px; margin: 6px 0; color: #64748b; display: flex; align-items: center; gap: 5px;">
                    <i class="fas fa-lock" style="color: #94a3b8;"></i>
                    <span>Public Record View • Third-Party Parcel (Mutation Restricted to Owner)</span>
                </div>
            `;
        }

        var zoningInfo = zoningStyles[p.zoning_code] || zoningStyles['residential'];
        var encStatusClass = p.encumbrance_status || 'clear';
        var encLabel = (p.encumbrance_status === 'clear') ? 'Clear Title (Nil EC)' : 
                       (p.encumbrance_status === 'mortgaged' ? `Bank Lien: ${p.encumbrance_bank || 'SBI'}` : 'Court Injunction / Stay');

        var bldStatusClass = p.building_approval_status || 'approved';
        var bldLabel = (p.building_approval_status === 'approved') ? 'GVMC Approved (G+4)' :
                       (p.building_approval_status === 'pending' ? 'Under Plan Verification' : 'Municipal Notice Issued');

        var taxStatusClass = (p.tax_payment_status || (p.tax_status === 'paid' ? 'Paid' : 'Due')).toLowerCase().replace(/\s+/g, '-');
        var curDemandStr = '₹' + Number(p.tax_current_demand || 18500).toLocaleString('en-IN');
        var taxLabel = (p.tax_payment_status === 'Paid' || p.tax_status === 'paid') ? 'Paid Up-to-Date' : `Due: ${curDemandStr}`;

        var crzLabel = (p.crz_zone === 'crz_1_ndz') ? 'CRZ-I: No-Dev Zone (0-200m)' :
                       (p.crz_zone === 'crz_2_regulated') ? 'CRZ-II: Regulated (200-500m)' :
                       (p.crz_zone === 'eco_buffer') ? 'Eco Forest Buffer' : 'Outside CRZ / Clear';

        return `
            <div class="popup-content">
                <div class="popup-header">
                    <h4 style="font-size: 14px; font-weight: 700; color: #0f172a;"><i class="fas fa-landmark"></i> ${landmarkName}</h4>
                    <span class="result-item-status ${statusClass}">${(p.status||'AVAILABLE').toUpperCase()}</span>
                </div>
                <div style="font-size: 11px; color: #64748b; margin-top: -3px; margin-bottom: 5px;">
                    Parcel ID: <strong>${p.parcel_id}</strong>
                </div>
                <div>
                    <span class="ulpin-tag-badge"><i class="fas fa-fingerprint"></i> ${ulpinCode}</span>
                </div>
                <hr class="popup-divider">
                <p><strong><i class="fas fa-file-contract"></i> RoR Passbook:</strong> <code>${rorCode}</code></p>
                <p><strong><i class="fas fa-landmark"></i> Survey No:</strong> ${p.survey_number || 'N/A'}</p>
                <p><strong><i class="fas fa-ruler-combined"></i> Dimensions:</strong> <code>${p.dimensions || (p.area_sqft + ' sqft')}</code></p>
                <p><strong><i class="fas fa-coins"></i> Guideline Value:</strong> <span style="color:#059669; font-weight:700;">${formattedValue}</span></p>
                <p><strong><i class="fas fa-map-marker-alt"></i> Address:</strong> ${p.address}</p>
                <p><strong><i class="fas fa-user-check"></i> Owner:</strong> ${p.owner_name || 'Revenue Dept'}</p>
                ${ownershipPill}

                <!-- 3-Tier Multi-Departmental Governance Grid -->
                <div class="popup-tier-grid">
                    <div class="tier-card">
                        <div class="tier-card-title"><i class="fas fa-drafting-compass"></i> Master Plan 2041</div>
                        <div class="tier-card-val" style="color:${zoningInfo.stroke};">${zoningInfo.name.split(' ')[0]} (FAR: ${p.zoning_far||'1.75'})</div>
                    </div>
                    <div class="tier-card">
                        <div class="tier-card-title"><i class="fas fa-shield-alt"></i> Encumbrance (SRO)</div>
                        <div class="tier-card-val ${encStatusClass}">${encLabel}</div>
                    </div>
                    <div class="tier-card">
                        <div class="tier-card-title"><i class="fas fa-city"></i> Building Permit</div>
                        <div class="tier-card-val ${bldStatusClass}">${bldLabel}</div>
                    </div>
                    <div class="tier-card" style="cursor:pointer;" onclick="openPropertyTaxModal(${p.id})" title="Click to view full GVMC Municipal Tax Assessment">
                        <div class="tier-card-title"><i class="fas fa-receipt"></i> Property Tax (GVMC)</div>
                        <div class="tier-card-val ${taxStatusClass}">${taxLabel} <i class="fas fa-external-link-alt" style="font-size:8px; margin-left:2px; opacity:0.7;"></i></div>
                    </div>
                </div>
                <div style="font-size: 10px; color: #64748b; margin-top: 4px; display: flex; align-items: center; gap: 4px;">
                    <i class="fas fa-water" style="color: #0284c7;"></i> CRZ Status: <strong style="color: #0f172a;">${crzLabel}</strong>
                </div>
                
                <div class="popup-actions-wrapper">
                    ${actionButtons}
                </div>
            </div>
        `;
    }

    window.selectAndHighlightParcel = function(parcelId, fitBounds) {
        activePolygonLayer.clearLayers();
        activeParcelId = parcelId;

        var feature = parcelFeatureMap[parcelId] || parcelFeatureMap[Number(parcelId)] || (rawGeoJson && rawGeoJson.features ? rawGeoJson.features.find(f => f.properties && (f.properties.id == parcelId || f.properties.parcel_id == parcelId || f.properties.ulpin == parcelId)) : null);
        if (!feature || !feature.geometry || !feature.geometry.coordinates || !feature.geometry.coordinates[0]) return;

        var p = feature.properties;
        var status = (p.status || 'available').toLowerCase();
        var colors = statusColors[status] || { fill: '#3b82f6', stroke: '#1d4ed8' };

        var poly = L.polygon(feature.geometry.coordinates[0].map(c => [c[1], c[0]]), {
            fillColor: colors.fill,
            weight: 3.5,
            opacity: 1,
            color: '#ffffff',
            fillOpacity: 0.65,
            className: 'selected-active-parcel'
        });

        poly.bindPopup(createPopupHTML(p), { maxWidth: 360 });
        poly.on('click', function(e) {
            if (activeDrawingTool === 'sro_select') {
                L.DomEvent.stopPropagation(e);
                window.cancelActiveTool();
                window.openSRODeedModal(p.id);
                return;
            }
            if (activeDrawingTool === 'subdivide_select') {
                L.DomEvent.stopPropagation(e);
                handleParcelSelectedForSplit(p, feature.geometry.coordinates[0]);
                return;
            }
            if (activeDrawingTool === 'subdivide_cut') {
                L.DomEvent.stopPropagation(e);
                map.closePopup();
                window.addSplitPoint(e.latlng);
                return;
            }
        });
        activePolygonLayer.addLayer(poly);

        if (fitBounds) {
            try {
                var mapSize = map.getSize();
                if (mapSize && mapSize.x > 0 && mapSize.y > 0) {
                    map.fitBounds(poly.getBounds(), { maxZoom: 20, padding: [50, 50] });
                } else {
                    map.setView(poly.getBounds().getCenter(), 18);
                }
            } catch(e) {
                map.setView(poly.getBounds().getCenter(), 18);
            }
        }
        poly.openPopup();

        // Automatically synchronize and open the Sliding Parcel Intelligence Drawer
        if (typeof window.openParcelDrawer === 'function') {
            window.openParcelDrawer(p, feature);
        }
    };

    // =========================================================================
    // SLIDING PARCEL INTELLIGENCE DRAWER CONTROLLER
    // Full-Fidelity Cadastral & Bhu-AI Multi-Tab Inspector
    // =========================================================================
    window.activeDrawerParcel = null;
    window.activeDrawerFeature = null;

    window.openParcelDrawer = function(p, feature) {
        if (!p) return;
        window.activeDrawerParcel = p;
        window.activeDrawerFeature = feature;

        var drawer = document.getElementById('parcel-drawer-panel');
        if (!drawer) return;

        // Title and Sub-bar
        var titleEl = document.getElementById('drawer-title');
        if (titleEl) titleEl.textContent = `Cadastral Parcel: Plot #${p.lot_number || p.parcel_id || p.id} (Sy. No. ${p.survey_number || 'N/A'})`;

        var ulpinEl = document.getElementById('drawer-ulpin-val');
        var ulpinCode = p.ulpin || `AP-VSP-${(p.zone||'GEN').toUpperCase().slice(0,3)}-${String(p.id||100).padStart(6,'0')}`;
        if (ulpinEl) ulpinEl.textContent = ulpinCode;

        var rorBadge = document.getElementById('drawer-ror-badge');
        if (rorBadge) {
            rorBadge.textContent = p.ror_number ? `RoR 1-B: ${p.ror_number}` : 'RoR Form 1-B Active';
        }

        var mutBadge = document.getElementById('drawer-mut-badge');
        if (mutBadge) {
            var isMut = (p.status || '').toLowerCase().includes('mutation');
            var isDisp = (p.status || '').toLowerCase().includes('disputed');
            if (isDisp) {
                mutBadge.textContent = 'Statutory Notice / Disputed';
                mutBadge.className = 'badge-status';
                mutBadge.style.background = '#fef2f2';
                mutBadge.style.color = '#991b1b';
                mutBadge.style.border = '1px solid #fecaca';
            } else if (isMut) {
                mutBadge.textContent = 'Mutation In Progress';
                mutBadge.className = 'badge-status';
                mutBadge.style.background = '#fffbeb';
                mutBadge.style.color = '#92400e';
                mutBadge.style.border = '1px solid #fde68a';
            } else {
                mutBadge.textContent = 'Clear Title';
                mutBadge.className = 'badge-status badge-mut-clear';
                mutBadge.style.background = '#eff6ff';
                mutBadge.style.color = '#1e40af';
                mutBadge.style.border = '1px solid #bfdbfe';
            }
        }

        // TAB 1: Overview KPIs
        var syNoEl = document.getElementById('drawer-sy-no');
        if (syNoEl) syNoEl.textContent = `Sy. No. ${p.survey_number || '148/24'}`;

        var plotNoEl = document.getElementById('drawer-plot-no');
        if (plotNoEl) plotNoEl.textContent = `Plot #${p.lot_number || p.parcel_id || p.id}`;

        var areaValEl = document.getElementById('drawer-area-val');
        var sqft = Number(p.area_sqft || 2400);
        var cents = (sqft / 435.6).toFixed(2);
        if (areaValEl) areaValEl.textContent = `${sqft.toLocaleString('en-IN')} Sq.Ft (${cents} Cents)`;

        var mktValEl = document.getElementById('drawer-market-val');
        var mktVal = p.market_value ? Number(p.market_value) : (sqft * 4200);
        if (mktValEl) mktValEl.textContent = `₹ ${mktVal.toLocaleString('en-IN')}`;

        var villageEl = document.getElementById('drawer-village-name');
        if (villageEl) villageEl.textContent = `${p.village || 'Rushikonda'}, Ward 04`;

        var landClassEl = document.getElementById('drawer-land-class');
        if (landClassEl) landClassEl.textContent = p.land_class || 'Ryotwari Dry (Patta)';

        // TAB 2: Ownership
        var ownerNameEl = document.getElementById('drawer-owner-name');
        if (ownerNameEl) ownerNameEl.textContent = p.owner_name || 'Sri K. Rama Rao';

        var khataEl = document.getElementById('drawer-khata-no');
        if (khataEl) khataEl.textContent = p.khata_number || ('KH-' + (p.id || '2422'));

        // TAB 3: Spatial
        var coordsEl = document.getElementById('drawer-coords-val');
        var lat = 17.7830;
        var lng = 83.3810;
        var coordsCount = 4;
        var perimeterMeters = 64.2;

        if (feature && feature.geometry && feature.geometry.coordinates && feature.geometry.coordinates[0]) {
            var ring = feature.geometry.coordinates[0];
            coordsCount = ring.length;
            lat = ring.reduce((acc, c) => acc + c[1], 0) / ring.length;
            lng = ring.reduce((acc, c) => acc + c[0], 0) / ring.length;
            var perim = 0;
            for (var i = 0; i < ring.length - 1; i++) {
                var dlat = (ring[i+1][1] - ring[i][1]) * 111000;
                var dlng = (ring[i+1][0] - ring[i][0]) * 111000 * Math.cos(lat * Math.PI / 180);
                perim += Math.hypot(dlat, dlng);
            }
            if (perim > 0) perimeterMeters = Math.round(perim * 10) / 10;
        }
        if (coordsEl) coordsEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

        var vertEl = document.getElementById('drawer-vertices-count');
        if (vertEl) vertEl.textContent = `${coordsCount} Geodesic Points`;

        var perimEl = document.getElementById('drawer-perimeter-val');
        if (perimEl) perimEl.textContent = `${perimeterMeters} meters`;

        // TAB 4: Bhu-AI Risk
        var riskScoreEl = document.getElementById('drawer-risk-score');
        var riskScore = p.risk_score !== undefined ? Number(p.risk_score) : (p.status === 'disputed' ? 68 : (p.status === 'mutation' ? 34 : 12));
        if (riskScoreEl) {
            if (riskScore < 25) {
                riskScoreEl.textContent = `${riskScore} / 100 • Low Risk Indicator`;
                riskScoreEl.className = 'badge-risk-low';
            } else if (riskScore < 50) {
                riskScoreEl.textContent = `${riskScore} / 100 • Moderate / Review`;
                riskScoreEl.className = 'badge-status';
                riskScoreEl.style.background = '#fef3c7';
                riskScoreEl.style.color = '#92400e';
            } else {
                riskScoreEl.textContent = `${riskScore} / 100 • High Risk / Scrutiny`;
                riskScoreEl.className = 'badge-status';
                riskScoreEl.style.background = '#fee2e2';
                riskScoreEl.style.color = '#991b1b';
            }
        }

        var crzRiskEl = document.getElementById('drawer-crz-risk');
        if (crzRiskEl) {
            if (p.crz_zone === 'crz_1_ndz') {
                crzRiskEl.innerHTML = '<span style="color:#dc2626;"><i class="fas fa-exclamation-triangle"></i> CRZ-I: No Development Zone</span>';
            } else if (p.crz_zone === 'crz_2_regulated') {
                crzRiskEl.innerHTML = '<span style="color:#d97706;"><i class="fas fa-info-circle"></i> CRZ-II: Regulated 200-500m</span>';
            } else {
                crzRiskEl.innerHTML = '<span class="risk-clean"><i class="fas fa-check"></i> Outside Buffer</span>';
            }
        }

        // Show drawer
        drawer.style.display = 'flex';
    };

    window.closeParcelDrawer = function() {
        var drawer = document.getElementById('parcel-drawer-panel');
        if (drawer) drawer.style.display = 'none';
    };

    window.switchDrawerTab = function(tabId) {
        document.querySelectorAll('.drawer-tab-btn').forEach(function(btn) {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        });
        document.querySelectorAll('.drawer-tab-content').forEach(function(content) {
            content.classList.toggle('active', content.id === tabId);
        });
    };

    window.copyDrawerULPIN = function() {
        var ulpin = (window.activeDrawerParcel && window.activeDrawerParcel.ulpin) || 
                    (document.getElementById('drawer-ulpin-val') ? document.getElementById('drawer-ulpin-val').textContent.trim() : '');
        if (ulpin) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(ulpin).catch(function(){});
            }
            var toast = document.getElementById('toast-notification');
            if (toast) {
                toast.textContent = `📋 ULPIN copied to clipboard: ${ulpin}`;
                toast.style.display = 'block';
                setTimeout(() => { toast.style.display = 'none'; }, 3000);
            }
        }
    };

    window.copyDrawerCoords = function() {
        var coords = document.getElementById('drawer-coords-val') ? document.getElementById('drawer-coords-val').textContent.trim() : '';
        if (coords) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(coords).catch(function(){});
            }
            var toast = document.getElementById('toast-notification');
            if (toast) {
                toast.textContent = `📍 Geodetic coordinates copied: ${coords}`;
                toast.style.display = 'block';
                setTimeout(() => { toast.style.display = 'none'; }, 3000);
            }
        }
    };

    window.openRoRFromDrawer = function() {
        if (window.activeDrawerParcel && window.activeDrawerParcel.id) {
            window.openRoRCertificate(window.activeDrawerParcel.id);
        }
    };

    window.openTaxFromDrawer = function() {
        if (window.activeDrawerParcel && window.activeDrawerParcel.id) {
            window.openPropertyTaxModal(window.activeDrawerParcel.id);
        }
    };

    window.applyMutationFromDrawer = function() {
        if (window.activeDrawerParcel && window.activeDrawerParcel.id) {
            window.openCitizenMutationModal(window.activeDrawerParcel.id);
        }
    };

    window.runBhuAIFromDrawer = function() {
        window.switchDrawerTab('tab-risk');
        var toast = document.getElementById('toast-notification');
        if (toast) {
            var u = window.activeDrawerParcel ? window.activeDrawerParcel.ulpin : 'parcel';
            toast.textContent = `🛡️ Bhu-AI Multi-Source Risk Radar evaluated for ${u}.`;
            toast.style.display = 'block';
            setTimeout(() => { toast.style.display = 'none'; }, 3500);
        }
    };

    window.openSROFromDrawer = function() {
        if (window.activeDrawerParcel && window.activeDrawerParcel.id) {
            window.openSRODeedModal(window.activeDrawerParcel.id);
        }
    };

    window.subdivideFromDrawer = function() {
        if (window.activeDrawerParcel && window.activeDrawerParcel.id) {
            if (typeof window.initiateSubdivisionForParcel === 'function') {
                window.initiateSubdivisionForParcel(window.activeDrawerParcel.id);
            }
        }
    };

    window.droneIngestFromDrawer = function() {
        if (typeof window.openDroneDGPSModal === 'function') {
            window.openDroneDGPSModal();
        }
    };


    // ========== 4. MAP INITIALIZATION ==========
    var map = L.map('map', {
        center: [17.7830, 83.3810], // Centered directly on Sadarama Sadan & GITAM Rushikonda Campus
        zoom: 17,
        maxZoom: 22,
        layers: [satelliteHighRes, parcelDotsLayer, activePolygonLayer, splitPreviewLayer]
    });

    // Custom Map Pane for AP Cadastral Overlay
    map.createPane('cadastralPane');
    map.getPane('cadastralPane').style.zIndex = 250;
    map.getPane('cadastralPane').style.pointerEvents = 'none';

    // AP Cadastral MapServer layer (Native tiles up to zoom 17)
    var cadastralLayer = L.tileLayer('https://apsac.ap.gov.in/gisserver/rest/services/REVENUE/cadastral_ap_cache/MapServer/tile/{z}/{y}/{x}', {
        minZoom: 13,
        maxZoom: 22,
        maxNativeZoom: 17,
        pane: 'cadastralPane',
        attribution: '&copy; <a href="https://apsac.ap.gov.in/" target="_blank">APSAC</a> AP Revenue Department',
        opacity: 0.85
    });

    cadastralLayer.addTo(map);

    // 3-Tier Structured Layer Switcher
    var baseMaps = {
        "🛰️ Google Satellite (High-Res)": satelliteHighRes,
        "🌍 Esri World Imagery": esriSatellite,
        "🗺️ Streets View": streets,
        "⛰️ Topographic View": topo
    };

    var overlayMaps = {
        "🏛️ AP Cadastral Survey Map": cadastralLayer,
        "📍 Parcel Points (Available/Occupied/Disputed)": parcelDotsLayer,
        "📐 Active Parcel Boundary": activePolygonLayer,
        "🗺️ Master Plan 2041 Zoning (VMRDA)": masterPlanZoningLayer,
        "🛡️ Encumbrance & Bank Mortgage Liens": encumbranceLienLayer,
        "📋 Building Plan Permissions (GVMC)": buildingPermissionsLayer,
        "💰 Property Tax Assessment (GVMC)": propertyTaxationLayer,
        "💧 Water Supply Trunk Mains": utilityWaterLayer,
        "⚡ 33kV Power Distribution Grid": utilityPowerLayer,
        "🌊 Coastal Regulation Zone (CRZ Buffers)": crzRestrictionLayer,
    };

    L.control.layers(baseMaps, overlayMaps, {
        collapsed: true,
        position: 'topright'
    }).addTo(map);

    // ========== 5. LOAD DATA & RENDER DOTS ==========
    var bundledGeoJson = (typeof window !== 'undefined' && window.PARCELS_GEOJSON && window.PARCELS_GEOJSON.features) ? window.PARCELS_GEOJSON :
                         (typeof window !== 'undefined' && window.parent && window.parent.PARCELS_GEOJSON && window.parent.PARCELS_GEOJSON.features) ? window.parent.PARCELS_GEOJSON : null;
    var rawGeoJson = bundledGeoJson;
    var allParcels = (rawGeoJson && rawGeoJson.features) ? rawGeoJson.features.map(function(f) { return f.properties; }) : [];

    function renderParcelDots(filteredIds) {
        parcelDotsLayer.clearLayers();
        if (!rawGeoJson) return;

        var idSet = filteredIds && filteredIds.length >= 0 ? new Set(filteredIds) : null;

        rawGeoJson.features.forEach(function(feature) {
            var p = feature.properties;
            if (idSet && !idSet.has(p.id)) return;

            parcelFeatureMap[p.id] = feature;

            // Calculate center
            var coords = feature.geometry.coordinates[0];
            var clat = coords.reduce((acc, c) => acc + c[1], 0) / coords.length;
            var clng = coords.reduce((acc, c) => acc + c[0], 0) / coords.length;

            var status = (p.status || 'available').toLowerCase();
            var colors = statusColors[status] || { fill: '#3b82f6', stroke: '#1d4ed8' };
            var plotName = p.lot_number || p.parcel_id || `Parcel #${p.id}`;

            // Clean dot circle marker
            var dot = L.circleMarker([clat, clng], {
                radius: 6.5,
                fillColor: colors.fill,
                color: '#ffffff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.95
            });

            // Clean structured tooltip on hover showing genuine landmark name
            dot.bindTooltip(`
                <div style="font-family: Inter, sans-serif; min-width: 140px;">
                    <div style="font-weight: 700; font-size: 12px; color: #0f172a; margin-bottom: 2px;">${plotName}</div>
                    <div style="font-size: 10.5px; color: #1e40af; font-weight: 600; font-family: monospace;">${p.ulpin || p.parcel_id}</div>
                    <div style="font-size: 10px; color: #64748b; margin-top: 1px;">${p.property_type || 'Surveyed Parcel'} • <span style="text-transform: capitalize; color: ${colors.fill}; font-weight: 600;">${status}</span></div>
                </div>
            `, {
                direction: 'top',
                offset: [0, -8]
            });

            dot.on({
                mouseover: function() { this.setRadius(8.5); },
                mouseout: function() { this.setRadius(6.5); },
                click: function(e) {
                    if (activeDrawingTool === 'sro_select') {
                        L.DomEvent.stopPropagation(e);
                        window.cancelActiveTool();
                        window.openSRODeedModal(p.id);
                        return;
                    }
                    if (activeDrawingTool === 'subdivide_select') {
                        L.DomEvent.stopPropagation(e);
                        handleParcelSelectedForSplit(p, coords);
                        return;
                    }
                    if (activeDrawingTool === 'subdivide_cut') {
                        L.DomEvent.stopPropagation(e);
                        map.closePopup();
                        window.addSplitPoint(e.latlng);
                        return;
                    }
                    window.selectAndHighlightParcel(p.id, true);
                }
            });

            parcelDotsLayer.addLayer(dot);
        });
    }

    // ========== 3-TIER LAYER OVERLAY RENDERERS ==========
    // 1. Master Plan 2041 Zoning Layer
    function renderMasterPlanZoning() {
        masterPlanZoningLayer.clearLayers();
        if (!rawGeoJson) return;

        rawGeoJson.features.forEach(function(feature) {
            var p = feature.properties;
            var zoningInfo = zoningStyles[p.zoning_code] || zoningStyles['residential'];
            var coords = feature.geometry.coordinates[0].map(c => [c[1], c[0]]);

            var poly = L.polygon(coords, {
                fillColor: zoningInfo.fill,
                color: zoningInfo.stroke,
                weight: 2,
                opacity: 0.9,
                fillOpacity: 0.45
            });

            poly.bindTooltip(`
                <div style="font-family: Inter, sans-serif;">
                    <div style="font-weight: 800; color: ${zoningInfo.stroke}; font-size: 12px;"><i class="fas fa-drafting-compass"></i> ${zoningInfo.name}</div>
                    <div style="font-size: 11px; color: #0f172a; margin-top: 2px;"><strong>Permissible FAR:</strong> ${p.zoning_far || '1.75'}</div>
                    <div style="font-size: 11px; color: #64748b;"><strong>Max Height:</strong> ${p.building_height_limit || '15.0m'}</div>
                    <div style="font-size: 10px; color: #334155; margin-top: 2px;">${p.lot_number || p.parcel_id}</div>
                </div>
            `, { direction: 'top', offset: [0, -6] });

            poly.on('click', function() { window.selectAndHighlightParcel(p.id, true); });
            masterPlanZoningLayer.addLayer(poly);
        });
    }

    // 2. Encumbrance & Bank Mortgage Liens
    function renderEncumbranceLiens() {
        encumbranceLienLayer.clearLayers();
        if (!rawGeoJson) return;

        rawGeoJson.features.forEach(function(feature) {
            var p = feature.properties;
            var coords = feature.geometry.coordinates[0];
            var clat = coords.reduce((acc, c) => acc + c[1], 0) / coords.length;
            var clng = coords.reduce((acc, c) => acc + c[0], 0) / coords.length;

            var isMortgaged = (p.encumbrance_status === 'mortgaged');
            var isDisputed = (p.encumbrance_status === 'disputed');

            var encColor = isDisputed ? '#dc2626' : (isMortgaged ? '#f59e0b' : '#16a34a');
            var encLabel = isDisputed ? 'Court Injunction / Stay Order' : (isMortgaged ? `Bank Lien: ${p.encumbrance_bank}` : 'Clear Title (Nil Encumbrance)');

            var marker = L.circleMarker([clat, clng], {
                radius: isDisputed ? 9 : (isMortgaged ? 8 : 6),
                fillColor: encColor,
                color: '#ffffff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.95
            });

            marker.bindTooltip(`
                <div style="font-family: Inter, sans-serif;">
                    <div style="font-weight: 800; color: ${encColor}; font-size: 11.5px;"><i class="fas fa-shield-alt"></i> ${encLabel}</div>
                    <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Charge Amount: <strong>${p.encumbrance_amount || '₹ 0.00'}</strong></div>
                    <div style="font-size: 10px; color: #334155;">${p.lot_number || p.parcel_id}</div>
                </div>
            `, { direction: 'top', offset: [0, -6] });

            marker.on('click', function() { window.selectAndHighlightParcel(p.id, true); });
            encumbranceLienLayer.addLayer(marker);
        });
    }

    // 3. Municipal Building Plan Permissions (GVMC / VMRDA)
    function renderBuildingPermissions() {
        buildingPermissionsLayer.clearLayers();
        if (!rawGeoJson) return;

        rawGeoJson.features.forEach(function(feature) {
            var p = feature.properties;
            var coords = feature.geometry.coordinates[0].map(c => [c[1], c[0]]);

            var status = (p.building_approval_status || 'approved').toLowerCase();
            var isApp = (status === 'approved');
            var isPend = (status === 'pending');
            var bldColor = isApp ? '#16a34a' : (isPend ? '#eab308' : '#dc2626');
            var bldTitle = isApp ? 'GVMC Approved Plan (G+4)' : (isPend ? 'Under Plan Verification' : 'Municipal Deviation Notice');
            var permitNo = p.building_approval_no || `GVMC/BLD/2025/${10000 + p.id}`;
            var heightLimit = p.building_height_limit || '15.0 Meters (G+4)';

            var poly = L.polygon(coords, {
                fillColor: bldColor,
                color: bldColor,
                weight: 2.5,
                opacity: 1,
                fillOpacity: 0.35,
                dashArray: isApp ? null : '4 4'
            });

            poly.bindTooltip(`
                <div style="font-family: Inter, sans-serif; min-width: 175px;">
                    <div style="font-weight: 800; color: ${bldColor}; font-size: 11.5px;"><i class="fas fa-city"></i> ${bldTitle}</div>
                    <div style="font-size: 10.5px; color: #0f172a; margin-top: 2px;"><strong>Permit:</strong> <code>${permitNo}</code></div>
                    <div style="font-size: 10px; color: #475569;"><strong>Height Limit:</strong> ${heightLimit}</div>
                    <div style="font-size: 9.5px; color: ${isApp ? '#16a34a' : (isPend ? '#b45309' : '#dc2626')}; font-weight: 600; margin-top: 1px;">
                        ${isApp ? '✓ Setback & Fire NOC: Cleared' : (isPend ? '⏳ Pending Town Planning NOC' : '⚠ Section 217 Deviation Hold')}
                    </div>
                    <div style="font-size: 9px; color: #94a3b8; margin-top: 2px;">${p.lot_number || p.parcel_id}</div>
                </div>
            `, { direction: 'top', offset: [0, -6] });

            poly.on('click', function() { window.selectAndHighlightParcel(p.id, true); });
            buildingPermissionsLayer.addLayer(poly);
        });
    }

    // 4. Municipal Property Taxation (GVMC Assessment)
    function renderPropertyTaxation() {
        propertyTaxationLayer.clearLayers();
        if (!rawGeoJson) return;

        rawGeoJson.features.forEach(function(feature) {
            var p = feature.properties;
            var coords = feature.geometry.coordinates[0].map(c => [c[1], c[0]]);

            var sqft = Number(p.area_sqft || 2400);
            var curDemand = Number(p.tax_current_demand || Math.round(sqft * 7.5));
            var arrears = Number(p.tax_arrears_amount || 0);
            var payStatus = p.tax_payment_status || (p.tax_status === 'paid' ? 'Paid' : (arrears > 0 ? 'Partially Paid' : 'Due'));
            var assessNo = p.tax_assessment_no || ('GVMC-PT-' + (782000 + p.id));

            var isPaid = (payStatus === 'Paid' || p.tax_status === 'paid');
            var isDefaulter = (payStatus === 'Defaulter' || p.tax_status === 'defaulter' || arrears > 10000);
            var taxColor = isPaid ? '#10b981' : (isDefaulter ? '#ef4444' : '#f59e0b');
            var taxTitle = isPaid ? 'Tax Paid Up-to-Date' : (isDefaulter ? `Arrears Defaulter: ₹${arrears.toLocaleString('en-IN')}` : `Current Due: ₹${curDemand.toLocaleString('en-IN')}`);

            var poly = L.polygon(coords, {
                fillColor: taxColor,
                color: taxColor,
                weight: 2,
                opacity: 0.9,
                fillOpacity: 0.4
            });

            poly.bindTooltip(`
                <div style="font-family: Inter, sans-serif; min-width: 175px;">
                    <div style="font-weight: 800; color: ${taxColor}; font-size: 12px;"><i class="fas fa-receipt"></i> GVMC Property Tax (${payStatus})</div>
                    <div style="font-size: 10.5px; color: #0f172a; margin-top: 2px;"><strong>Assessment No:</strong> <code>${assessNo}</code></div>
                    <div style="font-size: 10px; color: #475569;"><strong>Owner/Assessee:</strong> ${p.owner_name || 'Assessee'}</div>
                    <div style="font-size: 9.5px; color: #64748b; margin-top: 2px;">Demand: <strong>₹${curDemand.toLocaleString('en-IN')}</strong> • Arrears: <strong style="color:${arrears > 0 ? '#b91c1c' : '#15803d'}">₹${arrears.toLocaleString('en-IN')}</strong></div>
                    <div style="font-size: 9px; color: #94a3b8; margin-top: 2px;">${p.lot_number || p.parcel_id}</div>
                </div>
            `, { direction: 'top', offset: [0, -6] });

            poly.on('click', function() { 
                window.openPropertyTaxModal(p.id); 
            });
            propertyTaxationLayer.addLayer(poly);
        });
    }

    // 5. Infrastructure: Water Supply Trunk Mains & 33kV Power Distribution Grid
    function renderUtilityNetworks() {
        utilityWaterLayer.clearLayers();
        utilityPowerLayer.clearLayers();

        // Load Real AP/GVMC Water Supply Infrastructure from static/watersupply.js
        if (typeof window.initWaterSupplyLayer === 'function') {
            var waterGroup = window.initWaterSupplyLayer(map);
            waterGroup.eachLayer(function(l) {
                utilityWaterLayer.addLayer(l);
            });
        }

        // Load Real APTRANSCO & APEPDCL Power Grid Infrastructure from static/powerGridTracks.js
        if (typeof window.initPowerGridLayer === 'function') {
            var powerGroup = window.initPowerGridLayer(map);
            powerGroup.eachLayer(function(l) {
                utilityPowerLayer.addLayer(l);
            });
        }
    }

    // 6. Coastal Regulation Zone (CRZ) Live WMS Layer (APSAC Gati Shakti Server)
    function renderCRZRestrictionBuffers() {
        crzRestrictionLayer.clearLayers();

        if (typeof window.initCRZLayer === 'function') {
            var crzWms = window.initCRZLayer(map);
            crzRestrictionLayer.addLayer(crzWms);
        }
    }

    function loadParcels(callback) {
        // Resilient immediate initialization from bundled dataset if available
        var bundled = (typeof window !== 'undefined' && window.PARCELS_GEOJSON && window.PARCELS_GEOJSON.features) ? window.PARCELS_GEOJSON :
                      (typeof window !== 'undefined' && window.parent && window.parent.PARCELS_GEOJSON && window.parent.PARCELS_GEOJSON.features) ? window.parent.PARCELS_GEOJSON : null;
        if (bundled && (!rawGeoJson || !rawGeoJson.features || rawGeoJson.features.length === 0)) {
            rawGeoJson = bundled;
            if (!allParcels || allParcels.length === 0) {
                allParcels = rawGeoJson.features.map(function(f) { return f.properties; });
            }
        }
        if (rawGeoJson && rawGeoJson.features && rawGeoJson.features.length > 0) {
            renderParcelDots();
            renderMasterPlanZoning();
            renderEncumbranceLiens();
            renderBuildingPermissions();
            renderPropertyTaxation();
            renderUtilityNetworks();
            renderCRZRestrictionBuffers();
            if (callback) callback();
        }

        fetch('/api/parcels/map_data/')
            .then(response => {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                var ct = response.headers.get('content-type') || '';
                if (!ct.includes('json')) throw new Error('Expected JSON, received: ' + ct);
                return response.json();
            })
            .then(data => {
                if (Array.isArray(data) && data.length > 0) {
                    allParcels = data;
                }
            })
            .catch(error => console.warn('Using local parcel array fallback:', error));

        fetch('/api/parcels/geojson/')
            .then(response => {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                var ct = response.headers.get('content-type') || '';
                if (!ct.includes('json')) throw new Error('Expected JSON, received: ' + ct);
                return response.json();
            })
            .then(geojsonData => {
                if (geojsonData && geojsonData.features && geojsonData.features.length > 0) {
                    rawGeoJson = geojsonData;
                    renderParcelDots();
                    renderMasterPlanZoning();
                    renderEncumbranceLiens();
                    renderBuildingPermissions();
                    renderPropertyTaxation();
                    renderUtilityNetworks();
                    renderCRZRestrictionBuffers();
                    if (callback) callback();
                }
            })
            .catch(error => {
                console.warn('API GeoJSON fetch fell back to verified bundled dataset:', error);
                var bundled = (typeof window !== 'undefined' && window.PARCELS_GEOJSON && window.PARCELS_GEOJSON.features) ? window.PARCELS_GEOJSON :
                              (typeof window !== 'undefined' && window.parent && window.parent.PARCELS_GEOJSON && window.parent.PARCELS_GEOJSON.features) ? window.parent.PARCELS_GEOJSON : null;
                if (bundled && (!rawGeoJson || !rawGeoJson.features || rawGeoJson.features.length === 0)) {
                    rawGeoJson = bundled;
                    if (!allParcels || allParcels.length === 0) {
                        allParcels = rawGeoJson.features.map(function(f) { return f.properties; });
                    }
                    renderParcelDots();
                    renderMasterPlanZoning();
                    renderEncumbranceLiens();
                    renderBuildingPermissions();
                    renderPropertyTaxation();
                    renderUtilityNetworks();
                    renderCRZRestrictionBuffers();
                    if (callback) callback();
                }
            });
    }

    // ========== 6. SEARCH & FILTER FUNCTIONALITY ==========
    var parcelSearch = document.getElementById('parcel-search');
    var citySearch = document.getElementById('city-search');
    var statusFilter = document.getElementById('status-filter');
    var searchBtn = document.getElementById('search-btn');
    var clearBtn = document.getElementById('clear-btn');
    var searchToggleBtn = document.getElementById('search-toggle-btn');
    var filtersPanel = document.getElementById('filters-panel');
    var searchResultsDropdown = document.getElementById('search-results');
    var resultsList = document.getElementById('results-list');

    var REGIONAL_PLACES = [
        {
            name: "Visakhapatnam (Vizag) City",
            subtitle: "Explore all surveyed parcels across Greater Visakhapatnam",
            aliases: ["visakhapatnam", "visakapatnam", "vizag", "vizak", "vishakhapatnam", "visakha", "vsp", "city"],
            center: [17.7300, 83.3150],
            zoom: 13,
            zone: ""
        },
        {
            name: "Maddilapalem & HB Colony",
            subtitle: "CMR Central Mall, Dr. V S Krishna College & Isukathota",
            aliases: ["maddilapalem", "madilapalem", "maddila palem", "hb colony", "isukathota", "bhanu nagar", "dr vs krishna", "cmr central"],
            center: [17.7340, 83.3250],
            zoom: 16,
            zone: "maddilapalem"
        },
        {
            name: "Rushikonda & IT SEZ (TCS / GITAM)",
            subtitle: "TCS Millennium Towers, Sadarama Sadan & GITAM Campus",
            aliases: ["rushikonda", "rusikonda", "gitam", "sadarama", "sadarama sadan", "endada", "fintech valley", "tcs", "tata", "millennium", "millennium towers"],
            center: [17.7880, 83.3810],
            zoom: 16,
            zone: "rushikonda"
        },
        {
            name: "MVP Colony",
            subtitle: "Sectors 1 to 4, Rythu Bazar & Housing Layouts",
            aliases: ["mvp", "mvp colony", "sector", "rythu bazar"],
            center: [17.7420, 83.3360],
            zoom: 16,
            zone: "mvp_colony"
        },
        {
            name: "Siripuram & AU Campus",
            subtitle: "VMRDA Complex, State Bank of India & AU Arts Block",
            aliases: ["siripuram", "siripura", "andhra university", "vmrda", "gurajada"],
            center: [17.7230, 83.3180],
            zoom: 16,
            zone: "siripuram"
        },
        {
            name: "Dwaraka Nagar & Diamond Park",
            subtitle: "Diamond Park Commercial Complex & 2nd/3rd Lane",
            aliases: ["dwaraka nagar", "dwarakanagar", "diamond park", "rtc complex"],
            center: [17.7280, 83.3050],
            zoom: 16,
            zone: "dwaraka_nagar"
        },
        {
            name: "Seethammadhara & HB Colony",
            subtitle: "HB Colony MIG/HIG Residential Houses",
            aliases: ["seethammadhara", "sithammadhara", "hb colony"],
            center: [17.7450, 83.3170],
            zoom: 16,
            zone: "seethammadhara"
        },
        {
            name: "Gajuwaka Industrial Corridor",
            subtitle: "BHPV Township & Main Road Complexes",
            aliases: ["gajuwaka", "bhpv", "steel plant"],
            center: [17.6880, 83.2150],
            zoom: 15,
            zone: "gajuwaka"
        },
        {
            name: "Madhurawada IT & Knowledge City",
            subtitle: "Midhilapuri VUDA Colony & Dr. YSR Cricket Stadium",
            aliases: ["madhurawada", "madhuravada", "midhilapuri", "cricket stadium"],
            center: [17.8050, 83.3520],
            zoom: 15,
            zone: "madhurawada"
        },
        {
            name: "Gambhiram & Anandapuram (IIM-V Campus)",
            subtitle: "241-Acre Permanent IIM Visakhapatnam Campus & Knowledge Hub",
            aliases: ["gambhiram", "iim", "iim-v", "iim visakhapatnam", "anandapuram", "gambheeram"],
            center: [17.8808, 83.3621],
            zoom: 16,
            zone: "gambhiram"
        },
        {
            name: "Sabbavaram (IIPE Energy Hub)",
            subtitle: "200-Acre Indian Institute of Petroleum & Energy Campus",
            aliases: ["sabbavaram", "iipe", "petroleum", "vangali"],
            center: [17.8306, 83.0855],
            zoom: 15,
            zone: "sabbavaram"
        }
    ];

    if (searchToggleBtn) {
        searchToggleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (filtersPanel.style.display === 'none') {
                filtersPanel.style.display = 'flex';
                searchToggleBtn.classList.add('active');
            } else {
                filtersPanel.style.display = 'none';
                searchToggleBtn.classList.remove('active');
            }
        });
    }

    var globalSearchTimeout = null;
    var currentSearchRequestId = 0;
    var lastSearchResults = { places: [], parcels: [], globalPlaces: [], isParcelIntent: false };

    function isParcelQuery(query) {
        if (!query) return false;
        var q = query.toLowerCase().trim();

        // 1. AP Bhunaksha ULPIN / Code patterns
        if (q.startsWith('79q') || q.startsWith('79q5') || q.startsWith('1b-') || q.startsWith('ap-') || q.startsWith('vsp-') || q.startsWith('ror-') || q.startsWith('tgp-') || q.startsWith('rsk-') || q.startsWith('mdl-') || q.startsWith('mvp-') || q.startsWith('srp-')) {
            return true;
        }

        // 2. Specific parcel / building / house keywords
        var parcelKeywords = [
            'plot', 'house', 'sy', 'survey', 'd.no', 'door', 'flat', 'villa', 'building',
            'h-', 'mig', 'hig', 'sector', 'complex', 'resident', 'residential', 'commercial',
            'owner', 'sadan', 'stadium', 'college', 'tower', 'bazaar', 'branch'
        ];
        if (parcelKeywords.some(kw => q.includes(kw))) {
            return true;
        }

        // 3. Numbers / survey fractions (e.g. "101", "12/1", "45")
        if (/^\d+/.test(q) || /\/\d+/.test(q)) {
            return true;
        }

        return false;
    }

    function fetchWorldwideLocations(query, requestId) {
        if (!query || query.length < 3) return;

        var nominatimUrl = 'https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query) + '&limit=5&addressdetails=1';

        fetch(nominatimUrl, {
            headers: {
                'Accept': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (requestId !== currentSearchRequestId) return; // Stale request guard
            
            var globalResults = (data || []).map(item => {
                var addr = item.address || {};
                var cityName = addr.city || addr.town || addr.village || addr.municipality || addr.county || item.name || item.display_name.split(',')[0];
                var stateName = addr.state || addr.region || '';
                var countryName = addr.country || '';
                var subtitle = [stateName, countryName].filter(Boolean).join(', ') || item.display_name;

                return {
                    name: cityName,
                    displayName: item.display_name,
                    subtitle: subtitle,
                    lat: parseFloat(item.lat),
                    lon: parseFloat(item.lon),
                    type: item.type || 'City'
                };
            });

            lastSearchResults.globalPlaces = globalResults;
            renderAllSearchResults();
        })
        .catch(err => {
            console.log('Worldwide geocoding notice:', err);
        });
    }

    function renderAllSearchResults() {
        var places = lastSearchResults.places || [];
        var parcels = lastSearchResults.parcels || [];
        var globalPlaces = lastSearchResults.globalPlaces || [];
        var isParcelIntent = lastSearchResults.isParcelIntent;

        if (places.length === 0 && parcels.length === 0 && globalPlaces.length === 0) {
            searchResultsDropdown.style.display = 'none';
            return;
        }

        resultsList.innerHTML = '';

        function renderPlacesSection() {
            if (places.length === 0) return;
            var plHdr = document.createElement('div');
            plHdr.className = 'results-section-header';
            plHdr.innerHTML = '<i class="fas fa-map-pin"></i> Visakhapatnam Localities';
            resultsList.appendChild(plHdr);

            places.forEach(place => {
                var placeItem = document.createElement('div');
                placeItem.className = 'result-place-item';
                placeItem.innerHTML = `
                    <div class="result-place-icon"><i class="fas fa-map-marked-alt"></i></div>
                    <div style="flex: 1;">
                        <div style="font-weight: 700; color: #1e40af; font-size: 13.5px;">📍 ${place.name}</div>
                        <div style="font-size: 11.5px; color: #64748b;">${place.subtitle}</div>
                    </div>
                    <i class="fas fa-chevron-right" style="color: #94a3b8; font-size: 11px;"></i>
                `;

                placeItem.addEventListener('click', function(e) {
                    e.stopPropagation();
                    map.flyTo(place.center, place.zoom, { duration: 1.2 });
                    if (place.zone && citySearch) {
                        citySearch.value = place.zone;
                    }
                    searchResultsDropdown.style.display = 'none';
                    if (filtersPanel) filtersPanel.style.display = 'none';
                });

                resultsList.appendChild(placeItem);
            });
        }

        function renderGlobalSection() {
            if (globalPlaces.length === 0) return;
            var hdr = document.createElement('div');
            hdr.className = 'results-section-header global-section-hdr';
            hdr.innerHTML = '<i class="fas fa-globe-americas"></i> Worldwide Cities & Places';
            resultsList.appendChild(hdr);

            globalPlaces.forEach(place => {
                var placeItem = document.createElement('div');
                placeItem.className = 'result-global-item';
                placeItem.innerHTML = `
                    <div class="result-global-icon"><i class="fas fa-globe-asia"></i></div>
                    <div style="flex: 1; overflow: hidden;">
                        <div style="font-weight: 700; color: #0f172a; font-size: 13.5px;">${place.name}</div>
                        <div style="font-size: 11.5px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${place.displayName}">${place.subtitle}</div>
                    </div>
                    <span style="font-size: 10px; font-weight: 700; color: #059669; background: #dcfce7; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">${place.type}</span>
                `;

                placeItem.addEventListener('click', function(e) {
                    e.stopPropagation();
                    map.flyTo([place.lat, place.lon], 13, { duration: 1.8 });
                    searchResultsDropdown.style.display = 'none';
                    if (filtersPanel) filtersPanel.style.display = 'none';
                });

                resultsList.appendChild(placeItem);
            });
        }

        function renderParcelsSection() {
            if (parcels.length === 0) return;
            var pcHdr = document.createElement('div');
            pcHdr.className = 'results-section-header';
            pcHdr.innerHTML = '<i class="fas fa-vector-square"></i> Cadastral & Surveyed Parcels';
            resultsList.appendChild(pcHdr);

            parcels.slice(0, 25).forEach(parcel => {
                var resultItem = document.createElement('div');
                resultItem.className = 'result-item';
                var zoneFormatted = formatZoneName(parcel.zone);
                var dimTag = parcel.dimensions ? ` • ${parcel.dimensions}` : '';
                var ulpinTag = parcel.ulpin ? `<span style="font-family:monospace; color:#1e40af; font-weight:700;">${parcel.ulpin}</span>` : parcel.parcel_id;
                
                resultItem.innerHTML = `
                    <div class="result-item-title">${parcel.lot_number || parcel.parcel_id} <span style="font-size:11px; font-weight:normal; color:#64748b;">(${zoneFormatted})</span></div>
                    <div style="font-size:11px; margin-bottom:2px;">${ulpinTag}</div>
                    <div class="result-item-text">${parcel.address}</div>
                    <div class="result-item-text"><strong>${parcel.property_type || 'Residential'}</strong>${dimTag}</div>
                    <span class="result-item-status status-${parcel.status}">${parcel.status.toUpperCase()}</span>
                `;
                
                resultItem.addEventListener('click', function(e) {
                    e.stopPropagation();
                    window.selectAndHighlightParcel(parcel.id, true);
                    searchResultsDropdown.style.display = 'none';
                    if (filtersPanel) filtersPanel.style.display = 'none';
                });

                resultsList.appendChild(resultItem);
            });
        }

        // Dynamic ordering based on user intent:
        if (isParcelIntent) {
            // User searched for a parcel/house/ULPIN -> Parcels on TOP!
            renderParcelsSection();
            renderPlacesSection();
            renderGlobalSection();
        } else {
            // User searched for a city/locality -> Cities on TOP!
            renderGlobalSection();
            renderPlacesSection();
            renderParcelsSection();
        }

        searchResultsDropdown.style.display = 'block';
    }

    function performSearch() {
        var rawQuery = parcelSearch.value.toLowerCase().trim();
        var zoneQuery = citySearch.value.toLowerCase().trim();
        var statusQuery = statusFilter.value.toLowerCase().trim();

        currentSearchRequestId++;
        var reqId = currentSearchRequestId;
        var intentIsParcel = isParcelQuery(rawQuery);

        // 1. Check for matching regional places
        var matchedPlaces = [];
        if (rawQuery.length >= 2) {
            matchedPlaces = REGIONAL_PLACES.filter(place => {
                return place.name.toLowerCase().includes(rawQuery) ||
                       place.aliases.some(alias => alias.includes(rawQuery) || rawQuery.includes(alias));
            });
        }

        // 2. Filter individual parcels
        var filteredParcels = allParcels.filter(parcel => {
            var ulpin = (parcel.ulpin || '').toLowerCase();
            var parcelId = (parcel.parcel_id || '').toLowerCase();
            var lotName = (parcel.lot_number || '').toLowerCase();
            var surveyNo = (parcel.survey_number || '').toLowerCase();
            var address = (parcel.address || '').toLowerCase();
            var zone = (parcel.zone || '').toLowerCase();

            var matchesParcel = rawQuery === '' || 
                parcelId.includes(rawQuery) ||
                ulpin.includes(rawQuery) ||
                surveyNo.includes(rawQuery) ||
                lotName.includes(rawQuery) ||
                address.includes(rawQuery) ||
                (rawQuery.includes('visak') && address.includes('visakhapatnam')) ||
                (rawQuery.includes('vizag') && address.includes('visakhapatnam'));
            
            var matchesZone = zoneQuery === '' || 
                (parcel.zone && parcel.zone.toLowerCase() === zoneQuery) ||
                address.includes(zoneQuery);
            
            var matchesStatus = statusQuery === '' || 
                parcel.status.toLowerCase() === statusQuery;

            return matchesParcel && matchesZone && matchesStatus;
        });

        lastSearchResults = {
            places: matchedPlaces,
            parcels: filteredParcels,
            globalPlaces: [],
            isParcelIntent: intentIsParcel
        };

        renderAllSearchResults();
        renderParcelDots(filteredParcels.map(p => p.id));

        // 3. Debounced Worldwide Geocoding for any city in the world
        clearTimeout(globalSearchTimeout);
        if (rawQuery.length >= 3) {
            globalSearchTimeout = setTimeout(function() {
                fetchWorldwideLocations(rawQuery, reqId);
            }, 200);
        }
    }

    if (searchBtn) searchBtn.addEventListener('click', function(e) { e.preventDefault(); performSearch(); });
    if (citySearch) citySearch.addEventListener('change', performSearch);
    if (statusFilter) statusFilter.addEventListener('change', performSearch);

    if (clearBtn) {
        clearBtn.addEventListener('click', function(e) {
            e.preventDefault();
            parcelSearch.value = '';
            citySearch.value = '';
            statusFilter.value = '';
            searchResultsDropdown.style.display = 'none';
            loadParcels();
        });
    }

    if (parcelSearch) {
        parcelSearch.value = '';
        parcelSearch.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                performSearch();
            }
        });
        
        parcelSearch.addEventListener('input', function() {
            if (this.value.length > 0) {
                performSearch();
            } else {
                searchResultsDropdown.style.display = 'none';
                renderParcelDots();
            }
        });

        parcelSearch.addEventListener('focus', function() {
            if (this.value.trim().length > 0) {
                performSearch();
            }
        });

        // Defeat aggressive Chrome / Edge autofill manager
        function defeatBrowserAutofill() {
            if (parcelSearch && parcelSearch.value && !parcelSearch.matches(':focus')) {
                parcelSearch.value = '';
            }
        }
        setTimeout(defeatBrowserAutofill, 50);
        setTimeout(defeatBrowserAutofill, 150);
        setTimeout(defeatBrowserAutofill, 350);
        setTimeout(defeatBrowserAutofill, 700);
        window.addEventListener('load', defeatBrowserAutofill);
    }

    // ========== AUTO-CLOSE SEARCH WHEN CLICKING ANYWHERE ON MAP ==========
    map.on('click', function() {
        if (searchResultsDropdown) searchResultsDropdown.style.display = 'none';
        if (filtersPanel) filtersPanel.style.display = 'none';
        if (searchToggleBtn) searchToggleBtn.classList.remove('active');
    });

    map.on('movestart', function() {
        if (searchResultsDropdown) searchResultsDropdown.style.display = 'none';
        if (filtersPanel) filtersPanel.style.display = 'none';
        if (searchToggleBtn) searchToggleBtn.classList.remove('active');
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.search-container')) {
            if (searchResultsDropdown) searchResultsDropdown.style.display = 'none';
            if (filtersPanel) filtersPanel.style.display = 'none';
            if (searchToggleBtn) searchToggleBtn.classList.remove('active');
        }
    });

    // ========== 7. OFFICIAL ROR EXTRACT DOCUMENT ==========
    window.openRoRCertificate = function(parcelId) {
        if (!parcelId) return;
        window.open(`/ror/${parcelId}/`, '_blank');
    };

    // ========== 8. OFFICER INTERACTIVE SPATIAL TOOLS (OPTION 3) ==========
    window.toggleOfficerToolbar = function(forceState) {
        var toolbar = document.getElementById('officer-toolbar');
        var chevron = document.getElementById('officer-tool-chevron');
        var btn = document.getElementById('btn-toggle-officer-tools');
        if (!toolbar) return;

        var isVisible = (toolbar.style.display !== 'none' && toolbar.style.display !== '');
        var shouldShow = (typeof forceState === 'boolean') ? forceState : !isVisible;

        if (shouldShow) {
            toolbar.style.display = 'flex';
            if (chevron) {
                chevron.classList.remove('fa-chevron-down');
                chevron.classList.add('fa-chevron-up');
            }
            if (btn) btn.classList.add('active');
        } else {
            toolbar.style.display = 'none';
            if (chevron) {
                chevron.classList.remove('fa-chevron-up');
                chevron.classList.add('fa-chevron-down');
            }
            if (btn) btn.classList.remove('active');
        }
    };

    var btnSroTool = document.getElementById('btn-sro-tool');
    var btnDrawParcel = document.getElementById('btn-draw-parcel');
    var btnSubdivideTool = document.getElementById('btn-subdivide-tool');
    var btnCancelTool = document.getElementById('btn-cancel-tool');
    var toolHint = document.getElementById('tool-instruction-hint');
    var drawnTempCoords = [];
    var drawPreviewLine = null;
    var drawPreviewPolygon = null;
    var splitPreviewLine = null;

    function setToolHint(msg, isHtml) {
        if (msg) {
            if (isHtml) {
                toolHint.innerHTML = msg;
            } else {
                toolHint.textContent = msg;
            }
            toolHint.style.display = 'block';
            btnCancelTool.style.display = 'inline-flex';
        } else {
            toolHint.style.display = 'none';
            btnCancelTool.style.display = 'none';
        }
    }

    window.cancelActiveTool = function() {
        activeDrawingTool = null;
        drawPoints = [];
        window.resetSubdividePoints();
        selectedParcelForSplit = null;

        if (drawPreviewLine) { map.removeLayer(drawPreviewLine); drawPreviewLine = null; }
        if (drawPreviewPolygon) { map.removeLayer(drawPreviewPolygon); drawPreviewPolygon = null; }

        if (btnSroTool) btnSroTool.classList.remove('active');
        if (btnDrawParcel) btnDrawParcel.classList.remove('active');
        if (btnSubdivideTool) btnSubdivideTool.classList.remove('active');
        setToolHint(null);
        map.getContainer().style.cursor = '';
    };

    if (btnCancelTool) btnCancelTool.addEventListener('click', window.cancelActiveTool);

    // --- TOOL SRO: SIMULATE SRO SALE DEED REGISTRATION ---
    if (btnSroTool) {
        btnSroTool.addEventListener('click', function() {
            if (activeDrawingTool === 'sro_select') {
                window.cancelActiveTool();
                return;
            }
            window.cancelActiveTool();
            activeDrawingTool = 'sro_select';
            this.classList.add('active');
            map.getContainer().style.cursor = 'pointer';
            setToolHint("Click on any parcel on the map to register an SRO Sale Deed & mutate title.");
        });
    }

    // --- TOOL A: DRAW NEW PARCEL ---
    if (btnDrawParcel) {
        btnDrawParcel.addEventListener('click', function() {
            if (activeDrawingTool === 'draw_polygon') {
                window.cancelActiveTool();
                return;
            }
            window.cancelActiveTool();
            activeDrawingTool = 'draw_polygon';
            this.classList.add('active');
            map.getContainer().style.cursor = 'crosshair';
            setToolHint("Click on the map to place vertices (at least 3). Double click to finish.");
        });
    }

    map.on('click', function(e) {
        if (activeDrawingTool === 'draw_polygon') {
            var pt = [e.latlng.lng, e.latlng.lat];
            drawPoints.push(pt);

            if (drawPreviewLine) map.removeLayer(drawPreviewLine);
            if (drawPreviewPolygon) map.removeLayer(drawPreviewPolygon);

            var latlngs = drawPoints.map(p => [p[1], p[0]]);

            if (drawPoints.length >= 3) {
                drawPreviewPolygon = L.polygon(latlngs, { color: '#1d4ed8', weight: 2.5, fillColor: '#3b82f6', fillOpacity: 0.35 }).addTo(map);
            } else {
                drawPreviewLine = L.polyline(latlngs, { color: '#1d4ed8', weight: 2.5, dashArray: '5,5' }).addTo(map);
            }
        } else if (activeDrawingTool === 'subdivide_cut') {
            window.addSplitPoint(e.latlng);
        }
    });

    map.on('dblclick', function(e) {
        if (activeDrawingTool === 'draw_polygon' && drawPoints.length >= 3) {
            L.DomEvent.stopPropagation(e);
            finishDrawingNewParcel();
        } else if (activeDrawingTool === 'subdivide_cut' && splitLinePoints.length >= 2) {
            L.DomEvent.stopPropagation(e);
            window.executePolygonSplit();
        }
    });

    function calculateShoelaceArea(coords) {
        var latMid = coords.reduce((acc, c) => acc + c[1], 0) / coords.length;
        var mLng = 111132.95 * Math.cos(latMid * Math.PI / 180.0);
        var mLat = 111132.95;
        var areaM2 = 0;
        for (var i = 0; i < coords.length; i++) {
            var j = (i + 1) % coords.length;
            var x1 = coords[i][0] * mLng; var y1 = coords[i][1] * mLat;
            var x2 = coords[j][0] * mLng; var y2 = coords[j][1] * mLat;
            areaM2 += (x1 * y2) - (x2 * y1);
        }
        return Math.abs(areaM2) / 2.0 * 10.7639;
    }

    function finishDrawingNewParcel() {
        var closedCoords = [...drawPoints];
        if (closedCoords[0][0] !== closedCoords[closedCoords.length-1][0] || closedCoords[0][1] !== closedCoords[closedCoords.length-1][1]) {
            closedCoords.push(closedCoords[0]);
        }
        drawnTempCoords = closedCoords;
        var areaSqft = calculateShoelaceArea(closedCoords);
        
        document.getElementById('new-area-display').value = `${areaSqft.toLocaleString('en-IN', {maximumFractionDigits:0})} sqft`;
        window.openModal('modal-new-parcel');
        window.cancelActiveTool();
    }

    var formNewParcel = document.getElementById('form-new-parcel');
    if (formNewParcel) {
        formNewParcel.addEventListener('submit', function(e) {
            e.preventDefault();
            if (drawnTempCoords.length < 3) return;

            var surveyNo = document.getElementById('new-survey-no').value;
            var lotNo = document.getElementById('new-lot-no').value;
            var zone = document.getElementById('new-zone').value;
            var propType = document.getElementById('new-property-type').value;
            var owner = document.getElementById('new-owner-name').value || 'Registered Citizen';
            var address = document.getElementById('new-address').value;
            var status = document.getElementById('new-status').value;
            var area = parseFloat(document.getElementById('new-area-display').value.replace(/[^0-9.]/g, '')) || 2400;

            var clat = drawnTempCoords.reduce((acc, c) => acc + c[1], 0) / drawnTempCoords.length;
            var clng = drawnTempCoords.reduce((acc, c) => acc + c[0], 0) / drawnTempCoords.length;
            var randomId = Math.floor(100 + Math.random() * 900);
            var parcelId = `VSP-${zone.toUpperCase().slice(0,3)}-${randomId}`;

            var newParcelPayload = {
                parcel_id: parcelId,
                ulpin: `AP-VSP-${zone.toUpperCase().slice(0,3)}-${randomId}001`,
                ror_number: `ROR-2026-VSP-${randomId}`,
                market_value: area * 4500,
                zone: zone,
                address: address,
                owner_name: owner,
                area_sqft: area,
                latitude: clat,
                longitude: clng,
                property_type: propType,
                status: status,
                survey_number: surveyNo,
                lot_number: lotNo,
                dimensions: `${area.toFixed(0)} sqft`,
                boundary: drawnTempCoords,
                description: `Surveyed parcel drawn by officer.`
            };

            fetch('/api/parcels/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newParcelPayload)
            })
            .then(res => res.json())
            .then(data => {
                window.closeModal('modal-new-parcel');
                formNewParcel.reset();
                loadParcels(function() {
                    alert(`✅ Parcel ${parcelId} successfully registered with ULPIN: ${data.ulpin || newParcelPayload.ulpin}`);
                });
            })
            .catch(err => alert('Error saving parcel: ' + err));
        });
    }

    // --- TOOL B: INTERACTIVE SUBDIVISION (SPLIT) TOOL ---
    if (btnSubdivideTool) {
        btnSubdivideTool.addEventListener('click', function() {
            if (activeDrawingTool === 'subdivide_select') {
                window.cancelActiveTool();
                return;
            }
            window.cancelActiveTool();
            activeDrawingTool = 'subdivide_select';
            this.classList.add('active');
            map.getContainer().style.cursor = 'pointer';
            setToolHint("Click on the parcel plot you wish to subdivide.");
        });
    }

    window.initiateSubdivisionForParcel = function(parcelId) {
        if (!isOfficerTabAuthenticated()) {
            window.openModal('modal-officer-auth');
            return;
        }
        var feature = rawGeoJson.features.find(f => f.properties.id === parcelId);
        if (!feature) return;
        handleParcelSelectedForSplit(feature.properties, feature.geometry.coordinates[0]);
    };

    // ==========================================
    // MODULE D: TURF.JS POTHISSING POLYGON BISECTION & SPATIAL SURVEY
    // ==========================================
    window.activeMutationTaskForSubdivide = null;
    var subPolyA = null;
    var subPolyB = null;
    var subAreaA = 0;
    var subAreaB = 0;
    var splitLineMarkers = [];
    var splitLinePolyline = null;

    /**
     * Splits a parcel polygon with Turf.js using ray-extension and polygonizer.
     * Supports 2 or more multi-point cut vertices.
     */
    function splitPolygonWithTurf(coords, cutPoints) {
        if (!coords || coords.length < 3 || !cutPoints || cutPoints.length < 2) {
            return null;
        }

        // Ensure closed ring for input coordinates
        var ring = coords.slice();
        if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
            ring.push([ring[0][0], ring[0][1]]);
        }

        var pFirst = cutPoints[0];
        var pLast = cutPoints[cutPoints.length - 1];

        if (typeof turf === 'undefined') {
            console.warn("Turf.js not loaded, using fallback split");
            return fallbackSplitPolygon(ring, pFirst, pLast);
        }

        try {
            var polyFeature = turf.polygon([ring]);
            var bbox = turf.bbox(polyFeature); // [minLng, minLat, maxLng, maxLat]
            var pMin = turf.point([bbox[0], bbox[1]]);
            var pMax = turf.point([bbox[2], bbox[3]]);
            var diagKm = turf.distance(pMin, pMax, { units: 'kilometers' });
            var extendKm = Math.max(0.08, diagKm * 2.5);

            var pt0 = turf.point(cutPoints[0]);
            var pt1 = turf.point(cutPoints[1]);
            var bearingStart = turf.bearing(pt1, pt0);
            var extStart = turf.destination(pt0, extendKm, bearingStart, { units: 'kilometers' });

            var ptEnd = turf.point(cutPoints[cutPoints.length - 1]);
            var ptPrev = turf.point(cutPoints[cutPoints.length - 2]);
            var bearingEnd = turf.bearing(ptPrev, ptEnd);
            var extEnd = turf.destination(ptEnd, extendKm, bearingEnd, { units: 'kilometers' });

            var bladeCoords = [extStart.geometry.coordinates];
            for (var i = 0; i < cutPoints.length; i++) {
                bladeCoords.push(cutPoints[i]);
            }
            bladeCoords.push(extEnd.geometry.coordinates);

            var blade = turf.lineString(bladeCoords);

            // Convert polygon perimeter to line string
            var perimeter = turf.polygonToLine(polyFeature);

            // Split perimeter with the blade line
            var splitPerim = turf.lineSplit(perimeter, blade);

            // Split blade with the perimeter
            var splitBlade = turf.lineSplit(blade, perimeter);

            var segments = [];
            if (splitPerim && splitPerim.features && splitPerim.features.length > 0) {
                splitPerim.features.forEach(function(f) { segments.push(f); });
            }

            if (splitBlade && splitBlade.features && splitBlade.features.length > 0) {
                splitBlade.features.forEach(function(f) {
                    var c = f.geometry.coordinates;
                    if (c.length >= 2) {
                        var mid = turf.midpoint(turf.point(c[0]), turf.point(c[c.length - 1]));
                        if (turf.booleanPointInPolygon(mid, polyFeature)) {
                            segments.push(f);
                        }
                    }
                });
            }

            if (segments.length >= 3) {
                var fc = turf.featureCollection(segments);
                var polygonized = turf.polygonize(fc);

                if (polygonized && polygonized.features && polygonized.features.length >= 2) {
                    var polyA = polygonized.features[0].geometry.coordinates[0];
                    var polyB = polygonized.features[1].geometry.coordinates[0];

                    var areaA_sqm = turf.area(turf.polygon([polyA]));
                    var areaB_sqm = turf.area(turf.polygon([polyB]));
                    var areaA_sqft = Math.round(areaA_sqm * 10.7639 * 10) / 10;
                    var areaB_sqft = Math.round(areaB_sqm * 10.7639 * 10) / 10;
                    var totalSqft = areaA_sqft + areaB_sqft;

                    return {
                        polyA: polyA,
                        polyB: polyB,
                        areaA_sqft: areaA_sqft,
                        areaA_sqyds: Math.round(areaA_sqft / 9.0 * 10) / 10,
                        areaA_cents: Math.round(areaA_sqft / 435.6 * 100) / 100,
                        areaB_sqft: areaB_sqft,
                        areaB_sqyds: Math.round(areaB_sqft / 9.0 * 10) / 10,
                        areaB_cents: Math.round(areaB_sqft / 435.6 * 100) / 100,
                        pctA: totalSqft > 0 ? Math.round((areaA_sqft / totalSqft) * 1000) / 10 : 50.0,
                        pctB: totalSqft > 0 ? Math.round((areaB_sqft / totalSqft) * 1000) / 10 : 50.0
                    };
                }
            }

            // Fallback if polygonize doesn't return 2 polygons
            return fallbackSplitPolygon(ring, pFirst, pLast);
        } catch (err) {
            console.warn("Turf split error, falling back to vector bisection:", err);
            return fallbackSplitPolygon(ring, pFirst, pLast);
        }
    }

    /**
     * Fallback polygon splitting using half-plane vector geometry
     */
    function fallbackSplitPolygon(ring, p1, p2) {
        var dx = p2[0] - p1[0];
        var dy = p2[1] - p1[1];
        if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
            dx = 0.0001; dy = 0.0001;
        }

        var polyA = [];
        var polyB = [];

        function side(pt) {
            return (pt[0] - p1[0]) * dy - (pt[1] - p1[1]) * dx;
        }

        function lineIntersect(a, b) {
            var aSide = side(a);
            var bSide = side(b);
            if (Math.abs(aSide - bSide) < 1e-12) return a;
            var t = aSide / (aSide - bSide);
            return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
        }

        for (var i = 0; i < ring.length - 1; i++) {
            var curr = ring[i];
            var next = ring[i + 1];
            var sCurr = side(curr);
            var sNext = side(next);

            if (sCurr >= 0) polyA.push(curr);
            if (sCurr <= 0) polyB.push(curr);

            if ((sCurr > 0 && sNext < 0) || (sCurr < 0 && sNext > 0)) {
                var inter = lineIntersect(curr, next);
                polyA.push(inter);
                polyB.push(inter);
            }
        }

        if (polyA.length < 3 || polyB.length < 3) {
            var lats = ring.map(c => c[1]);
            var lngs = ring.map(c => c[0]);
            var minLat = Math.min(...lats); var maxLat = Math.max(...lats);
            var minLng = Math.min(...lngs); var maxLng = Math.max(...lngs);
            var midLng = (minLng + maxLng) / 2.0;

            polyA = [[minLng, minLat], [midLng, minLat], [midLng, maxLat], [minLng, maxLat], [minLng, minLat]];
            polyB = [[midLng, minLat], [maxLng, minLat], [maxLng, maxLat], [midLng, maxLat], [midLng, minLat]];
        } else {
            if (polyA[0][0] !== polyA[polyA.length - 1][0] || polyA[0][1] !== polyA[polyA.length - 1][1]) polyA.push([polyA[0][0], polyA[0][1]]);
            if (polyB[0][0] !== polyB[polyB.length - 1][0] || polyB[0][1] !== polyB[polyB.length - 1][1]) polyB.push([polyB[0][0], polyB[0][1]]);
        }

        var areaA_sqft = Math.round(calculateShoelaceArea(polyA) * 10) / 10;
        var areaB_sqft = Math.round(calculateShoelaceArea(polyB) * 10) / 10;
        var total = areaA_sqft + areaB_sqft;

        return {
            polyA: polyA,
            polyB: polyB,
            areaA_sqft: areaA_sqft,
            areaA_sqyds: Math.round(areaA_sqft / 9.0 * 10) / 10,
            areaA_cents: Math.round(areaA_sqft / 435.6 * 100) / 100,
            areaB_sqft: areaB_sqft,
            areaB_sqyds: Math.round(areaB_sqft / 9.0 * 10) / 10,
            areaB_cents: Math.round(areaB_sqft / 435.6 * 100) / 100,
            pctA: total > 0 ? Math.round((areaA_sqft / total) * 1000) / 10 : 50.0,
            pctB: total > 0 ? Math.round((areaB_sqft / total) * 1000) / 10 : 50.0
        };
    }

    function handleParcelSelectedForSplit(props, coords) {
        window.resetSubdividePoints();
        selectedParcelForSplit = { props: props, coords: coords };
        activeDrawingTool = 'subdivide_cut';
        map.getContainer().style.cursor = 'crosshair';
        map.closePopup();
        updateSplitInstructionBanner();
    }

    window.addSplitPoint = function(latlng) {
        if (!selectedParcelForSplit) return;
        var pt = [latlng.lng, latlng.lat];
        splitLinePoints.push(pt);
        var idx = splitLinePoints.length - 1;
        var marker = createSplitMarker(latlng, idx);
        marker.addTo(map);
        splitLineMarkers.push(marker);
        updateSplitPreviewGraphics();
        updateSplitInstructionBanner();
    };

    window.removeSplitPoint = function(index) {
        if (typeof index === 'number' && index >= 0 && index < splitLinePoints.length) {
            splitLinePoints.splice(index, 1);
            rebuildSplitMarkers();
            updateSplitPreviewGraphics();
            updateSplitInstructionBanner();
        }
    };

    window.removeLastSplitPoint = function() {
        if (splitLinePoints.length > 0) {
            window.removeSplitPoint(splitLinePoints.length - 1);
        }
    };

    function rebuildSplitMarkers() {
        if (splitLineMarkers && splitLineMarkers.length > 0) {
            splitLineMarkers.forEach(m => map.removeLayer(m));
            splitLineMarkers = [];
        }
        splitLinePoints.forEach(function(pt, idx) {
            var latlng = L.latLng(pt[1], pt[0]);
            var marker = createSplitMarker(latlng, idx);
            marker.addTo(map);
            splitLineMarkers.push(marker);
        });
    }

    function createSplitMarker(latlng, index) {
        var customIcon = L.divIcon({
            className: 'subdivide-cut-pin-icon',
            html: `
                <div style="position:relative; width:28px; height:28px; cursor:move;" title="Drag to adjust • Click × or right-click to remove">
                    <div style="background:#ef4444; color:#ffffff; font-weight:800; font-size:11px; width:28px; height:28px; border-radius:50%; border:2px solid #ffffff; box-shadow:0 3px 10px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; font-family:system-ui,-apple-system,sans-serif;">P${index+1}</div>
                    <div onclick="L.DomEvent.stopPropagation(event); window.removeSplitPoint(${index});" 
                         title="Remove Point P${index+1}"
                         style="position:absolute; top:-6px; right:-6px; background:#0f172a; color:#ffffff; width:17px; height:17px; border-radius:50%; border:1.5px solid #ffffff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:900; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,0.5); line-height:1; transition:transform 0.15s ease;"
                         onmouseover="this.style.background='#dc2626'; this.style.transform='scale(1.25)';"
                         onmouseout="this.style.background='#0f172a'; this.style.transform='scale(1)';">&times;</div>
                </div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });
        var marker = L.marker(latlng, { draggable: true, icon: customIcon });
        marker.on('drag', function(e) {
            splitLinePoints[index] = [e.latlng.lng, e.latlng.lat];
            updateSplitPreviewGraphics();
        });
        marker.on('dragend', function(e) {
            splitLinePoints[index] = [e.latlng.lng, e.latlng.lat];
            updateSplitPreviewGraphics();
            updateSplitInstructionBanner();
        });
        marker.on('contextmenu', function(e) {
            L.DomEvent.stopPropagation(e);
            window.removeSplitPoint(index);
        });
        marker.bindTooltip(`<b>Cut Point P${index+1}</b><br><span style="color:#ef4444; font-size:10px;">Drag to adjust &bull; Click &times; or right-click to delete</span>`, { direction: 'top', offset: [0, -12] });
        return marker;
    }

    function updateSplitPreviewGraphics() {
        if (splitLinePolyline) {
            map.removeLayer(splitLinePolyline);
            splitLinePolyline = null;
        }
        if (splitLinePoints.length >= 2) {
            var latlngs = splitLinePoints.map(p => [p[1], p[0]]);
            splitLinePolyline = L.polyline(latlngs, { color: '#ef4444', weight: 3.5, dashArray: '6, 6' }).addTo(map);

            if (selectedParcelForSplit && selectedParcelForSplit.coords) {
                var splitRes = splitPolygonWithTurf(selectedParcelForSplit.coords, splitLinePoints);
                splitPreviewLayer.clearLayers();
                if (splitRes && splitRes.polyA && splitRes.polyB) {
                    var polyA_latlngs = splitRes.polyA.map(c => [c[1], c[0]]);
                    var polyB_latlngs = splitRes.polyB.map(c => [c[1], c[0]]);
                    var lyrA = L.polygon(polyA_latlngs, { color: '#059669', weight: 2.5, fillColor: '#10b981', fillOpacity: 0.45 });
                    var lyrB = L.polygon(polyB_latlngs, { color: '#2563eb', weight: 2.5, fillColor: '#3b82f6', fillOpacity: 0.45 });

                    // Live on-map area badges matching user's handwriting ("522 Yd")
                    var badgeA = `
                        <div style="background: rgba(5, 150, 105, 0.95); color: #ffffff; padding: 6px 12px; border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,0.4); text-align: center; border: 2px solid #ffffff; font-family: system-ui, -apple-system, sans-serif; pointer-events: none;">
                            <div style="font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; color: #a7f3d0;">Sub-Plot A</div>
                            <div style="font-size: 16px; font-weight: 900; line-height: 1.1; margin: 1px 0; text-shadow: 0 1px 2px rgba(0,0,0,0.4);">${splitRes.areaA_sqyds.toLocaleString('en-IN')} Yd</div>
                            <div style="font-size: 10px; font-weight: 700; opacity: 0.95;">${splitRes.areaA_sqft.toLocaleString('en-IN')} Sq.Ft &bull; ${splitRes.pctA}%</div>
                        </div>
                    `;
                    lyrA.bindTooltip(badgeA, { permanent: true, direction: 'center', className: 'split-preview-badge' });

                    var badgeB = `
                        <div style="background: rgba(37, 99, 235, 0.95); color: #ffffff; padding: 6px 12px; border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,0.4); text-align: center; border: 2px solid #ffffff; font-family: system-ui, -apple-system, sans-serif; pointer-events: none;">
                            <div style="font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; color: #bfdbfe;">Sub-Plot B</div>
                            <div style="font-size: 16px; font-weight: 900; line-height: 1.1; margin: 1px 0; text-shadow: 0 1px 2px rgba(0,0,0,0.4);">${splitRes.areaB_sqyds.toLocaleString('en-IN')} Yd</div>
                            <div style="font-size: 10px; font-weight: 700; opacity: 0.95;">${splitRes.areaB_sqft.toLocaleString('en-IN')} Sq.Ft &bull; ${splitRes.pctB}%</div>
                        </div>
                    `;
                    lyrB.bindTooltip(badgeB, { permanent: true, direction: 'center', className: 'split-preview-badge' });

                    splitPreviewLayer.addLayer(lyrA);
                    splitPreviewLayer.addLayer(lyrB);
                }
            }
        } else {
            splitPreviewLayer.clearLayers();
        }
    }

    function updateSplitInstructionBanner() {
        if (!selectedParcelForSplit) return;
        var p = selectedParcelForSplit.props;
        var pName = p.lot_number || p.parcel_id || 'Plot';
        var ownerA_name = (window.proposedSubdivideOwners && window.proposedSubdivideOwners.ownerA) || 'Sub-Plot A Owner';
        var ownerB_name = (window.proposedSubdivideOwners && window.proposedSubdivideOwners.ownerB) || 'Sub-Plot B Owner';

        if (splitLinePoints.length === 0) {
            setToolHint(`Selected ${pName}. Click across the plot to place 2 or more cutting vertices.`);
        } else if (splitLinePoints.length === 1) {
            var hintHtml1 = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; flex-wrap:wrap;">
                    <div>
                        <strong style="color:#ffffff;"><i class="fas fa-crosshairs"></i> Point P1 placed on ${pName}</strong>
                        <div style="font-size:0.72rem; color:#dcfce7; margin-top:2px;">Click across the plot to place Point P2 (or drag P1 pin to adjust).</div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button type="button" onclick="window.removeLastSplitPoint()" style="background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; border-radius:6px; padding:5px 10px; font-weight:700; cursor:pointer; font-size:0.76rem; display:flex; align-items:center; gap:4px;">
                            <i class="fas fa-trash-alt"></i> Remove Point P1
                        </button>
                        <button type="button" onclick="window.cancelActiveTool()" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; border-radius:6px; padding:5px 10px; font-weight:700; cursor:pointer; font-size:0.76rem;">
                            Cancel
                        </button>
                    </div>
                </div>
            `;
            setToolHint(hintHtml1, true);
        } else {
            var hintHtml = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; flex-wrap:wrap;">
                    <div>
                        <strong style="color:#ffffff;"><i class="fas fa-arrows-alt"></i> ${splitLinePoints.length} Cut Vertices Placed</strong> (Drag pins to adjust position &bull; Click &times; to delete a point)
                        <div style="font-size:0.72rem; color:#dcfce7; margin-top:2px;">Plot A: <strong>${ownerA_name}</strong> &bull; Plot B: <strong>${ownerB_name}</strong></div>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button type="button" onclick="window.executePolygonSplit()" style="background:#059669; color:#ffffff; border:1.5px solid #86efac; border-radius:6px; padding:5px 12px; font-weight:800; cursor:pointer; font-size:0.76rem; display:flex; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(0,0,0,0.3);">
                            <i class="fas fa-cut"></i> Bisect & Subdivide
                        </button>
                        <button type="button" onclick="window.removeLastSplitPoint()" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; border-radius:6px; padding:5px 10px; font-weight:700; cursor:pointer; font-size:0.76rem; display:flex; align-items:center; gap:4px;">
                            <i class="fas fa-backspace"></i> Remove Last Point
                        </button>
                        <button type="button" onclick="window.resetSubdividePoints()" style="background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; border-radius:6px; padding:5px 10px; font-weight:700; cursor:pointer; font-size:0.76rem;">
                            <i class="fas fa-undo"></i> Reset All
                        </button>
                    </div>
                </div>
            `;
            setToolHint(hintHtml, true);
        }
    }

    window.resetSubdividePoints = function() {
        splitLinePoints = [];
        if (splitLineMarkers && splitLineMarkers.length > 0) {
            splitLineMarkers.forEach(m => map.removeLayer(m));
            splitLineMarkers = [];
        }
        if (splitLinePolyline) {
            map.removeLayer(splitLinePolyline);
            splitLinePolyline = null;
        }
        if (splitPreviewLayer) {
            splitPreviewLayer.clearLayers();
        }
        updateSplitInstructionBanner();
    };

    window.executePolygonSplit = function() {
        if (!selectedParcelForSplit || splitLinePoints.length < 2) {
            alert('Please place at least 2 cutting points across the plot first.');
            return;
        }
        var origCoords = selectedParcelForSplit.coords;

        var splitRes = splitPolygonWithTurf(origCoords, splitLinePoints);
        if (!splitRes) {
            alert('Unable to bisect plot polygon cleanly. Please adjust the draggable pins across the parcel and try again.');
            return;
        }

        subPolyA = splitRes.polyA;
        subPolyB = splitRes.polyB;
        subAreaA = splitRes.areaA_sqft;
        subAreaB = splitRes.areaB_sqft;

        var p = selectedParcelForSplit.props;
        var baseUlpin = p.ulpin || p.parcel_id || '79Q5G4J9001401';
        var ulpinA = (!baseUlpin.endsWith('/A') && !baseUlpin.endsWith('A')) ? (baseUlpin + 'A') : (baseUlpin + '-1');
        var ulpinB = (!baseUlpin.endsWith('/B') && !baseUlpin.endsWith('B')) ? (baseUlpin + 'B') : (baseUlpin + '-2');
        var baseSurvey = p.survey_number || 'Sy. 101/1';

        // Update Modal elements
        var elParent = document.getElementById('subdivide-parent-id');
        var elParentArea = document.getElementById('subdivide-parent-total-area');
        var elTaskPill = document.getElementById('subdivide-linked-task-pill');
        var elTaskNo = document.getElementById('subdivide-task-no');

        if (elParent) elParent.textContent = `${p.lot_number || p.parcel_id} (${p.ulpin || p.parcel_id})`;
        if (elParentArea) elParentArea.textContent = `${(splitRes.areaA_sqft + splitRes.areaB_sqft).toLocaleString('en-IN')} Sq.Ft (${((splitRes.areaA_sqft + splitRes.areaB_sqft)/435.6).toFixed(2)} Cents)`;
        
        if (window.proposedSubdivideOwners && window.proposedSubdivideOwners.ownerA) {
            if (elTaskPill) elTaskPill.style.display = 'inline-flex';
            if (elTaskNo) elTaskNo.textContent = `${window.proposedSubdivideOwners.deedCategoryLabel || 'Deed Partition'} (Live Spatial Bisection)`;
        } else if (window.activeMutationTaskForSubdivide) {
            if (elTaskPill) elTaskPill.style.display = 'inline-flex';
            if (elTaskNo) elTaskNo.textContent = window.activeMutationTaskForSubdivide;
        } else {
            if (elTaskPill) elTaskPill.style.display = 'none';
        }

        // Sub-Plot A details
        var elUlpinA = document.getElementById('sub-ulpin-a');
        var elSurveyA = document.getElementById('sub-survey-a');
        var elSqftA = document.getElementById('sub-area-sqft-a');
        var elSqydsA = document.getElementById('sub-area-sqyds-a');
        var elCentsA = document.getElementById('sub-area-cents-a');
        var elPctA = document.getElementById('sub-share-pct-a');
        var elOwnerA = document.getElementById('sub-owner-a');

        if (elUlpinA) elUlpinA.textContent = ulpinA;
        if (elSurveyA) elSurveyA.textContent = `${baseSurvey}A`;
        if (elSqftA) elSqftA.textContent = splitRes.areaA_sqft.toLocaleString('en-IN');
        if (elSqydsA) elSqydsA.textContent = splitRes.areaA_sqyds.toLocaleString('en-IN');
        if (elCentsA) elCentsA.textContent = splitRes.areaA_cents;
        if (elPctA) elPctA.textContent = `${splitRes.pctA}% Share`;
        
        if (window.proposedSubdivideOwners && window.proposedSubdivideOwners.ownerA) {
            if (elOwnerA) elOwnerA.value = window.proposedSubdivideOwners.ownerA;
        } else {
            if (elOwnerA) elOwnerA.value = p.owner_name || 'Owner Part A';
        }

        // Sub-Plot B details
        var elUlpinB = document.getElementById('sub-ulpin-b');
        var elSurveyB = document.getElementById('sub-survey-b');
        var elSqftB = document.getElementById('sub-area-sqft-b');
        var elSqydsB = document.getElementById('sub-area-sqyds-b');
        var elCentsB = document.getElementById('sub-area-cents-b');
        var elPctB = document.getElementById('sub-share-pct-b');
        var elOwnerB = document.getElementById('sub-owner-b');

        if (elUlpinB) elUlpinB.textContent = ulpinB;
        if (elSurveyB) elSurveyB.textContent = `${baseSurvey}B`;
        if (elSqftB) elSqftB.textContent = splitRes.areaB_sqft.toLocaleString('en-IN');
        if (elSqydsB) elSqydsB.textContent = splitRes.areaB_sqyds.toLocaleString('en-IN');
        if (elCentsB) elCentsB.textContent = splitRes.areaB_cents;
        if (elPctB) elPctB.textContent = `${splitRes.pctB}% Share`;

        if (window.proposedSubdivideOwners && window.proposedSubdivideOwners.ownerB) {
            if (elOwnerB) elOwnerB.value = window.proposedSubdivideOwners.ownerB;
        } else {
            if (elOwnerB) elOwnerB.value = `${p.owner_name || 'Owner'} (Co-Sharer)`;
        }

        window.activeSubdivideTarget = {
            parcelId: p.id,
            props: p,
            coords: origCoords,
            polyA: subPolyA,
            polyB: subPolyB,
            areaA: subAreaA,
            areaB: subAreaB,
            ulpinA: ulpinA,
            ulpinB: ulpinB
        };

        // Deactivate drawing crosshair and hint, but preserve parcel data & preview layers
        activeDrawingTool = null;
        map.getContainer().style.cursor = '';
        setToolHint(null);
        if (btnSubdivideTool) btnSubdivideTool.classList.remove('active');

        window.openModal('modal-subdivide');
    };

    var btnConfirmSubdivideSubmit = document.getElementById('btn-confirm-subdivide-submit');
    if (btnConfirmSubdivideSubmit) {
        btnConfirmSubdivideSubmit.addEventListener('click', function() {
            var target = window.activeSubdivideTarget || selectedParcelForSplit;
            if (!target || !target.props) {
                console.error("Subdivide error: target parcel is missing", target, selectedParcelForSplit);
                alert('No parcel is currently active for subdivision. Please select a parcel on the map.');
                return;
            }
            var parcelId = target.props.id || target.parcelId;
            var ownerA = document.getElementById('sub-owner-a') ? document.getElementById('sub-owner-a').value.trim() : (target.props.owner_name || 'Owner Part A');
            var ownerB = document.getElementById('sub-owner-b') ? document.getElementById('sub-owner-b').value.trim() : 'Owner Part B';

            var polyA = subPolyA || target.polyA;
            var polyB = subPolyB || target.polyB;
            var areaA = subAreaA || target.areaA;
            var areaB = subAreaB || target.areaB;

            if (!polyA || !polyB) {
                alert('Turf.js bisected boundary polygons are missing. Please redraw the cut vertices and try again.');
                return;
            }

            btnConfirmSubdivideSubmit.disabled = true;
            btnConfirmSubdivideSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subdividing with Turf.js...';

            fetch(`/api/parcels/${parcelId}/subdivide/`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Officer-Auth': (sessionStorage.getItem('landstack_officer_auth') === 'true' || currentRole === 'officer') ? 'OFFICER_AUTH_2026' : '',
                    'X-Tab-Role': currentRole || 'officer'
                },
                body: JSON.stringify({
                    boundary_a: polyA,
                    boundary_b: polyB,
                    owner_a: ownerA,
                    owner_b: ownerB,
                    area_a: areaA,
                    area_b: areaB,
                    application_no: window.activeMutationTaskForSubdivide
                })
            })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(errData => {
                        throw new Error(errData.error || errData.message || ('Server error (' + res.status + ')'));
                    }).catch(e => {
                        throw new Error(e.message || ('Server error (' + res.status + ')'));
                    });
                }
                return res.json();
            })
            .then(data => {
                btnConfirmSubdivideSubmit.disabled = false;
                btnConfirmSubdivideSubmit.innerHTML = '<i class="fas fa-check-double"></i> Execute Turf.js Subdivision';
                window.closeModal('modal-subdivide');

                // Clean up cutting pins & lines now that subdivision succeeded
                window.resetSubdividePoints();
                selectedParcelForSplit = null;
                window.activeSubdivideTarget = null;
                window.cancelActiveTool();

                if (data.success && data.children && data.children.length >= 2) {
                    var childA = data.children[0];
                    var childB = data.children[1];

                    // Live GeoJSON Re-mesh: Replace parent with Child A and Child B
                    if (rawGeoJson && rawGeoJson.features) {
                        rawGeoJson.features = rawGeoJson.features.filter(f => f.properties.id !== parcelId);
                        delete parcelFeatureMap[parcelId];

                        var featA = {
                            "type": "Feature",
                            "properties": childA,
                            "geometry": { "type": "Polygon", "coordinates": [childA.boundary || polyA] }
                        };
                        var featB = {
                            "type": "Feature",
                            "properties": childB,
                            "geometry": { "type": "Polygon", "coordinates": [childB.boundary || polyB] }
                        };

                        rawGeoJson.features.push(featA);
                        rawGeoJson.features.push(featB);
                        parcelFeatureMap[childA.id] = featA;
                        parcelFeatureMap[childB.id] = featB;

                        renderParcelDots();
                    }

                    // Render animated pulse polygon highlights for both child parcels on the map
                    activePolygonLayer.clearLayers();

                    var polyLayerA = L.polygon(polyA.map(c => [c[1], c[0]]), {
                        color: '#16a34a',
                        fillColor: '#22c55e',
                        fillOpacity: 0.65,
                        weight: 3.5,
                        dashArray: '4,4'
                    }).addTo(activePolygonLayer);
                    polyLayerA.bindTooltip(`<b>Sub-Plot A</b>: ${childA.ulpin} (${childA.area_sqft} sqft)`, { permanent: true, direction: 'center' });

                    var polyLayerB = L.polygon(polyB.map(c => [c[1], c[0]]), {
                        color: '#2563eb',
                        fillColor: '#3b82f6',
                        fillOpacity: 0.65,
                        weight: 3.5,
                        dashArray: '4,4'
                    }).addTo(activePolygonLayer);
                    polyLayerB.bindTooltip(`<b>Sub-Plot B</b>: ${childB.ulpin} (${childB.area_sqft} sqft)`, { permanent: true, direction: 'center' });

                    map.fitBounds(polyLayerA.getBounds().extend(polyLayerB.getBounds()), { padding: [50, 50], maxZoom: 20 });

                    // Refresh Officer Tasks if open
                    if (window.loadOfficerPendingTasks) {
                        window.loadOfficerPendingTasks();
                    }

                    var appMsg = window.activeMutationTaskForSubdivide ? `\nLinked Task ${window.activeMutationTaskForSubdivide} advanced to Stage 3 (Tahsildar Review).` : '';
                    window.activeMutationTaskForSubdivide = null;

                    alert(`✅ Turf.js Pothissing Subdivision Complete!\nParent Plot ${target.props.parcel_id || parcelId} successfully bisected on Cadastral Map into:\n• Sub-Plot A: ${childA.ulpin} (${childA.area_sqft} Sq.Ft)\n• Sub-Plot B: ${childB.ulpin} (${childB.area_sqft} Sq.Ft)${appMsg}`);
                } else {
                    alert(data.message || 'Subdivision completed.');
                    loadParcels();
                }
            })
            .catch(err => {
                btnConfirmSubdivideSubmit.disabled = false;
                btnConfirmSubdivideSubmit.innerHTML = '<i class="fas fa-check-double"></i> Execute Turf.js Subdivision';
                console.error("Subdivision error:", err);
                alert('Subdivision error: ' + (err.message || err));
            });
        });
    }

    // ========== 9. SRO DEED REGISTRATION & INSTANT MUTATION ENGINE ==========
    window.sroPartitionCoOwners = [];
    window.sroSubdividedPlots = [];
    window.sroCurrentParcelData = null;
    window.proposedSubdivideOwners = null;

    window.onDeedSpatialModeChange = function() {
        var modeRadio = document.querySelector('input[name="deed_spatial_mode"]:checked');
        var mode = modeRadio ? modeRadio.value : 'full_transfer';

        var lblFull = document.getElementById('lbl-mode-full-transfer');
        var lblPart = document.getElementById('lbl-mode-physical-partition');
        var secPrompt = document.getElementById('sec-deed-physical-subdivision-prompt');
        var btnSubmitSRO = document.getElementById('btn-submit-sro-deed');

        var prevA = document.getElementById('preview-part-owner-a');
        var prevB = document.getElementById('preview-part-owner-b');

        // Update preview labels based on active deed type
        var deedType = document.getElementById('sro-deed-type') ? document.getElementById('sro-deed-type').value : 'sale_deed';
        var ownerA_name = 'Party A';
        var ownerB_name = 'Party B';

        if (deedType === 'sale_deed') {
            var elSaleSeller = document.getElementById('sro-sale-seller-name');
            var elSaleBuyer = document.getElementById('sro-sale-buyer-name');
            ownerA_name = (elSaleSeller && elSaleSeller.value.trim()) ? elSaleSeller.value.trim() : (window.sroCurrentParcelData ? window.sroCurrentParcelData.owner_name : 'Seller (Retained Plot)');
            ownerB_name = (elSaleBuyer && elSaleBuyer.value.trim()) ? elSaleBuyer.value.trim() : 'Buyer (Transferred Plot)';
        } else if (deedType === 'gift_deed') {
            var elGiftDonor = document.getElementById('sro-gift-donor-name');
            var elGiftDonee = document.getElementById('sro-gift-donee-name');
            ownerA_name = (elGiftDonor && elGiftDonor.value.trim()) ? elGiftDonor.value.trim() : (window.sroCurrentParcelData ? window.sroCurrentParcelData.owner_name : 'Donor (Retained Plot)');
            ownerB_name = (elGiftDonee && elGiftDonee.value.trim()) ? elGiftDonee.value.trim() : 'Donee (Settled Plot)';
        } else if (deedType === 'release_deed') {
            var elRelReleasor = document.getElementById('sro-release-releasor-name');
            var elRelReleasee = document.getElementById('sro-release-releasee-name');
            ownerA_name = (elRelReleasor && elRelReleasor.value.trim()) ? elRelReleasor.value.trim() : (window.sroCurrentParcelData ? window.sroCurrentParcelData.owner_name : 'Releasor');
            ownerB_name = (elRelReleasee && elRelReleasee.value.trim()) ? elRelReleasee.value.trim() : 'Releasee / Beneficiary';
        } else if (deedType === 'partition_deed') {
            var co1 = (window.sroPartitionCoOwners && window.sroPartitionCoOwners[0] && window.sroPartitionCoOwners[0].name) ? window.sroPartitionCoOwners[0].name : (window.sroCurrentParcelData ? window.sroCurrentParcelData.owner_name : 'Co-Owner A');
            var co2 = (window.sroPartitionCoOwners && window.sroPartitionCoOwners[1] && window.sroPartitionCoOwners[1].name) ? window.sroPartitionCoOwners[1].name : 'Co-Owner B';
            ownerA_name = co1;
            ownerB_name = co2;
        }

        if (prevA) prevA.textContent = ownerA_name;
        if (prevB) prevB.textContent = ownerB_name;

        if (mode === 'physical_subdivision') {
            if (lblFull) {
                lblFull.style.background = '#f8fafc';
                lblFull.style.borderColor = '#cbd5e1';
                lblFull.style.color = '#334155';
            }
            if (lblPart) {
                lblPart.style.background = '#f0fdf4';
                lblPart.style.borderColor = '#059669';
                lblPart.style.color = '#15803d';
            }
            if (secPrompt) secPrompt.style.display = 'block';
            if (btnSubmitSRO) {
                btnSubmitSRO.innerHTML = '<i class="fas fa-cut"></i> Proceed to Live Map Subdivision Cut';
                btnSubmitSRO.style.background = '#059669';
            }
        } else {
            if (lblFull) {
                lblFull.style.background = '#eff6ff';
                lblFull.style.borderColor = '#2563eb';
                lblFull.style.color = '#1e40af';
            }
            if (lblPart) {
                lblPart.style.background = '#f8fafc';
                lblPart.style.borderColor = '#cbd5e1';
                lblPart.style.color = '#334155';
            }
            if (secPrompt) secPrompt.style.display = 'none';
            if (btnSubmitSRO) {
                if (deedType === 'partition_deed' || deedType === 'release_deed') {
                    btnSubmitSRO.innerHTML = '<i class="fas fa-tasks"></i> Register Deed & Forward to Workflow';
                    btnSubmitSRO.style.background = '#0f2b5c';
                } else {
                    btnSubmitSRO.innerHTML = '<i class="fas fa-check-double"></i> Register Deed & Initiate Auto-Mutation';
                    btnSubmitSRO.style.background = '#059669';
                }
            }
        }
    };

    window.launchPothissingFromDeedModal = function() {
        var parcelId = (window.sroCurrentParcelData && window.sroCurrentParcelData.id) ? window.sroCurrentParcelData.id : (document.getElementById('sro-parcel-pk') ? document.getElementById('sro-parcel-pk').value : null);
        if (!parcelId) {
            alert('No parcel currently selected for deed registration.');
            return;
        }
        var deedType = document.getElementById('sro-deed-type') ? document.getElementById('sro-deed-type').value : 'sale_deed';
        var deedLabel = 'Deed Partition';
        var ownerA = '';
        var ownerB = '';

        if (deedType === 'sale_deed') {
            deedLabel = 'Sale Deed Partition';
            var elSaleSeller = document.getElementById('sro-sale-seller-name');
            var elSaleBuyer = document.getElementById('sro-sale-buyer-name');
            ownerA = (elSaleSeller && elSaleSeller.value.trim()) ? elSaleSeller.value.trim() : (window.sroCurrentParcelData ? window.sroCurrentParcelData.owner_name : 'Seller');
            ownerB = (elSaleBuyer && elSaleBuyer.value.trim()) ? elSaleBuyer.value.trim() : '';
            if (!ownerB) {
                alert('Please enter Buyer / Transferee Full Name before subdividing plot.');
                if (elSaleBuyer) elSaleBuyer.focus();
                return;
            }
        } else if (deedType === 'gift_deed') {
            deedLabel = 'Gift Deed Settlement';
            var elGiftDonor = document.getElementById('sro-gift-donor-name');
            var elGiftDonee = document.getElementById('sro-gift-donee-name');
            ownerA = (elGiftDonor && elGiftDonor.value.trim()) ? elGiftDonor.value.trim() : (window.sroCurrentParcelData ? window.sroCurrentParcelData.owner_name : 'Donor');
            ownerB = (elGiftDonee && elGiftDonee.value.trim()) ? elGiftDonee.value.trim() : '';
            if (!ownerB) {
                alert('Please enter Donee / Transferee Full Name before subdividing plot.');
                if (elGiftDonee) elGiftDonee.focus();
                return;
            }
        } else if (deedType === 'release_deed') {
            deedLabel = 'Release Deed Partition';
            var elRelReleasor = document.getElementById('sro-release-releasor-name');
            var elRelReleasee = document.getElementById('sro-release-releasee-name');
            ownerA = (elRelReleasor && elRelReleasor.value.trim()) ? elRelReleasor.value.trim() : (window.sroCurrentParcelData ? window.sroCurrentParcelData.owner_name : 'Releasor');
            ownerB = (elRelReleasee && elRelReleasee.value.trim()) ? elRelReleasee.value.trim() : '';
            if (!ownerB) {
                alert('Please enter Releasee / Beneficiary Full Name before subdividing plot.');
                if (elRelReleasee) elRelReleasee.focus();
                return;
            }
        } else if (deedType === 'partition_deed') {
            deedLabel = 'Partition Deed Bisection';
            var co1 = (window.sroPartitionCoOwners && window.sroPartitionCoOwners[0] && window.sroPartitionCoOwners[0].name && window.sroPartitionCoOwners[0].name.trim()) ? window.sroPartitionCoOwners[0].name.trim() : (window.sroCurrentParcelData ? window.sroCurrentParcelData.owner_name : 'Co-Owner 1');
            var co2 = (window.sroPartitionCoOwners && window.sroPartitionCoOwners[1] && window.sroPartitionCoOwners[1].name && window.sroPartitionCoOwners[1].name.trim()) ? window.sroPartitionCoOwners[1].name.trim() : '';
            ownerA = co1;
            ownerB = co2;
            if (!ownerB) {
                alert('Please enter at least two Co-Owner names in the partition schedule.');
                return;
            }
        }

        // Store proposed partition parties for the Turf.js subdivide modal
        window.proposedSubdivideOwners = {
            ownerA: ownerA,
            ownerB: ownerB,
            deedType: deedType,
            deedCategoryLabel: deedLabel,
            parcelId: parcelId
        };

        // Close the deed modal
        window.closeModal('modal-sro-deed');

        // Find parcel feature
        var feature = parcelFeatureMap[parcelId] || parcelFeatureMap[Number(parcelId)];
        if (!feature && rawGeoJson && rawGeoJson.features) {
            feature = rawGeoJson.features.find(f => (f.properties && (f.properties.id == parcelId || f.properties.parcel_id == parcelId)) || f.id == parcelId);
        }

        var coords = null;
        if (feature && feature.geometry && feature.geometry.coordinates) {
            if (Array.isArray(feature.geometry.coordinates[0]) && Array.isArray(feature.geometry.coordinates[0][0])) {
                coords = feature.geometry.coordinates[0];
            } else {
                coords = feature.geometry.coordinates;
            }
        }

        if (!coords && window.sroCurrentParcelData && window.sroCurrentParcelData.boundary) {
            coords = window.sroCurrentParcelData.boundary;
        }

        if (coords && coords.length >= 3) {
            var latlngs = coords.map(c => [c[1], c[0]]);
            var bounds = L.latLngBounds(latlngs);
            map.fitBounds(bounds, { maxZoom: 19, padding: [60, 60], animate: true });

            var pProps = feature ? feature.properties : window.sroCurrentParcelData;
            
            // Highlight parcel polygon
            window.selectAndHighlightParcel(pProps.id, false);

            // Directly activate crosshair subdivision cutting tool
            handleParcelSelectedForSplit(pProps, coords);
            setToolHint(`Deed Pothissing: Click 2 points across plot to bisect into Sub-Plot A (${ownerA}) & Sub-Plot B (${ownerB}).`);
        } else {
            alert(`Parcel #${parcelId} boundary coordinates not found on map.`);
        }
    };

    window.onSRODeedCategoryChange = function() {
        var deedType = document.getElementById('sro-deed-type') ? document.getElementById('sro-deed-type').value : 'sale_deed';
        
        var secSale = document.getElementById('sec-deed-sale');
        var secGift = document.getElementById('sec-deed-gift');
        var secPartition = document.getElementById('sec-deed-partition');
        var secRelease = document.getElementById('sec-deed-release');

        if (secSale) secSale.style.display = 'none';
        if (secGift) secGift.style.display = 'none';
        if (secPartition) secPartition.style.display = 'none';
        if (secRelease) secRelease.style.display = 'none';

        var lblFeeStamp = document.getElementById('lbl-fee-stamp');
        var lblFeeReg = document.getElementById('lbl-fee-reg');

        var btnSubmitSRO = document.getElementById('btn-submit-sro-deed');
        if (deedType === 'gift_deed') {
            if (secGift) secGift.style.display = 'block';
            if (lblFeeStamp) lblFeeStamp.innerHTML = '<i class="fas fa-stamp"></i> Estimated Stamp Duty (Demo 2.0%):';
            if (lblFeeReg) lblFeeReg.innerHTML = '<i class="fas fa-file-invoice-dollar"></i> Estimated Registration Fee (Demo 0.5%):';
            if (btnSubmitSRO) {
                btnSubmitSRO.innerHTML = '<i class="fas fa-check-double"></i> Register Gift Deed & Initiate Auto-Mutation';
                btnSubmitSRO.style.background = '#059669';
            }
        } else if (deedType === 'partition_deed') {
            if (secPartition) secPartition.style.display = 'block';
            if (lblFeeStamp) lblFeeStamp.innerHTML = '<i class="fas fa-stamp"></i> Estimated Stamp Duty (Demo 1.0%):';
            if (lblFeeReg) lblFeeReg.innerHTML = '<i class="fas fa-file-invoice-dollar"></i> Estimated Registration Fee (Demo 0.5%):';
            if (btnSubmitSRO) {
                btnSubmitSRO.innerHTML = '<i class="fas fa-tasks"></i> Register Partition Deed & Forward to Mandal Surveyor Workflow';
                btnSubmitSRO.style.background = '#0f2b5c';
            }
            window.onPartitionTypeChange();
        } else if (deedType === 'release_deed') {
            if (secRelease) secRelease.style.display = 'block';
            if (lblFeeStamp) lblFeeStamp.innerHTML = '<i class="fas fa-stamp"></i> Estimated Stamp Duty (Demo 1.5%):';
            if (lblFeeReg) lblFeeReg.innerHTML = '<i class="fas fa-file-invoice-dollar"></i> Estimated Registration Fee (Demo 0.5%):';
            if (btnSubmitSRO) {
                btnSubmitSRO.innerHTML = '<i class="fas fa-tasks"></i> Register Release Deed & Forward to Tahsildar Workflow';
                btnSubmitSRO.style.background = '#0f2b5c';
            }
        } else {
            if (secSale) secSale.style.display = 'block';
            if (lblFeeStamp) lblFeeStamp.innerHTML = '<i class="fas fa-stamp"></i> Estimated Stamp Duty (Demo 5.0%):';
            if (lblFeeReg) lblFeeReg.innerHTML = '<i class="fas fa-file-invoice-dollar"></i> Estimated Registration Fee (Demo 1.0%):';
            if (btnSubmitSRO) {
                btnSubmitSRO.innerHTML = '<i class="fas fa-check-double"></i> Register Deed & Initiate Auto-Mutation';
                btnSubmitSRO.style.background = '#059669';
            }
        }

        window.onDeedSpatialModeChange();
        window.recalculateSROFees();
    };

    window.onPartitionTypeChange = function() {
        var subShare = document.getElementById('submode-partition-share');
        if (subShare) subShare.style.display = 'block';
        window.renderPartitionCoOwners();
        window.updatePartitionShareCalculation();
        window.recalculateSROFees();
    };

    window.renderPartitionCoOwners = function() {
        var container = document.getElementById('partition-coowners-list');
        if (!container) return;
        container.innerHTML = '';

        window.sroPartitionCoOwners.forEach(function(item, idx) {
            var row = document.createElement('div');
            row.style.cssText = 'display: grid; grid-template-columns: 2fr 1.5fr 1fr auto; gap: 6px; align-items: center; background: #ffffff; padding: 6px; border: 1px solid #e2e8f0; border-radius: 6px;';
            
            var labelLetter = String.fromCharCode(65 + idx);
            
            row.innerHTML = `
                <div>
                    <input type="text" placeholder="Co-Owner (${labelLetter}) Full Name *" value="${item.name || ''}" 
                           oninput="window.sroPartitionCoOwners[${idx}].name = this.value;"
                           style="width: 100%; padding: 6px 8px; font-size: 0.8rem; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;">
                </div>
                <div>
                    <input type="text" placeholder="Aadhaar (Masked)" value="${item.aadhaar || ''}" 
                           oninput="window.sroPartitionCoOwners[${idx}].aadhaar = this.value;"
                           style="width: 100%; padding: 6px 8px; font-size: 0.8rem; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;">
                </div>
                <div>
                    <div style="display:flex; align-items:center; gap:2px;">
                        <input type="number" step="0.01" min="0" max="100" placeholder="Share %" value="${item.share !== undefined ? item.share : ''}" 
                               oninput="window.sroPartitionCoOwners[${idx}].share = parseFloat(this.value) || 0; window.updatePartitionShareCalculation();"
                               style="width: 100%; padding: 6px 8px; font-size: 0.8rem; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;">
                        <span style="font-size:0.75rem; color:#64748b; font-weight:700;">%</span>
                    </div>
                </div>
                <div>
                    ${idx >= 2 ? `<button type="button" onclick="window.removePartitionCoOwnerRow(${idx})" style="background:#fee2e2; color:#ef4444; border:1px solid #fca5a5; border-radius:4px; padding:4px 8px; cursor:pointer; font-weight:bold; font-size:0.8rem;" title="Remove Co-Owner">&times;</button>` : '<div style="width:24px;"></div>'}
                </div>
            `;
            container.appendChild(row);
        });
        window.updatePartitionShareCalculation();
    };

    window.addPartitionCoOwnerRow = function() {
        window.sroPartitionCoOwners.push({
            name: '',
            aadhaar: 'XXXX-XXXX-' + Math.floor(1000 + Math.random() * 9000),
            share: 0
        });
        window.renderPartitionCoOwners();
    };

    window.removePartitionCoOwnerRow = function(idx) {
        if (window.sroPartitionCoOwners.length > 2) {
            window.sroPartitionCoOwners.splice(idx, 1);
            window.renderPartitionCoOwners();
        }
    };

    window.updatePartitionShareCalculation = function() {
        var total = window.sroPartitionCoOwners.reduce(function(acc, curr) {
            return acc + (parseFloat(curr.share) || 0);
        }, 0);
        
        var indicator = document.getElementById('partition-share-indicator');
        if (!indicator) return;

        var isExact100 = Math.abs(total - 100) < 0.01;
        if (isExact100) {
            indicator.style.color = '#059669';
            indicator.innerHTML = `Total Share: 100.0% <i class="fas fa-check-circle"></i>`;
        } else {
            indicator.style.color = '#dc2626';
            indicator.innerHTML = `Total Share: ${total.toFixed(2)}% (Must equal 100%) <i class="fas fa-exclamation-triangle"></i>`;
        }
    };

    window.renderSubdividedPlots = function() {
        var container = document.getElementById('partition-subdivision-list');
        if (!container) return;
        container.innerHTML = '';

        window.sroSubdividedPlots.forEach(function(item, idx) {
            var row = document.createElement('div');
            row.style.cssText = 'display: grid; grid-template-columns: 1.2fr 2fr 1.2fr auto; gap: 6px; align-items: center; background: #ffffff; padding: 6px; border: 1px solid #e2e8f0; border-radius: 6px;';
            
            row.innerHTML = `
                <div>
                    <input type="text" placeholder="Temp Plot ID" value="${item.plot_id || ''}" 
                           oninput="window.sroSubdividedPlots[${idx}].plot_id = this.value;"
                           style="width: 100%; padding: 6px 8px; font-size: 0.78rem; font-weight:700; color:#1e40af; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;">
                </div>
                <div>
                    <input type="text" placeholder="Assigned Owner *" value="${item.owner || ''}" 
                           oninput="window.sroSubdividedPlots[${idx}].owner = this.value;"
                           style="width: 100%; padding: 6px 8px; font-size: 0.8rem; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;">
                </div>
                <div>
                    <div style="display:flex; align-items:center; gap:2px;">
                        <input type="number" step="0.1" min="1" placeholder="Extent" value="${item.area !== undefined ? item.area : ''}" 
                               oninput="window.sroSubdividedPlots[${idx}].area = parseFloat(this.value) || 0; window.updateSubdivisionAreaCalculation();"
                               style="width: 100%; padding: 6px 8px; font-size: 0.8rem; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;">
                        <span style="font-size:0.7rem; color:#64748b; white-space:nowrap;">Yds</span>
                    </div>
                </div>
                <div>
                    ${idx >= 2 ? `<button type="button" onclick="window.removeSubdividedPlotRow(${idx})" style="background:#fee2e2; color:#ef4444; border:1px solid #fca5a5; border-radius:4px; padding:4px 8px; cursor:pointer; font-weight:bold; font-size:0.8rem;" title="Remove Parcel">&times;</button>` : '<div style="width:24px;"></div>'}
                </div>
            `;
            container.appendChild(row);
        });
        window.updateSubdivisionAreaCalculation();
    };

    window.addSubdividedPlotRow = function() {
        var num = window.sroSubdividedPlots.length + 1;
        var origAreaSqYds = (window.sroCurrentParcelData && window.sroCurrentParcelData.realAreaSqYds) ? window.sroCurrentParcelData.realAreaSqYds : 350.0;
        var currentTotal = window.sroSubdividedPlots.reduce(function(acc, curr) {
            return acc + (parseFloat(curr.area) || 0);
        }, 0);
        var unallocated = Math.max(0, Math.round((origAreaSqYds - currentTotal) * 10) / 10);

        window.sroSubdividedPlots.push({
            plot_id: `Plot ${num} (Subdivided)`,
            owner: '',
            area: unallocated
        });
        window.renderSubdividedPlots();
    };

    window.removeSubdividedPlotRow = function(idx) {
        if (window.sroSubdividedPlots.length > 2) {
            window.sroSubdividedPlots.splice(idx, 1);
            window.renderSubdividedPlots();
        }
    };

    window.updateSubdivisionAreaCalculation = function() {
        var origAreaSqYds = (window.sroCurrentParcelData && window.sroCurrentParcelData.realAreaSqYds) ? window.sroCurrentParcelData.realAreaSqYds : 350.0;
        var totalProposed = window.sroSubdividedPlots.reduce(function(acc, curr) {
            return acc + (parseFloat(curr.area) || 0);
        }, 0);
        totalProposed = Math.round(totalProposed * 10) / 10;

        var indicator = document.getElementById('partition-area-indicator');
        if (!indicator) return;

        if (totalProposed > origAreaSqYds + 0.05) {
            indicator.style.color = '#dc2626';
            indicator.innerHTML = `Total Proposed: ${totalProposed.toFixed(1)} / ${origAreaSqYds.toFixed(1)} Sq.Yds ⚠ (Exceeds Satellite Survey Extent)`;
        } else if (Math.abs(totalProposed - origAreaSqYds) <= 0.2) {
            indicator.style.color = '#059669';
            indicator.innerHTML = `Total Proposed Area = Original Satellite Area (${totalProposed.toFixed(1)} Sq.Yds) <i class="fas fa-check-circle"></i>`;
        } else {
            var rem = Math.round((origAreaSqYds - totalProposed) * 10) / 10;
            indicator.style.color = '#d97706';
            indicator.innerHTML = `Total Proposed: ${totalProposed.toFixed(1)} / ${origAreaSqYds.toFixed(1)} Sq.Yds (Unallocated: ${rem.toFixed(1)} Sq.Yds)`;
        }
    };

    window.recalculateSROFees = function() {
        var deedType = document.getElementById('sro-deed-type') ? document.getElementById('sro-deed-type').value : 'sale_deed';
        var val = 0;

        if (deedType === 'gift_deed') {
            var elVal = document.getElementById('sro-gift-property-value');
            val = parseFloat(elVal ? elVal.value : 0) || 0;
        } else if (deedType === 'partition_deed') {
            var elShare = document.getElementById('sro-partition-share-value');
            val = parseFloat(elShare ? elShare.value : 0) || 0;
        } else if (deedType === 'release_deed') {
            var elRel = document.getElementById('sro-release-value');
            val = parseFloat(elRel ? elRel.value : 0) || 0;
        } else {
            var elSale = document.getElementById('sro-sale-value');
            val = parseFloat(elSale ? elSale.value : 0) || 0;
        }

        var stampRate = 0.05;
        var regRate = 0.01;

        if (deedType === 'gift_deed') {
            stampRate = 0.02;
            regRate = 0.005;
        } else if (deedType === 'partition_deed') {
            stampRate = 0.01;
            regRate = 0.005;
        } else if (deedType === 'release_deed') {
            stampRate = 0.015;
            regRate = 0.005;
        }

        var stamp = Math.round(val * stampRate);
        var reg = Math.round(val * regRate);
        var total = stamp + reg;
        var elStamp = document.getElementById('sro-fee-stamp');
        var elReg = document.getElementById('sro-fee-reg');
        var elTotal = document.getElementById('sro-fee-total');
        if (elStamp) elStamp.textContent = '₹ ' + stamp.toLocaleString('en-IN');
        if (elReg) elReg.textContent = '₹ ' + reg.toLocaleString('en-IN');
        if (elTotal) elTotal.textContent = '₹ ' + total.toLocaleString('en-IN');
    };

    window.openSRODeedModal = function(parcelId) {
        if (!isOfficerTabAuthenticated()) {
            window.openModal('modal-officer-auth');
            return;
        }
        var feature = parcelFeatureMap[parcelId];
        if (!feature && rawGeoJson) {
            feature = rawGeoJson.features.find(f => f.properties.id === parcelId);
        }
        if (!feature) {
            alert('Parcel not found');
            return;
        }
        var p = feature.properties;
        window.sroCurrentParcelData = p;

        // Calculate true geodesic real area from satellite map coordinates
        var coords = (feature && feature.geometry && feature.geometry.coordinates) ? feature.geometry.coordinates[0] : null;
        var realAreaSqft = 0;
        if (coords && coords.length >= 3) {
            realAreaSqft = calculateShoelaceArea(coords);
        }
        if (!realAreaSqft || realAreaSqft < 10) {
            realAreaSqft = Number(p.area_sqft || 2400);
        }
        realAreaSqft = Math.round(realAreaSqft * 10) / 10;
        var realAreaSqYds = Math.round((realAreaSqft / 9.0) * 10) / 10;
        var areaStr = `${realAreaSqft.toLocaleString('en-IN', {minimumFractionDigits: 1, maximumFractionDigits: 1})} Sq.Ft (${realAreaSqYds.toLocaleString('en-IN', {minimumFractionDigits: 1, maximumFractionDigits: 1})} Sq.Yds)`;

        window.sroCurrentParcelData.realAreaSqft = realAreaSqft;
        window.sroCurrentParcelData.realAreaSqYds = realAreaSqYds;

        var ulpinCode = p.ulpin || `AP-VSP-${(p.zone||'GEN').toUpperCase().slice(0,3)}-${String(p.id||100).padStart(6,'0')}`;
        var surveyStr = `${p.survey_number || 'Sy. 101/4'} • ${p.lot_number || p.parcel_id}`;
        var ownerStr = p.owner_name || 'State Revenue / Legal Occupant';
        var estValue = p.market_value ? Math.round(p.market_value) : Math.round(realAreaSqft * 4200);

        document.getElementById('sro-parcel-pk').value = p.id;
        document.getElementById('sro-snap-ulpin').textContent = ulpinCode;
        document.getElementById('sro-snap-survey').textContent = surveyStr;
        document.getElementById('sro-snap-owner').textContent = ownerStr;
        document.getElementById('sro-snap-area').textContent = areaStr;

        // Populate Property Schedule details
        var elMandal = document.getElementById('sched-mandal');
        var elWard = document.getElementById('sched-ward');
        var elSurvey = document.getElementById('sched-survey');
        var elPlot = document.getElementById('sched-plot');
        var elExtent = document.getElementById('sched-extent');
        if (elMandal) elMandal.textContent = p.zone ? (p.zone.charAt(0).toUpperCase() + p.zone.slice(1).replace('_', ' ') + ' Mandal') : 'Visakhapatnam Urban';
        if (elWard) elWard.textContent = p.ward_number ? ('Ward ' + p.ward_number) : (p.village_ward || 'Ward 14');
        if (elSurvey) elSurvey.textContent = p.survey_number || 'Sy. 101/4';
        if (elPlot) elPlot.textContent = p.lot_number || p.parcel_id || 'Plot 1';
        if (elExtent) elExtent.textContent = areaStr;

        // Reset deed type dropdown
        var selectDeed = document.getElementById('sro-deed-type');
        if (selectDeed) selectDeed.value = 'sale_deed';

        // 1. Pre-fill Sale Deed fields
        var elSaleSeller = document.getElementById('sro-sale-seller-name');
        var elSaleBuyer = document.getElementById('sro-sale-buyer-name');
        var elSaleVal = document.getElementById('sro-sale-value');
        if (elSaleSeller) elSaleSeller.value = ownerStr;
        if (elSaleBuyer) elSaleBuyer.value = '';
        if (elSaleVal) elSaleVal.value = estValue;

        // 2. Pre-fill Gift Deed fields
        var elGiftDonor = document.getElementById('sro-gift-donor-name');
        var elGiftDonee = document.getElementById('sro-gift-donee-name');
        var elGiftVal = document.getElementById('sro-gift-property-value');
        if (elGiftDonor) elGiftDonor.value = ownerStr;
        if (elGiftDonee) elGiftDonee.value = '';
        if (elGiftVal) elGiftVal.value = estValue;

        // 3. Pre-fill Partition Deed state
        window.sroPartitionCoOwners = [
            { name: ownerStr, aadhaar: 'XXXX-XXXX-4102', share: 50.0 },
            { name: '', aadhaar: 'XXXX-XXXX-8921', share: 50.0 }
        ];
        var elPartShareVal = document.getElementById('sro-partition-share-value');
        if (elPartShareVal) elPartShareVal.value = estValue;

        var halfArea = Math.round((realAreaSqYds / 2.0) * 10) / 10;
        var remArea = Math.round((realAreaSqYds - halfArea) * 10) / 10;
        window.sroSubdividedPlots = [
            { plot_id: 'Plot 1 (North-East)', owner: ownerStr, area: halfArea },
            { plot_id: 'Plot 2 (South-West)', owner: '', area: remArea }
        ];
        var elPartSubVal = document.getElementById('sro-partition-sub-value');
        if (elPartSubVal) elPartSubVal.value = estValue;

        var elSubUlpin = document.getElementById('part-sub-orig-ulpin');
        var elSubSurvey = document.getElementById('part-sub-orig-survey');
        var elSubArea = document.getElementById('part-sub-orig-area');
        if (elSubUlpin) elSubUlpin.textContent = ulpinCode;
        if (elSubSurvey) elSubSurvey.textContent = surveyStr;
        if (elSubArea) elSubArea.textContent = `${realAreaSqYds} Sq.Yds`;

        // 4. Pre-fill Release Deed fields
        var elRelReleasor = document.getElementById('sro-release-releasor-name');
        var elRelReleasee = document.getElementById('sro-release-releasee-name');
        var elRelVal = document.getElementById('sro-release-value');
        var elRelPct = document.getElementById('sro-release-percentage');
        if (elRelReleasor) elRelReleasor.value = ownerStr;
        if (elRelReleasee) elRelReleasee.value = '';
        if (elRelVal) elRelVal.value = Math.round(estValue * 0.5);
        if (elRelPct) elRelPct.value = 50.0;

        // Reset spatial transfer mode to full transfer
        var radioFull = document.querySelector('input[name="deed_spatial_mode"][value="full_transfer"]');
        if (radioFull) radioFull.checked = true;
        window.proposedSubdivideOwners = null;

        // Attach input listeners to deed party names for live preview
        ['sro-sale-seller-name', 'sro-sale-buyer-name', 'sro-gift-donor-name', 'sro-gift-donee-name', 'sro-release-releasor-name', 'sro-release-releasee-name'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el && !el._spatialBound) {
                el._spatialBound = true;
                el.addEventListener('input', function() {
                    window.onDeedSpatialModeChange();
                });
            }
        });

        window.sroCustomFiles = {};
        window.onSRODeedCategoryChange();
        window.onDeedSpatialModeChange();
        window.openModal('modal-sro-deed');
    };

    window.sroCustomFiles = {};
    window.uploadedFileBlobs = window.uploadedFileBlobs || {};

    window.handleSROFileChange = function(type, input) {
        if (!input || !input.files || input.files.length === 0) return;
        var file = input.files[0];
        var sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        var sizeStr = sizeMB > 0 ? `${sizeMB} MB` : `${Math.round(file.size / 1024)} KB`;

        var reader = new FileReader();
        reader.onload = function(e) {
            var dataUrl = e.target.result;
            window.sroCustomFiles[type] = {
                file_name: file.name,
                file_size: sizeStr,
                file_data: dataUrl,
                file_type: file.type
            };
            window.uploadedFileBlobs[file.name] = dataUrl;
            window.uploadedFileBlobs[`doc-${type}`] = dataUrl;
            window.saveFileToIndexedDB(file.name, dataUrl, file.name);
            window.saveFileToIndexedDB(`doc-${type}`, dataUrl, file.name);
            try {
                localStorage.setItem('landstack_file_' + file.name, dataUrl);
                localStorage.setItem('landstack_file_doc-' + type, dataUrl);
            } catch (err) {}
        };
        reader.readAsDataURL(file);

        var labelEl = document.getElementById(`label-sro-file-${type}`);
        var badgeEl = document.getElementById(`badge-sro-file-${type}`);

        if (labelEl) {
            labelEl.textContent = `${file.name} (${sizeStr})`;
            labelEl.style.color = '#047857';
            labelEl.style.fontWeight = '700';
        }
        if (badgeEl) {
            badgeEl.innerHTML = '<i class="fas fa-check"></i> Uploaded';
            badgeEl.style.background = '#dcfce7';
            badgeEl.style.color = '#15803d';
            badgeEl.style.borderColor = '#86efac';
        }
    };

    window.submitSRODeedRegistration = function() {
        var spatialRadio = document.querySelector('input[name="deed_spatial_mode"]:checked');
        if (spatialRadio && spatialRadio.value === 'physical_subdivision') {
            window.launchPothissingFromDeedModal();
            return;
        }

        var parcelId = document.getElementById('sro-parcel-pk').value;
        var deedType = document.getElementById('sro-deed-type').value;
        var sroOffice = document.getElementById('sro-office-select').value;
        var submitBtn = document.getElementById('btn-submit-sro-deed');

        var certCheck = document.getElementById('sro-officer-cert-check');
        if (certCheck && !certCheck.checked) {
            alert('Please check the Sub-Registrar Officer Certification to proceed.');
            return;
        }

        var sellerName = '';
        var sellerAadhaar = '';
        var buyerName = '';
        var buyerAadhaar = '';
        var valuation = 0;
        var partitionMode = 'share';
        var cadastralImpactText = '';

        if (deedType === 'gift_deed') {
            sellerName = (document.getElementById('sro-gift-donor-name') ? document.getElementById('sro-gift-donor-name').value : '').trim();
            sellerAadhaar = (document.getElementById('sro-gift-donor-aadhaar') ? document.getElementById('sro-gift-donor-aadhaar').value : '').trim();
            buyerName = (document.getElementById('sro-gift-donee-name') ? document.getElementById('sro-gift-donee-name').value : '').trim();
            buyerAadhaar = (document.getElementById('sro-gift-donee-aadhaar') ? document.getElementById('sro-gift-donee-aadhaar').value : '').trim();
            valuation = parseFloat(document.getElementById('sro-gift-property-value') ? document.getElementById('sro-gift-property-value').value : 0) || 0;

            if (!sellerName) { alert('Please enter Donor Full Name'); return; }
            if (!buyerName) { alert('Please enter Donee / Transferee Full Name'); return; }
            if (valuation <= 0) { alert('Property / Market Value must be greater than 0.'); return; }
            cadastralImpactText = 'Ownership change recorded → Mutation initiated';
        } else if (deedType === 'partition_deed') {
            partitionMode = 'share';
            valuation = parseFloat(document.getElementById('sro-partition-share-value') ? document.getElementById('sro-partition-share-value').value : 0) || 0;
            var totalShare = 0;

                for (var j = 0; j < window.sroPartitionCoOwners.length; j++) {
                    var co = window.sroPartitionCoOwners[j];
                    if (!co.name || !co.name.trim()) {
                        alert(`Please enter Co-Owner ${String.fromCharCode(65 + j)} Full Name`);
                        return;
                    }
                    if (co.share <= 0) {
                        alert(`Please enter positive share percentage for ${co.name}`);
                        return;
                    }
                    totalShare += co.share;
                }

                if (Math.abs(totalShare - 100) > 0.01) {
                    alert(`Validation Error: Total ownership percentage must equal exactly 100.0%. Current total: ${totalShare.toFixed(2)}%`);
                    return;
                }
                if (valuation <= 0) { alert('Please enter a valid Value of Property / Share.'); return; }

                sellerName = window.sroCurrentParcelData ? window.sroCurrentParcelData.owner_name : 'Partitioning Parties';
                buyerName = window.sroPartitionCoOwners.map(c => `${c.name} (${c.share}%)`).join(', ');
                cadastralImpactText = 'Ownership shares updated → Mutation initiated';
        } else if (deedType === 'release_deed') {
            sellerName = (document.getElementById('sro-release-releasor-name') ? document.getElementById('sro-release-releasor-name').value : '').trim();
            sellerAadhaar = (document.getElementById('sro-release-releasor-aadhaar') ? document.getElementById('sro-release-releasor-aadhaar').value : '').trim();
            buyerName = (document.getElementById('sro-release-releasee-name') ? document.getElementById('sro-release-releasee-name').value : '').trim();
            buyerAadhaar = (document.getElementById('sro-release-releasee-aadhaar') ? document.getElementById('sro-release-releasee-aadhaar').value : '').trim();
            valuation = parseFloat(document.getElementById('sro-release-value') ? document.getElementById('sro-release-value').value : 0) || 0;
            var relPct = parseFloat(document.getElementById('sro-release-percentage') ? document.getElementById('sro-release-percentage').value : 0) || 0;

            if (!sellerName) { alert('Please enter Releasor Full Name'); return; }
            if (!buyerName) { alert('Please enter Releasee / Beneficiary Full Name'); return; }
            if (valuation <= 0) { alert('Please enter Value of Released Share.'); return; }
            if (relPct <= 0 || relPct > 100) { alert('Released Share (%) must be between 1% and 100%.'); return; }
            cadastralImpactText = 'Ownership/share interest updated → Mutation initiated';
        } else {
            sellerName = (document.getElementById('sro-sale-seller-name') ? document.getElementById('sro-sale-seller-name').value : '').trim();
            sellerAadhaar = (document.getElementById('sro-sale-seller-aadhaar') ? document.getElementById('sro-sale-seller-aadhaar').value : '').trim();
            buyerName = (document.getElementById('sro-sale-buyer-name') ? document.getElementById('sro-sale-buyer-name').value : '').trim();
            buyerAadhaar = (document.getElementById('sro-sale-buyer-aadhaar') ? document.getElementById('sro-sale-buyer-aadhaar').value : '').trim();
            valuation = parseFloat(document.getElementById('sro-sale-value') ? document.getElementById('sro-sale-value').value : 0) || 0;

            if (!sellerName) { alert('Please enter Seller / Transferor Full Name'); return; }
            if (!buyerName) { alert('Please enter Buyer / Transferee Full Name'); return; }
            if (valuation <= 0) { alert('Sale Consideration Amount must be greater than 0.'); return; }
            cadastralImpactText = 'Ownership change recorded → Mutation initiated';
        }

        var deathCertNo = (document.getElementById('sro-part-doc-death') ? document.getElementById('sro-part-doc-death').value : '').trim();
        var legalHeirRef = (document.getElementById('sro-part-doc-heir') ? document.getElementById('sro-part-doc-heir').value : '').trim();
        var partitionAgrRef = (document.getElementById('sro-part-doc-agreement') ? document.getElementById('sro-part-doc-agreement').value : '').trim();

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing SRO Registration...';
        }

        var payload = {
            seller_name: sellerName,
            seller_aadhaar: sellerAadhaar,
            buyer_name: buyerName,
            buyer_aadhaar: buyerAadhaar,
            sale_consideration: valuation,
            deed_type: deedType,
            partition_mode: partitionMode,
            sro_office: sroOffice,
            death_cert_no: deathCertNo,
            legal_heir_ref: legalHeirRef,
            partition_agreement_ref: partitionAgrRef
        };

        if (window.sroCustomFiles) {
            if (window.sroCustomFiles.death) {
                payload.death_doc_file = window.sroCustomFiles.death.file_name;
                payload.death_doc_size = window.sroCustomFiles.death.file_size;
                payload.death_doc_data = window.sroCustomFiles.death.file_data;
            }
            if (window.sroCustomFiles.heir) {
                payload.heir_doc_file = window.sroCustomFiles.heir.file_name;
                payload.heir_doc_size = window.sroCustomFiles.heir.file_size;
                payload.heir_doc_data = window.sroCustomFiles.heir.file_data;
            }
            if (window.sroCustomFiles.part) {
                payload.partition_doc_file = window.sroCustomFiles.part.file_name;
                payload.partition_doc_size = window.sroCustomFiles.part.file_size;
                payload.partition_doc_data = window.sroCustomFiles.part.file_data;
            }
        }

        fetch(`/api/parcels/${parcelId}/register-sro-deed/`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Officer-Auth': (sessionStorage.getItem('landstack_officer_auth') === 'true' || currentRole === 'officer') ? 'OFFICER_AUTH_2026' : '',
                'X-Tab-Role': currentRole || 'officer'
            },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-check-double"></i> Register Deed';
            }

            if (!data.success) {
                alert('Registration Failed: ' + (data.message || 'Unknown error'));
                return;
            }

            window.closeModal('modal-sro-deed');

            // Populate Success Receipt Modal
            var deedNo = (data.deed && data.deed.deed_number) ? data.deed.deed_number : 'AP/SRO/VSKP/2026/000123';
            var mutRef = (data.deed && data.deed.mutation_reference) ? data.deed.mutation_reference : 'MUT-2026-000123';
            var deedCat = (data.deed && (data.deed.deed_category || data.deed.deed_type)) ? (data.deed.deed_category || data.deed.deed_type) : 'Absolute Sale Deed';

            var elDeedNo = document.getElementById('receipt-deed-no');
            var elMutRef = document.getElementById('receipt-mut-ref');
            var elDeedCat = document.getElementById('receipt-deed-cat');
            var elNewOwner = document.getElementById('receipt-new-owner');
            var elUlpin = document.getElementById('receipt-ulpin');
            var elSaleVal = document.getElementById('receipt-sale-val');
            var elSroOffice = document.getElementById('receipt-sro-office');
            var elTimestamp = document.getElementById('receipt-timestamp');
            var elImpact = document.getElementById('receipt-cadastral-impact');

            if (elDeedNo) elDeedNo.textContent = deedNo;
            if (elMutRef) elMutRef.textContent = mutRef;
            if (elDeedCat) elDeedCat.textContent = deedCat;
            if (elNewOwner) elNewOwner.textContent = buyerName;
            if (elUlpin) elUlpin.textContent = (data.updated_parcel && data.updated_parcel.ulpin) ? data.updated_parcel.ulpin : (window.sroCurrentParcelData ? window.sroCurrentParcelData.ulpin : 'AP-VSP-001');
            if (elSaleVal) elSaleVal.textContent = '₹ ' + Number(valuation).toLocaleString('en-IN');
            if (elSroOffice) elSroOffice.textContent = data.deed.sro_office || sroOffice;
            if (elTimestamp) elTimestamp.textContent = data.deed.registration_date || '04-Sep-2026';
            if (elImpact) elImpact.textContent = (data.deed && data.deed.cadastral_impact) ? data.deed.cadastral_impact : cadastralImpactText;

            var btnRor = document.getElementById('btn-view-mutated-ror');
            var btnTax = document.getElementById('btn-view-mutated-tax');

            if (data.is_statutory_workflow) {
                if (btnRor) {
                    btnRor.innerHTML = '<i class="fas fa-route"></i> Track in Live Workflow Drawer';
                    btnRor.style.background = '#2563eb';
                    btnRor.onclick = function() {
                        window.closeModal('modal-sro-success');
                        window.openTrackingDrawer(data.workflow_app_no);
                    };
                }
                if (btnTax) btnTax.style.display = 'none';
                window.lastGeneratedAppNo = data.workflow_app_no;
                if (window.loadOfficerPendingTasks) window.loadOfficerPendingTasks();
                if (window.loadRecentApplicationsChips) window.loadRecentApplicationsChips();
            } else {
                if (btnRor) {
                    btnRor.innerHTML = '<i class="fas fa-certificate"></i> View Mutated RoR 1-B';
                    btnRor.style.background = '#059669';
                    btnRor.onclick = function() { window.open(data.updated_parcel.ror_url, '_blank'); };
                }
                if (btnTax) {
                    btnTax.style.display = 'inline-flex';
                    btnTax.onclick = function() { window.open(data.updated_parcel.tax_url, '_blank'); };
                }
                window.lastGeneratedAppNo = data.workflow_app_no;
                if (window.loadOfficerPendingTasks) window.loadOfficerPendingTasks();
                if (window.loadRecentApplicationsChips) window.loadRecentApplicationsChips();

                // Live In-Memory GeoJSON Property Mutation (Only for auto-mutated sale deeds)
                var pid = parseInt(parcelId);
                if (parcelFeatureMap[pid]) {
                    parcelFeatureMap[pid].properties.owner_name = buyerName;
                    parcelFeatureMap[pid].properties.market_value = valuation;
                    parcelFeatureMap[pid].properties.status = 'occupied';
                    parcelFeatureMap[pid].properties.ror_number = data.updated_parcel.ror_number;
                    if (parcelFeatureMap[pid].properties.encumbrance_status === 'disputed') {
                        parcelFeatureMap[pid].properties.encumbrance_status = 'clear';
                    }
                }
                if (rawGeoJson) {
                    var feat = rawGeoJson.features.find(f => f.properties.id === pid);
                    if (feat) {
                        feat.properties.owner_name = buyerName;
                        feat.properties.market_value = valuation;
                        feat.properties.status = 'occupied';
                        feat.properties.ror_number = data.updated_parcel.ror_number;
                        if (feat.properties.encumbrance_status === 'disputed') {
                            feat.properties.encumbrance_status = 'clear';
                        }
                    }
                }
            }

            window.openModal('modal-sro-success');

            // Trigger visual mutation pulse on active polygon
            window.selectAndHighlightParcel(pid, true);
            var activeLayers = activePolygonLayer.getLayers();
            if (activeLayers && activeLayers.length > 0) {
                var poly = activeLayers[0];
                poly.setStyle({ fillColor: '#10b981', color: '#059669', weight: 5, fillOpacity: 0.85 });
                setTimeout(function() {
                    poly.setStyle({ fillColor: '#3b82f6', color: '#ffffff', weight: 3.5, fillOpacity: 0.65 });
                }, 3500);
            }
        })
        .catch(err => {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-check-double"></i> Register Deed & Initiate Auto-Mutation';
            }
            alert('Network error during SRO registration: ' + err);
        });
    };

    // ==========================================
    // MODULE C: CITIZEN MUTATION & TRACKING JS
    // ==========================================

    window.citizenUploadedFiles = [];

    window.openCitizenMutationModal = function(parcelId) {
        var p = null;
        var allowedUlpins = window.getCitizenLinkedULPINs();

        if (parcelId && parcelFeatureMap[parcelId]) {
            var targetProps = parcelFeatureMap[parcelId].properties;
            if (!isCitizenOwnedParcel(targetProps)) {
                alert(
                    `⛔ Access Restricted (Ownership RBAC):\n\nYou cannot apply for mutation on another citizen's property.\n\nYour authenticated Aadhaar (${sessionStorage.getItem('landstack_citizen_aadhaar') || '5489 2104 8921'}) is linked strictly to your registered Bhu-Aadhaar properties:\n• Plot 17-A (ULPIN: 79Q5CNX8ICNOELA)\n• Plot 45 (ULPIN: 79Q5RUS004501)`
                );
                return;
            }
            p = targetProps;
        } else if (activeParcelId && parcelFeatureMap[activeParcelId] && isCitizenOwnedParcel(parcelFeatureMap[activeParcelId].properties)) {
            p = parcelFeatureMap[activeParcelId].properties;
        } else {
            // Find citizen's primary registered property
            if (rawGeoJson && rawGeoJson.features) {
                var found = rawGeoJson.features.find(f => {
                    var u = (f.properties.ulpin || '').toUpperCase().trim();
                    return allowedUlpins.includes(u);
                });
                if (found) p = found.properties;
            }
        }

        if (!p && rawGeoJson && rawGeoJson.features) {
            var defaultFeat = rawGeoJson.features.find(f => f.properties.ulpin === '79Q5CNX8ICNOELA');
            if (defaultFeat) p = defaultFeat.properties;
        }

        if (!p) {
            alert("No verified property found linked to your Aadhaar account.");
            return;
        }

        window.activeMutationParcelIsOwner = true;
        window.populateCitizenPropertyDropdown(p ? p.ulpin : null);
        window.setMutationModalParcel(p);

        // Reset inputs
        var applicantInput = document.getElementById('mut-applicant-name');
        applicantInput.value = sessionStorage.getItem('landstack_citizen_name') || (p ? p.owner_name : '') || 'Sri K. Rama Rao';
        
        var aadhaarInput = document.getElementById('mut-applicant-aadhaar');
        if (aadhaarInput) aadhaarInput.value = sessionStorage.getItem('landstack_citizen_aadhaar') || '5489 2104 8921';

        document.getElementById('mut-doc-ref').value = '';
        document.getElementById('mut-reason').value = '';
        document.getElementById('mut-form-type').value = 'resurvey';
        window.citizenUploadedFiles = [];
        window.handleMutationTypeChange();
        window.renderCitizenUploadedFilesList();

        window.openModal('modal-citizen-mutation');
    };

    window.setMutationModalParcel = function(p) {
        if (!p) return;
        document.getElementById('mut-form-parcel-id').value = p.id || '';
        document.getElementById('mut-form-ulpin').innerText = p.ulpin || '79Q5CNX8ICNOELA';
        document.getElementById('mut-form-survey').innerText = p.survey_number || '142/2A';
        document.getElementById('mut-form-cur-owner').innerText = p.owner_name || 'Sri K. Rama Rao';
        document.getElementById('mut-form-zone').innerText = 'Zone: ' + formatZoneName(p.zone);
        var areaText = p.dimensions || (p.area_sqft ? (p.area_sqft + ' Sq.Ft (' + Math.round(p.area_sqft / 9 * 10) / 10 + ' Sq.Yds)') : '2,400 Sq.Ft');
        document.getElementById('mut-form-area').innerText = areaText;

        var noticeEl = document.getElementById('mut-ownership-guard-notice');
        if (noticeEl) {
            noticeEl.style.display = 'flex';
            noticeEl.style.alignItems = 'flex-start';
            noticeEl.style.gap = '10px';
            noticeEl.style.background = '#ecfdf5';
            noticeEl.style.border = '1px solid #a7f3d0';
            noticeEl.style.borderLeft = '4px solid #059669';
            noticeEl.style.color = '#065f46';
            noticeEl.innerHTML = `
                <i class="fas fa-shield-alt" style="font-size: 1.15rem; color: #059669; margin-top: 2px;"></i>
                <div>
                    <strong style="color: #065f46; font-size: 0.8rem;">Verified Landowner Account (Aadhaar: ${sessionStorage.getItem('landstack_citizen_aadhaar') || '5489 2104 8921'}):</strong>
                    <div style="font-size: 0.74rem; margin-top: 2px;">You are the authenticated title holder of <strong>${p.lot_number || p.parcel_id || 'this property'}</strong>. You are authorized to apply for DGPS Boundary Demarcation, Resurvey, Family Settlement, or Partition.</div>
                </div>
            `;
        }
    };

    window.populateCitizenPropertyDropdown = function(selectedUlpin) {
        var dropdown = document.getElementById('mut-property-select-dropdown');
        if (!dropdown || !rawGeoJson || !rawGeoJson.features) return;

        var allowedUlpins = window.getCitizenLinkedULPINs();
        var myFeatures = rawGeoJson.features.filter(f => {
            var u = (f.properties.ulpin || '').toUpperCase().trim();
            return allowedUlpins.includes(u);
        });

        dropdown.innerHTML = myFeatures.map((f, idx) => {
            var p = f.properties;
            var isSel = (p.ulpin === selectedUlpin) ? 'selected' : '';
            return `<option value="${p.ulpin}" ${isSel}>Property ${idx + 1}: ${p.lot_number || p.survey_number} (${formatZoneName(p.zone)}) [ULPIN: ${p.ulpin}]</option>`;
        }).join('');

        var countBadge = document.getElementById('badge-linked-properties-count');
        if (countBadge) {
            countBadge.innerText = `${myFeatures.length} Properties Linked`;
        }
    };

    window.handleCitizenPropertyDropdownChange = function(ulpin) {
        if (!ulpin || !rawGeoJson || !rawGeoJson.features) return;
        var feat = rawGeoJson.features.find(f => (f.properties.ulpin || '').toUpperCase().trim() === ulpin.toUpperCase().trim());
        if (feat) {
            window.setMutationModalParcel(feat.properties);
            window.selectAndHighlightParcel(feat.properties.id, true);
        }
    };

    window.viewMyCitizenProperties = function() {
        if (!rawGeoJson || !rawGeoJson.features) {
            var bundled = (typeof window !== 'undefined' && window.PARCELS_GEOJSON && window.PARCELS_GEOJSON.features) ? window.PARCELS_GEOJSON :
                          (typeof window !== 'undefined' && window.parent && window.parent.PARCELS_GEOJSON && window.parent.PARCELS_GEOJSON.features) ? window.parent.PARCELS_GEOJSON : null;
            if (bundled) {
                rawGeoJson = bundled;
                if (!allParcels || allParcels.length === 0) {
                    allParcels = rawGeoJson.features.map(function(f) { return f.properties; });
                }
            } else {
                var toastEl = document.getElementById('toast-notification');
                if (toastEl) {
                    toastEl.textContent = '⏳ Loading cadastral parcel records... Please try in a moment.';
                    toastEl.style.display = 'block';
                    setTimeout(() => { toastEl.style.display = 'none'; }, 3000);
                }
                return;
            }
        }
        var allowedUlpins = window.getCitizenLinkedULPINs();
        var myFeats = rawGeoJson.features.filter(f => allowedUlpins.includes((f.properties.ulpin || '').toUpperCase().trim()));
        
        if (myFeats.length === 0) {
            var fallbackUlpins = ['79Q5CNX8ICNOELA', '79Q5RUS004501'];
            myFeats = rawGeoJson.features.filter(f => fallbackUlpins.includes((f.properties.ulpin || '').toUpperCase().trim()));
        }

        if (myFeats.length === 0) {
            var toastEl = document.getElementById('toast-notification');
            if (toastEl) {
                toastEl.textContent = 'ℹ️ No properties currently linked to your Aadhaar.';
                toastEl.style.display = 'block';
                setTimeout(() => { toastEl.style.display = 'none'; }, 3500);
            }
            return;
        }

        window.currentMyPropIndex = (typeof window.currentMyPropIndex === 'number') ? (window.currentMyPropIndex + 1) % myFeats.length : 0;
        var target = myFeats[window.currentMyPropIndex];
        
        window.selectAndHighlightParcel(target.properties.id, true);
        
        var toastEl = document.getElementById('toast-notification');
        if (toastEl) {
            toastEl.textContent = `📍 Showing Property ${window.currentMyPropIndex + 1} of ${myFeats.length}: ${target.properties.lot_number || target.properties.survey_number} (ULPIN: ${target.properties.ulpin})`;
            toastEl.style.display = 'block';
            setTimeout(() => { toastEl.style.display = 'none'; }, 4500);
        }
    };

    window.handleMutationTypeChange = function() {
        var isOwner = window.activeMutationParcelIsOwner;
        var type = document.getElementById('mut-form-type').value;

        if (!isOwner && type === 'resurvey') {
            alert("⚠️ Statutory Guard (AP RoR Act Section 5):\n\nBoundary Re-Survey and DGPS Demarcation can only be requested by the verified registered landowner.\n\nAs an applicant for a third-party parcel, you may only apply for Title Transfer / Succession with an authorized Registered Sale Deed or Court Decree.");
            document.getElementById('mut-form-type').value = 'sale';
            type = 'sale';
        }

        var lblDoc = document.getElementById('lbl-mut-doc-ref');
        var inputDoc = document.getElementById('mut-doc-ref');

        if (type === 'sale') {
            lblDoc.innerText = 'Registered SRO Sale Deed Number *';
            inputDoc.placeholder = 'e.g. AP-VSP-SRO-2026-04821';
        } else if (type === 'succession') {
            lblDoc.innerText = 'Legal Heir Certificate / Tahsildar Order Ref *';
            inputDoc.placeholder = 'e.g. LEGAL-HEIR-VSP-2026-908';
        } else if (type === 'gift') {
            lblDoc.innerText = 'Registered Gift Settlement Deed Number *';
            inputDoc.placeholder = 'e.g. AP-VSP-GIFT-2026-0112';
        } else if (type === 'partition') {
            lblDoc.innerText = 'Registered Partition Deed / Decree Ref *';
            inputDoc.placeholder = 'e.g. AP-VSP-PART-2026-0045';
        } else if (type === 'court_decree') {
            lblDoc.innerText = 'Hon\'ble Civil Court Suit / Order Number *';
            inputDoc.placeholder = 'e.g. OS-2025-412 / EP-89';
        } else if (type === 'resurvey') {
            lblDoc.innerText = 'FMB / DGPS Demarcation Request Reference *';
            inputDoc.placeholder = 'e.g. SUR-REQ-2026-441';
        }
        window.renderCitizenUploadedFilesList();
    };

    window.handleCitizenFileChange = function(input) {
        if (!input || !input.files || input.files.length === 0) return;
        window.uploadedFileBlobs = window.uploadedFileBlobs || {};

        for (var i = 0; i < input.files.length; i++) {
            (function(file) {
                var sizeMB = (file.size / (1024 * 1024)).toFixed(1);
                var sizeStr = sizeMB > 0 ? `${sizeMB} MB` : `${Math.round(file.size / 1024)} KB`;
                var docId = 'doc-citizen-' + (window.citizenUploadedFiles.length + 1);
                var cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
                var isPdf = file.name.toLowerCase().endsWith('.pdf');

                var reader = new FileReader();
                reader.onload = function(e) {
                    var dataUrl = e.target.result;
                    var docObj = {
                        id: docId,
                        name: cleanName,
                        file_name: file.name,
                        file_size: sizeStr,
                        file_data: dataUrl,
                        file_type: file.type,
                        doc_type: isPdf ? 'pdf_doc' : 'image_doc',
                        ref: 'DOC-UP-' + Math.floor(1000 + Math.random() * 9000),
                        status: 'Uploaded (Pending Officer Scrutiny)',
                        verified: false,
                        icon: isPdf ? 'fa-file-pdf' : 'fa-file-image'
                    };
                    window.citizenUploadedFiles.push(docObj);
                    window.uploadedFileBlobs[file.name] = dataUrl;
                    window.uploadedFileBlobs[docId] = dataUrl;
                    window.saveFileToIndexedDB(file.name, dataUrl, file.name);
                    window.saveFileToIndexedDB(docId, dataUrl, file.name);
                    try {
                        localStorage.setItem('landstack_file_' + file.name, dataUrl);
                        localStorage.setItem('landstack_file_' + docId, dataUrl);
                    } catch (err) {}
                    window.renderCitizenUploadedFilesList();
                };
                reader.readAsDataURL(file);
            })(input.files[i]);
        }
    };

    window.removeCitizenFile = function(index) {
        if (window.citizenUploadedFiles && window.citizenUploadedFiles.length > index) {
            window.citizenUploadedFiles.splice(index, 1);
            window.renderCitizenUploadedFilesList();
        }
    };

    window.renderCitizenUploadedFilesList = function() {
        var container = document.getElementById('mut-uploaded-files-list');
        if (!container) return;

        if (!window.citizenUploadedFiles || window.citizenUploadedFiles.length === 0) {
            var mType = document.getElementById('mut-form-type') ? document.getElementById('mut-form-type').value : 'sale';
            var defaultDocName = 'Registered_Sale_Deed_Doc.pdf';
            var defaultDocTitle = 'Registered Sale Deed Copy';
            if (mType === 'partition') {
                defaultDocName = 'Partition_Settlement_Deed.pdf';
                defaultDocTitle = 'Mutual Partition Settlement Deed';
            } else if (mType === 'succession') {
                defaultDocName = 'Legal_Heir_Family_Tree.pdf';
                defaultDocTitle = 'Legal Heir / Succession Certificate';
            } else if (mType === 'gift') {
                defaultDocName = 'Gift_Settlement_Deed.pdf';
                defaultDocTitle = 'Gift Settlement Deed';
            }

            container.innerHTML = `
                <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-file-pdf" style="color:#dc2626; font-size:1.1rem;"></i>
                        <div>
                            <div style="font-size:0.75rem; font-weight:700; color:#1e293b;">${defaultDocTitle} (${defaultDocName})</div>
                            <div style="font-size:0.68rem; color:#64748b;">Primary Statutory Document (Ready for Officer Scrutiny)</div>
                        </div>
                    </div>
                    <span style="font-size:0.68rem; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:10px; padding:2px 8px; font-weight:700;">Ready</span>
                </div>
            `;
            return;
        }

        container.innerHTML = window.citizenUploadedFiles.map((f, idx) => `
            <div style="background:#ffffff; border:1px solid #86efac; border-radius:6px; padding:6px 10px; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
                    <i class="fas ${f.icon || 'fa-file-pdf'}" style="color:#059669; font-size:1.1rem;"></i>
                    <div style="min-width:0; flex:1;">
                        <div style="font-size:0.75rem; font-weight:700; color:#1e293b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name} (${f.file_name})</div>
                        <div style="font-size:0.68rem; color:#64748b;">${f.file_size} • Ready for Officer Scrutiny</div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:0.68rem; background:#dcfce7; color:#15803d; border:1px solid #86efac; border-radius:10px; padding:2px 6px; font-weight:700;">Attached</span>
                    <button type="button" onclick="removeCitizenFile(${idx})" style="background:transparent; border:none; color:#ef4444; font-size:1rem; cursor:pointer; padding:0 4px; line-height:1;" title="Remove File">&times;</button>
                </div>
            </div>
        `).join('');
    };

    window.submitCitizenMutationApplication = function() {
        var applicantName = (document.getElementById('mut-applicant-name').value || '').trim();
        var phone = (document.getElementById('mut-applicant-phone').value || '').trim();
        var aadhaar = (document.getElementById('mut-applicant-aadhaar').value || '').trim();
        var email = (document.getElementById('mut-applicant-email').value || '').trim();
        var mutationType = document.getElementById('mut-form-type').value;
        var docRef = (document.getElementById('mut-doc-ref').value || '').trim();
        var reason = (document.getElementById('mut-reason').value || '').trim();
        var parcelId = document.getElementById('mut-form-parcel-id').value;
        var ulpin = document.getElementById('mut-form-ulpin').innerText;
        var chkDeclaration = document.getElementById('chk-mut-declaration');

        if (!applicantName) {
            alert('Please enter Applicant Full Name.');
            document.getElementById('mut-applicant-name').focus();
            return;
        }

        var allowedUlpins = window.getCitizenLinkedULPINs();
        var selectedUlpin = (ulpin || '').toUpperCase().trim();
        if (!allowedUlpins.includes(selectedUlpin)) {
            alert("⛔ Statutory Access Violation:\nYou can only submit mutation applications for properties registered to your authenticated Aadhaar (" + (sessionStorage.getItem('landstack_citizen_aadhaar') || '5489 2104 8921') + ").");
            return;
        }

        if (chkDeclaration && !chkDeclaration.checked) {
            alert('Please check the statutory declaration box before submitting.');
            return;
        }

        var submitBtn = document.getElementById('btn-submit-citizen-mutation');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing Token...';
        }

        var payload = {
            parcel_id: parcelId ? parseInt(parcelId) : null,
            ulpin: ulpin,
            applicant_name: applicantName,
            applicant_phone: phone,
            applicant_aadhaar: aadhaar,
            applicant_email: email,
            mutation_type: mutationType,
            deed_reference_no: docRef,
            reason_description: reason,
            uploaded_files: (window.citizenUploadedFiles && window.citizenUploadedFiles.length > 0) ? window.citizenUploadedFiles : null
        };

        fetch('/api/citizen/apply-mutation/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Application & Generate Token';
            }

            if (!data.success) {
                alert('Submission Error: ' + (data.message || 'Unknown error'));
                return;
            }

            window.closeModal('modal-citizen-mutation');

            // Populate acknowledgment receipt
            var app = data.application;
            document.getElementById('ack-app-no').innerText = app.application_no;
            document.getElementById('ack-ulpin').innerText = app.ulpin;
            document.getElementById('ack-applicant-name').innerText = app.applicant_name;
            document.getElementById('ack-mutation-type').innerText = app.mutation_type;

            window.lastGeneratedAppNo = app.application_no;
            if (window.loadOfficerPendingTasks) window.loadOfficerPendingTasks();
            if (window.loadRecentApplicationsChips) window.loadRecentApplicationsChips();

            window.openModal('modal-mutation-receipt');
        })
        .catch(err => {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Application & Generate Token';
            }
            alert('Network error during mutation submission: ' + err);
        });
    };

    window.trackFromReceipt = function() {
        window.closeModal('modal-mutation-receipt');
        window.openTrackingDrawer(window.lastGeneratedAppNo);
    };

    window.loadRecentApplicationsChips = function() {
        var container = document.getElementById('track-recent-chips-container');
        var list = document.getElementById('track-recent-chips-list');
        if (!container || !list) return;

        fetch('/api/citizen/recent-applications/')
        .then(res => res.json())
        .then(data => {
            if (data.success && data.applications && data.applications.length > 0) {
                container.style.display = 'flex';
                list.innerHTML = data.applications.map(a => `
                    <button type="button" class="track-chip-btn" onclick="loadTrackingByNo('${a.application_no}')" title="${a.mutation_type} - ${a.applicant_name}">
                        <i class="fas fa-route" style="color: #2563eb;"></i> ${a.application_no}
                    </button>
                `).join('');
            } else {
                container.style.display = 'none';
                list.innerHTML = '';
            }
        })
        .catch(() => {
            if (container) container.style.display = 'none';
        });
    };

    window.renderTrackingEmptyState = function() {
        var content = document.getElementById('tracking-drawer-content');
        if (!content) return;
        content.innerHTML = `
            <div class="tracking-empty-state" style="text-align: center; padding: 45px 20px; color: #64748b;">
                <div style="width: 56px; height: 56px; border-radius: 50%; background: #eff6ff; color: #2563eb; display: inline-flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 12px; border: 1px solid #bfdbfe;">
                    <i class="fas fa-route"></i>
                </div>
                <h4 style="margin: 0 0 6px 0; color: #0f172a; font-size: 0.95rem;">Live Cadastral Request Tracking</h4>
                <p style="font-size: 0.8rem; color: #64748b; margin: 0 0 16px 0; line-height: 1.4;">
                    Enter your <strong>Application Number</strong> (e.g., <code>MUT-2026-XXXXX</code>) or <strong>ULPIN</strong> above to track lifecycle progress across all 4 stages.
                </p>
                <button type="button" class="btn-modal-primary" onclick="openCitizenMutationModal()" style="padding: 8px 16px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px; margin: 0 auto; background: #059669;">
                    <i class="fas fa-file-invoice"></i> Apply for Land Mutation
                </button>
            </div>
        `;
    };

    window.openTrackingDrawer = function(appNo) {
        document.getElementById('drawer-tracking').style.display = 'flex';
        document.getElementById('drawer-tracking-backdrop').style.display = 'block';
        window.loadRecentApplicationsChips();

        if (appNo) {
            document.getElementById('track-search-input').value = appNo;
            window.loadTrackingByNo(appNo);
        } else {
            var curVal = document.getElementById('track-search-input').value.trim();
            if (curVal) {
                window.loadTrackingByNo(curVal);
            } else if (window.lastGeneratedAppNo) {
                document.getElementById('track-search-input').value = window.lastGeneratedAppNo;
                window.loadTrackingByNo(window.lastGeneratedAppNo);
            } else {
                fetch('/api/citizen/recent-applications/')
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.applications && data.applications.length > 0) {
                        var latest = data.applications[0].application_no;
                        document.getElementById('track-search-input').value = latest;
                        window.loadTrackingByNo(latest);
                    } else {
                        window.renderTrackingEmptyState();
                    }
                })
                .catch(() => window.renderTrackingEmptyState());
            }
        }
    };

    window.closeTrackingDrawer = function() {
        document.getElementById('drawer-tracking').style.display = 'none';
        document.getElementById('drawer-tracking-backdrop').style.display = 'none';
    };

    window.searchTrackApplication = function() {
        var query = (document.getElementById('track-search-input').value || '').trim();
        if (!query) {
            alert('Please enter an Application Number or ULPIN');
            return;
        }
        window.loadTrackingByNo(query);
    };

    window.loadTrackingByNo = function(appNo) {
        if (!appNo) {
            window.renderTrackingEmptyState();
            return;
        }

        var content = document.getElementById('tracking-drawer-content');
        content.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #64748b;">
                <i class="fas fa-spinner fa-spin" style="font-size: 1.6rem; color: #2563eb; margin-bottom: 8px;"></i>
                <p style="font-size: 0.85rem; font-weight:600;">Fetching live lifecycle status for <code>${appNo}</code>...</p>
            </div>
        `;

        fetch('/api/citizen/track-mutation/?app_no=' + encodeURIComponent(appNo))
        .then(res => res.json())
        .then(data => {
            if (!data.success || !data.application) {
                content.innerHTML = `
                    <div style="text-align: center; padding: 40px 20px; color: #dc2626;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 1.8rem; margin-bottom: 8px;"></i>
                        <h4 style="margin: 0 0 6px 0; color: #0f172a;">No Active Mutation Found</h4>
                        <p style="font-size: 0.8rem; color: #64748b; margin-bottom: 14px;">We could not find any active mutation record matching "<strong>${appNo}</strong>".</p>
                        <button type="button" class="btn-modal-primary" style="padding: 7px 14px; font-size: 0.8rem; background: #059669; margin: 0 auto; display: inline-flex; align-items: center; gap: 6px;" onclick="openCitizenMutationModal()">
                            <i class="fas fa-file-invoice"></i> Apply New Mutation
                        </button>
                    </div>
                `;
                return;
            }
            window.renderTrackingDetails(data.application);
        })
        .catch(err => {
            content.innerHTML = `
                <div style="text-align: center; padding: 30px 20px; color: #dc2626;">
                    <i class="fas fa-wifi" style="font-size: 1.6rem; margin-bottom: 6px;"></i>
                    <p style="font-size: 0.82rem;">Network error fetching tracking status: ${err}</p>
                </div>
            `;
        });
    };

    window.renderTrackingDetails = function(app) {
        var content = document.getElementById('tracking-drawer-content');
        var curStage = app.current_stage || 1;

        // Build 4-Stage Stepper HTML
        var stepperHTML = '<div class="stepper-container">';
        app.stages.forEach(function(st, idx) {
            var iconClass = 'fa-check';
            if (st.status === 'in_progress') iconClass = 'fa-spinner fa-spin';
            else if (st.status === 'pending') iconClass = 'fa-circle';

            var isLast = (idx === app.stages.length - 1);
            var lineHTML = isLast ? '' : '<div class="stepper-track-line"></div>';

            stepperHTML += `
                <div class="stepper-step ${st.status}">
                    ${lineHTML}
                    <div class="stepper-icon-wrapper">
                        <i class="fas ${iconClass}"></i>
                    </div>
                    <div class="stepper-content">
                        <div class="step-header">
                            <span class="step-title">Stage ${st.stage}: ${st.name}</span>
                            <span class="step-badge ${st.status}">${st.badge}</span>
                        </div>
                        <div class="step-authority">
                            <i class="fas fa-user-shield" style="color:#2563eb; font-size:0.75rem;"></i> ${st.authority}
                        </div>
                        <div class="step-desc">${st.desc}</div>
                    </div>
                </div>
            `;
        });
        stepperHTML += '</div>';

        // Action Buttons for completed / parcel lookup
        var actionBtnsHTML = '';
        if (app.parcel) {
            actionBtnsHTML += `
                <div style="display: flex; gap: 8px; margin-top: 14px;">
                    <button type="button" class="btn-modal-primary" style="flex: 1; padding: 9px; font-size: 0.8rem; background: #0f2b5c; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="window.highlightParcelFromTracking(${app.parcel.id}, ${app.parcel.latitude}, ${app.parcel.longitude})">
                        <i class="fas fa-crosshairs"></i> Locate on Map
                    </button>
                    ${curStage >= 4 ? `
                    <button type="button" class="btn-modal-primary" style="flex: 1; padding: 9px; font-size: 0.8rem; background: #059669; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="window.openRoRCertificate(${app.parcel.id})">
                        <i class="fas fa-certificate"></i> View Mutated RoR
                    </button>
                    ` : ''}
                </div>
            `;
        }

        // Timeline log items
        var logsHTML = '';
        if (app.timeline_logs && app.timeline_logs.length > 0) {
            logsHTML = `
                <div style="margin-top: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
                    <div style="font-size: 0.78rem; font-weight: 800; color: #0f2b5c; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-history"></i> Statutory Audit Trail & Officer Remarks
                    </div>
                    ${app.timeline_logs.map(log => `
                        <div style="border-left: 2px solid #3b82f6; padding-left: 8px; margin-bottom: 8px; font-size: 0.75rem;">
                            <div style="font-weight: 700; color: #0f172a; display: flex; justify-content: space-between;">
                                <span>${log.title}</span>
                                <span style="font-size: 0.7rem; color: #64748b;">${log.date}</span>
                            </div>
                            <div style="color: #475569; margin-top: 2px;">${log.remarks}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Advance Stage Button for live demonstration
        var demoAdvanceBtn = '';
        if (curStage < 4) {
            demoAdvanceBtn = `
                <button type="button" class="btn-demo-stage" onclick="advanceDemoStage('${app.application_no}')">
                    <i class="fas fa-forward-step"></i> Advance Stage (Demo Sim)
                </button>
            `;
        } else {
            demoAdvanceBtn = `
                <div style="margin-top: 12px; background: #dcfce7; border: 1px solid #86efac; border-radius: 8px; padding: 10px; text-align: center; color: #166534; font-size: 0.8rem; font-weight: 700;">
                    <i class="fas fa-check-double"></i> Stage 4 Completed • Title Mutated on Cadastral Map & Webland 2.0
                </div>
            `;
        }

        content.innerHTML = `
            <!-- Top Summary Card -->
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                    <div>
                        <div style="font-size: 0.95rem; font-weight: 800; color: #065f46; font-family: monospace;">${app.application_no}</div>
                        <div style="font-size: 0.75rem; color: #166534; font-weight: 600;">${app.mutation_type}</div>
                    </div>
                    <span style="font-size: 0.72rem; font-weight: 800; background: #059669; color: #ffffff; padding: 3px 8px; border-radius: 12px;">
                        ${app.status}
                    </span>
                </div>
                <hr style="border: 0; border-top: 1px solid #dcfce7; margin: 6px 0;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 0.78rem; color: #334155;">
                    <div><strong>Applicant:</strong> ${app.applicant_name}</div>
                    <div><strong>ULPIN:</strong> <code style="color:#065f46;">${app.ulpin}</code></div>
                    <div><strong>Phone:</strong> ${app.applicant_phone}</div>
                    <div><strong>SRO Ref:</strong> ${app.deed_reference_no}</div>
                </div>
            </div>

            <!-- SLA Resolution Banner -->
            <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 10px; font-size: 0.75rem; color: #92400e; margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-hourglass-half" style="color: #d97706; font-size: 0.9rem;"></i>
                <div>
                    <strong>DPI SLA Guarantee:</strong> ${app.estimated_completion_date}
                </div>
            </div>

            <!-- Stepper Progress Header -->
            <div style="font-size: 0.82rem; font-weight: 800; color: #0f2b5c; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                <i class="fas fa-tasks"></i> 4-Stage Cadastral Workflow Status
            </div>

            ${stepperHTML}
            ${demoAdvanceBtn}
            ${actionBtnsHTML}
            ${logsHTML}
        `;
    };

    window.advanceDemoStage = function(appNo) {
        fetch('/api/citizen/advance-stage/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ application_no: appNo })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                window.loadTrackingByNo(appNo);
                if (window.loadOfficerPendingTasks) window.loadOfficerPendingTasks();
                loadParcels();
            } else {
                alert('Could not advance stage: ' + data.message);
            }
        })
        .catch(err => {
            alert('Error advancing stage: ' + err);
        });
    };

    // ==========================================

    window.openOfficerApprovalsModal = function(initialTab) {
        if (!isOfficerTabAuthenticated()) {
            window.openModal('modal-officer-auth');
            return;
        }
        window.switchOfficerDeskTab(initialTab || 'surveyor');
        window.loadOfficerPendingTasks();
        window.openModal('modal-officer-approvals');
    };

    window.switchOfficerDeskTab = function(tab) {
        var btnSurv = document.getElementById('tab-btn-surveyor');
        var btnTahs = document.getElementById('tab-btn-tahsildar');
        var panelSurv = document.getElementById('desk-panel-surveyor');
        var panelTahs = document.getElementById('desk-panel-tahsildar');

        if (tab === 'tahsildar') {
            if (btnSurv) {
                btnSurv.classList.remove('active');
                btnSurv.style.background = '#f8fafc';
                btnSurv.style.color = '#64748b';
                btnSurv.style.borderBottom = '3px solid transparent';
            }
            if (btnTahs) {
                btnTahs.classList.add('active');
                btnTahs.style.background = '#ffffff';
                btnTahs.style.color = '#1e40af';
                btnTahs.style.borderBottom = '3px solid #2563eb';
            }
            if (panelSurv) panelSurv.style.display = 'none';
            if (panelTahs) panelTahs.style.display = 'block';
        } else {
            if (btnSurv) {
                btnSurv.classList.add('active');
                btnSurv.style.background = '#ffffff';
                btnSurv.style.color = '#1e40af';
                btnSurv.style.borderBottom = '3px solid #2563eb';
            }
            if (btnTahs) {
                btnTahs.classList.remove('active');
                btnTahs.style.background = '#f8fafc';
                btnTahs.style.color = '#64748b';
                btnTahs.style.borderBottom = '3px solid transparent';
            }
            if (panelSurv) panelSurv.style.display = 'block';
            if (panelTahs) panelTahs.style.display = 'none';
        }
    };

    window.currentScrutinyDoc = null;

    window.loadOfficerPendingTasks = function() {
        fetch('/api/officer/pending-tasks/')
        .then(res => res.json())
        .then(data => {
            if (!data.success) return;

            var survList = document.getElementById('surveyor-tasks-list');
            var tahsList = document.getElementById('tahsildar-tasks-list');
            var badgeTotal = document.getElementById('badge-pending-tasks-count');
            var badgeSurv = document.getElementById('badge-surveyor-tasks-count');
            var badgeTahs = document.getElementById('badge-tahsildar-tasks-count');

            var sCount = (data.counts && data.counts.surveyor_count) || 0;
            var tCount = (data.counts && data.counts.tahsildar_count) || 0;
            var totalCount = sCount + tCount;

            if (badgeTotal) badgeTotal.textContent = totalCount;
            if (badgeSurv) badgeSurv.textContent = sCount;
            if (badgeTahs) badgeTahs.textContent = tCount;

            // Helper to render attached documents with Scrutiny buttons
            function renderTaskDocs(taskDocs, appNo) {
                if (!taskDocs || taskDocs.length === 0) return '';
                window.allTaskDocuments = window.allTaskDocuments || {};
                window.uploadedFileBlobs = window.uploadedFileBlobs || {};
                taskDocs.forEach(function(d) {
                    if (d.id) window.allTaskDocuments[d.id] = d;
                    if (d.file_name) window.allTaskDocuments[d.file_name] = d;
                    if (appNo && d.id) window.allTaskDocuments[appNo + '_' + d.id] = d;
                    if (d.file_data) {
                        window.uploadedFileBlobs[d.file_name] = d.file_data;
                        window.uploadedFileBlobs[d.id] = d.file_data;
                    }
                });
                return `
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; margin:8px 0;">
                        <div style="font-size:0.72rem; font-weight:700; color:#475569; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                            <span><i class="fas fa-paperclip"></i> Attached Statutory Documents (${taskDocs.length})</span>
                            <span style="font-size:0.68rem; color:#64748b;">Manual Scrutiny Required</span>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:5px;">
                            ${taskDocs.map(d => {
                                var isVer = (d.verified === true || d.status === 'Attached from Webland Cadastre' || (d.status && d.status.includes('Verified')));
                                var dType = d.doc_type || 'generic';
                                var dId = d.id || 'doc';
                                var dName = d.name || 'Statutory Document';
                                var fName = d.file_name || 'Document.pdf';
                                var dRef = d.ref || appNo;

                                var safeName = encodeURIComponent(dName);
                                var safeFile = encodeURIComponent(fName);
                                var safeRef = encodeURIComponent(dRef);

                                return `
                                    <div style="background:#ffffff; border:1px solid ${isVer ? '#86efac' : '#cbd5e1'}; border-radius:5px; padding:6px 8px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                                        <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
                                            <i class="fas ${d.icon || 'fa-file-pdf'}" style="color:${isVer ? '#15803d' : '#2563eb'}; font-size:1.1rem; flex-shrink:0;"></i>
                                            <div style="min-width:0; flex:1;">
                                                <div style="font-size:0.74rem; font-weight:700; color:#1e293b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                                    ${dName}
                                                </div>
                                                <div style="font-size:0.68rem; color:#64748b; font-family:monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                                    ${fName} (${d.file_size || '1.5 MB'}) • Ref: <strong>${dRef}</strong>
                                                </div>
                                            </div>
                                        </div>
                                        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                                            ${isVer ? `
                                                <span style="font-size:0.68rem; background:#dcfce7; color:#15803d; border:1px solid #86efac; border-radius:4px; padding:2px 8px; font-weight:700; display:flex; align-items:center; gap:4px;">
                                                    <i class="fas fa-check-circle"></i> Verified
                                                </span>
                                            ` : `
                                                <button type="button" class="btn-modal-secondary" style="padding:4px 8px; font-size:0.7rem; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px; border-radius:4px;" onclick="window.openDocumentScrutiny('${appNo}', '${dId}', '${dType}', decodeURIComponent('${safeName}'), decodeURIComponent('${safeFile}'), decodeURIComponent('${safeRef}'))">
                                                    <i class="fas fa-search-plus"></i> Scrutinize & Verify
                                                </button>
                                            `}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }

            // Render Surveyor Tasks (Stage 2)
            if (survList) {
                if (!data.surveyor_tasks || data.surveyor_tasks.length === 0) {
                    survList.innerHTML = `
                        <div style="text-align:center; padding:30px; color:#64748b; background:#fff; border-radius:8px; border:1px dashed #cbd5e1;">
                            <i class="fas fa-check-circle" style="font-size:1.8rem; color:#10b981; margin-bottom:8px;"></i>
                            <h4 style="margin:0 0 4px 0; color:#0f172a;">All Surveyor Demarcation Tasks Cleared</h4>
                            <p style="font-size:0.78rem; margin:0;">No pending Stage 2 mutation applications requiring field inspection.</p>
                        </div>
                    `;
                } else {
                    survList.innerHTML = data.surveyor_tasks.map(task => {
                        var docsHTML = renderTaskDocs(task.attached_documents, task.application_no);

                        return `
                            <div class="officer-task-card" style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:14px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                                    <div>
                                        <div style="display:flex; align-items:center; gap:8px;">
                                            <span style="font-size:0.95rem; font-weight:800; font-family:monospace; color:#1e40af;">${task.application_no}</span>
                                            <span style="font-size:0.7rem; font-weight:700; background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:12px;">Stage 2: Field Demarcation</span>
                                        </div>
                                        <div style="font-size:0.78rem; color:#334155; margin-top:2px;">
                                            <strong>Applicant:</strong> ${task.applicant_name} • <strong>ULPIN:</strong> <code>${task.ulpin}</code>
                                        </div>
                                    </div>
                                    <span style="font-size:0.72rem; color:#64748b;">${task.created_at}</span>
                                </div>
                                
                                <div style="font-size:0.76rem; color:#475569; background:#f8fafc; padding:8px 10px; border-radius:6px; margin-bottom:8px;">
                                    <strong>Service / Ground:</strong> ${task.mutation_type} • ${task.reason_description}
                                </div>
                                
                                ${docsHTML}

                                <div style="display:grid; grid-template-columns: 2fr 1fr; gap:8px; margin-top:10px;">
                                    <div>
                                        <input type="text" id="surv-remarks-${task.application_no}" placeholder="Enter Surveyor Inspection Remarks..." value="DGPS RTK Survey Demarcation verified with ±1.8 cm precision. Zero boundary overlap with Sy. ${task.survey_number} neighbors." style="width:100%; padding:6px 10px; font-size:0.78rem; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;">
                                    </div>
                                    <div>
                                        <input type="text" id="surv-drone-ref-${task.application_no}" placeholder="Drone Flight Ref" value="DRONE-VSP-2026-F801" style="width:100%; padding:6px 10px; font-size:0.78rem; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;">
                                    </div>
                                </div>

                                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:8px; border-top:1px dashed #e2e8f0;">
                                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                        ${task.parcel_id ? `
                                        <button type="button" class="btn-modal-secondary" style="padding:5px 10px; font-size:0.74rem;" onclick="window.closeModal('modal-officer-approvals'); window.selectAndHighlightParcel(${task.parcel_id}, true);">
                                            <i class="fas fa-crosshairs"></i> Inspect Parcel
                                        </button>
                                        <button type="button" class="btn-modal-secondary" style="padding:5px 10px; font-size:0.74rem; background:#f0fdf4; color:#15803d; border:1px solid #86efac; font-weight:700;" onclick="window.initiateSubdivisionFromSurveyorTask('${task.application_no}', ${task.parcel_id});" title="Execute Turf.js Pothissing polygon cut for this parcel">
                                            <i class="fas fa-cut"></i> Execute Pothissing
                                        </button>
                                        <button type="button" class="btn-modal-secondary" style="padding:5px 10px; font-size:0.74rem; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;" onclick="window.closeModal('modal-officer-approvals'); window.openDroneDGPSModal(${task.parcel_id});">
                                            <i class="fas fa-satellite-dish"></i> Drone Ingestion
                                        </button>
                                        ` : ''}
                                    </div>
                                    <button type="button" class="btn-modal-primary" style="padding:6px 14px; font-size:0.78rem; background:#d97706; border:none;" onclick="submitSurveyorApproval('${task.application_no}')">
                                        <i class="fas fa-check"></i> Approve Demarcation & Forward to Tahsildar (Stage 3)
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }

            // Render Tahsildar Tasks (Stage 3)
            if (tahsList) {
                if (!data.tahsildar_tasks || data.tahsildar_tasks.length === 0) {
                    tahsList.innerHTML = `
                        <div style="text-align:center; padding:30px; color:#64748b; background:#fff; border-radius:8px; border:1px dashed #cbd5e1;">
                            <i class="fas fa-check-double" style="font-size:1.8rem; color:#10b981; margin-bottom:8px;"></i>
                            <h4 style="margin:0 0 4px 0; color:#0f172a;">All Statutory Orders Signed</h4>
                            <p style="font-size:0.78rem; margin:0;">No pending Stage 3 mutation applications requiring Tahsildar digital signature.</p>
                        </div>
                    `;
                } else {
                    tahsList.innerHTML = data.tahsildar_tasks.map(task => {
                        var tahsDocsHTML = renderTaskDocs(task.attached_documents, task.application_no);

                        return `
                            <div class="officer-task-card" style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:14px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                                    <div>
                                        <div style="display:flex; align-items:center; gap:8px;">
                                            <span style="font-size:0.95rem; font-weight:800; font-family:monospace; color:#1e40af;">${task.application_no}</span>
                                            <span style="font-size:0.7rem; font-weight:700; background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:12px;">Stage 3: Tahsildar Statutory Signoff</span>
                                        </div>
                                        <div style="font-size:0.78rem; color:#334155; margin-top:2px;">
                                            <strong>Transferee / Applicant:</strong> ${task.applicant_name} • <strong>Previous Owner:</strong> ${task.current_owner}
                                        </div>
                                    </div>
                                    <span style="font-size:0.72rem; color:#64748b;">${task.created_at}</span>
                                </div>

                                <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:8px 10px; font-size:0.76rem; color:#166534; margin-bottom:8px;">
                                    <div><i class="fas fa-certificate"></i> <strong>Surveyor Demarcation Remarks:</strong> ${task.surveyor_remarks || 'DGPS survey inspection verified and approved with 0 boundary discrepancies.'}</div>
                                    <div style="margin-top:3px;"><i class="fas fa-satellite-dish"></i> <strong>Drone/DGPS Ref:</strong> <code>${task.drone_survey_ref || 'DRONE-VSP-2026-F801'}</code> • <strong>15-Day Public Notice:</strong> <span style="font-weight:700;">Completed (0 Objections)</span></div>
                                </div>

                                ${tahsDocsHTML}

                                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:8px; border-top:1px dashed #e2e8f0;">
                                    <div>
                                        ${task.parcel_id ? `
                                        <button type="button" class="btn-modal-secondary" style="padding:5px 10px; font-size:0.74rem;" onclick="window.closeModal('modal-officer-approvals'); window.selectAndHighlightParcel(${task.parcel_id}, true);">
                                            <i class="fas fa-crosshairs"></i> Inspect Parcel on Map
                                        </button>
                                        ` : ''}
                                    </div>
                                    <button type="button" class="btn-modal-primary" style="padding:6px 14px; font-size:0.78rem; background:#059669; border:none;" onclick="submitTahsildarApproval('${task.application_no}')">
                                        <i class="fas fa-signature"></i> Digitally Sign & Execute Webland 2.0 RoR Mutation (Stage 4)
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }
        })
        .catch(err => console.error('Error loading officer pending tasks:', err));
    };

    window.generateOfficialDocumentSVG = function(docType, docName, fileName, docRef, appNo) {
        var cleanDocName = (docName || 'STATUTORY REVENUE CERTIFICATE').toUpperCase();
        var cleanRef = docRef || ('DOC-REF-2026-' + Math.floor(1000 + Math.random() * 9000));
        var cleanApp = appNo || 'MUT-2026-000123';
        var cleanFile = fileName || 'Uploaded_Document.pdf';

        var scheduleTitle = 'OFFICIAL REGISTER PARTICULARS &amp; CERTIFICATION SCHEDULE';
        var row1Label = 'Instrument Name / Form';
        var row1Val = docName || 'Statutory Revenue Proof';
        var row2Label = 'Applicant / Party Identity';
        var row2Val = 'Biometric KYC Token Verified (Aadhaar Seeded)';
        var row3Label = 'Cadastral Schedule / Survey';
        var row3Val = 'Survey No. 142/2A • Madhurawada / Chinna Waltair';
        var row4Label = 'Issuing Authority / Seal';
        var row4Val = 'Sub-Registrar &amp; Mandal Revenue Officer, AP';

        if (docType === 'death_cert' || (cleanDocName.includes('DEATH'))) {
            row1Label = 'Deceased Individual';
            row1Val = 'Late K. Ramachandra Murthy (Aadhaar: XXXX-XXXX-4102)';
            row2Label = 'Date &amp; Place of Demise';
            row2Val = '02-Dec-2025 • Visakhapatnam Urban (Ward 14)';
            row3Label = 'Registration Section';
            row3Val = 'Sec 12/17 Births &amp; Deaths Act, 1969 (Reg: 14-Dec-2025)';
            row4Label = 'Succession Status';
            row4Val = 'Zero Rival Claims • Forwarded to Mandal Surveyor';
        } else if (docType === 'legal_heir' || (cleanDocName.includes('HEIR'))) {
            row1Label = 'Head of Family / Predecessor';
            row1Val = 'Late K. Ramachandra Murthy';
            row2Label = 'Confirmed Class-1 Heirs';
            row2Val = '1. K. Venkata Rao (Son, 50%) • 2. K. Lakshmi (Daughter, 50%)';
            row3Label = 'Aadhaar Biometric KYC';
            row3Val = 'K. Venkata Rao (XXXX-8921) • K. Lakshmi (XXXX-6532)';
            row4Label = 'Tahsildar Inquiry Order';
            row4Val = 'Spot Inquiry Passed by Revenue Inspector &amp; VRO';
        } else if (docType === 'partition_deed' || (cleanDocName.includes('PARTITION'))) {
            row1Label = 'Partition Instrument Ref';
            row1Val = cleanRef;
            row2Label = 'Partitioning Co-Owners';
            row2Val = 'K. Venkata Rao (175 Sq.Yds) &amp; K. Lakshmi (175 Sq.Yds)';
            row3Label = 'Cadastral Division';
            row3Val = 'Sub-Plot 1 (North-East) &amp; Sub-Plot 2 (South-West)';
            row4Label = 'SRO Registration';
            row4Val = 'Registered at SRO Visakhapatnam Urban (Ward 14)';
        }

        var svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 850 1150" width="850" height="1150" style="background:#ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <defs>
    <linearGradient id="hdrGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e3a8a"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
    <pattern id="secWatermark" width="220" height="220" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <text x="15" y="110" font-size="13" fill="#1e3a8a" fill-opacity="0.04" font-weight="bold">ANDHRA PRADESH LANDSTACK</text>
    </pattern>
  </defs>

  <!-- Border Frame -->
  <rect x="15" y="15" width="820" height="1120" rx="8" fill="#ffffff" stroke="#1e3a8a" stroke-width="3"/>
  <rect x="25" y="25" width="800" height="1100" rx="4" fill="none" stroke="#cbd5e1" stroke-width="1.2" stroke-dasharray="5,5"/>
  <rect x="25" y="25" width="800" height="1100" fill="url(#secWatermark)"/>

  <!-- Top Header Band -->
  <path d="M 25 25 L 825 25 L 825 125 L 25 125 Z" fill="url(#hdrGrad)"/>
  
  <circle cx="85" cy="75" r="32" fill="#ffffff" opacity="0.2"/>
  <text x="85" y="85" font-size="28" fill="#ffffff" text-anchor="middle">🏛️</text>

  <text x="440" y="58" font-size="20" font-weight="900" fill="#ffffff" letter-spacing="1.5" text-anchor="middle">GOVERNMENT OF ANDHRA PRADESH</text>
  <text x="440" y="82" font-size="13" font-weight="600" fill="#bfdbfe" text-anchor="middle">REVENUE &amp; REGISTRATION DEPARTMENT • VISAKHAPATNAM DISTRICT</text>
  <text x="440" y="104" font-size="11" font-weight="500" fill="#93c5fd" letter-spacing="1" text-anchor="middle">NATIONAL LANDSTACK DPI • FORM 6 STATUTORY E-CERTIFICATE</text>

  <!-- Title Badge -->
  <rect x="75" y="150" width="700" height="42" rx="6" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1.5"/>
  <text x="425" y="177" font-size="15" font-weight="800" fill="#0f172a" text-anchor="middle" letter-spacing="0.5">${cleanDocName}</text>

  <!-- Metadata Grid -->
  <rect x="75" y="210" width="700" height="128" rx="6" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
  
  <text x="95" y="240" font-size="12" font-weight="700" fill="#475569">Application No / Token:</text>
  <text x="270" y="240" font-size="12" font-weight="800" fill="#1e40af" font-family="monospace">${cleanApp}</text>
  
  <text x="475" y="240" font-size="12" font-weight="700" fill="#475569">Doc Reference ID:</text>
  <text x="610" y="240" font-size="12" font-weight="800" fill="#0f172a" font-family="monospace">${cleanRef}</text>

  <text x="95" y="275" font-size="12" font-weight="700" fill="#475569">Uploaded Attachment:</text>
  <text x="270" y="275" font-size="12" font-weight="600" fill="#059669">${cleanFile}</text>

  <text x="475" y="275" font-size="12" font-weight="700" fill="#475569">Registry Timestamp:</text>
  <text x="610" y="275" font-size="12" font-weight="600" fill="#334155">04-Sep-2026 09:30 PM</text>

  <text x="95" y="310" font-size="12" font-weight="700" fill="#475569">Jurisdiction / SRO:</text>
  <text x="270" y="310" font-size="12" font-weight="600" fill="#334155">Visakhapatnam Urban (Ward 14)</text>

  <text x="475" y="310" font-size="12" font-weight="700" fill="#475569">Verification Status:</text>
  <text x="610" y="310" font-size="12" font-weight="800" fill="#15803d">✓ STATUTORY AUTHENTIC</text>

  <!-- Main Particulars Table -->
  <rect x="75" y="358" width="700" height="345" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
  <rect x="75" y="358" width="700" height="35" rx="6" fill="#f1f5f9"/>
  <text x="95" y="381" font-size="13" font-weight="800" fill="#1e3a8a">${scheduleTitle}</text>

  <text x="95" y="420" font-size="11.5" font-weight="500" fill="#334155">This document certifies the statutory record and official verification under the AP Land Administration DPI.</text>

  <!-- Inner Data Table -->
  <rect x="95" y="440" width="660" height="195" rx="4" fill="#fafafa" stroke="#e2e8f0" stroke-width="1"/>
  <rect x="95" y="440" width="660" height="30" fill="#e2e8f0"/>
  <text x="110" y="460" font-size="11" font-weight="700" fill="#1e293b">S.No</text>
  <text x="160" y="460" font-size="11" font-weight="700" fill="#1e293b">Schedule Attribute</text>
  <text x="360" y="460" font-size="11" font-weight="700" fill="#1e293b">Recorded Value / Statutory Extract</text>
  <text x="620" y="460" font-size="11" font-weight="700" fill="#1e293b">Verification</text>

  <text x="115" y="495" font-size="11" fill="#475569">1</text>
  <text x="160" y="495" font-size="11" font-weight="600" fill="#0f172a">${row1Label}</text>
  <text x="360" y="495" font-size="11" fill="#334155">${row1Val}</text>
  <text x="620" y="495" font-size="11" font-weight="700" fill="#15803d">CONFIRMED</text>

  <text x="115" y="535" font-size="11" fill="#475569">2</text>
  <text x="160" y="535" font-size="11" font-weight="600" fill="#0f172a">${row2Label}</text>
  <text x="360" y="535" font-size="11" fill="#334155">${row2Val}</text>
  <text x="620" y="535" font-size="11" font-weight="700" fill="#15803d">MATCHED</text>

  <text x="115" y="575" font-size="11" fill="#475569">3</text>
  <text x="160" y="575" font-size="11" font-weight="600" fill="#0f172a">${row3Label}</text>
  <text x="360" y="575" font-size="11" fill="#334155">${row3Val}</text>
  <text x="620" y="575" font-size="11" font-weight="700" fill="#15803d">CONSISTENT</text>

  <text x="115" y="615" font-size="11" fill="#475569">4</text>
  <text x="160" y="615" font-size="11" font-weight="600" fill="#0f172a">${row4Label}</text>
  <text x="360" y="615" font-size="11" fill="#334155">${row4Val}</text>
  <text x="620" y="615" font-size="11" font-weight="700" fill="#15803d">VALIDATED</text>

  <text x="95" y="670" font-size="10.5" font-style="italic" fill="#64748b">Statutory Note: Scrutinized by designated revenue officer under Section 5 of the AP Rights in Land and Pattadar Passbooks Act.</text>

  <!-- Security Seal & QR Code Block -->
  <rect x="75" y="720" width="700" height="230" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1"/>
  
  <rect x="95" y="740" width="100" height="100" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1"/>
  <rect x="105" y="750" width="80" height="80" fill="#1e293b"/>
  <rect x="115" y="760" width="60" height="60" fill="#ffffff"/>
  <rect x="125" y="770" width="40" height="40" fill="#1e293b"/>
  <text x="145" y="855" font-size="9" font-weight="700" fill="#475569" text-anchor="middle">SCAN DPI QR</text>

  <text x="215" y="760" font-size="11" font-weight="700" fill="#1e3a8a">CRYPTOGRAPHIC VERIFICATION BLOCK</text>
  <text x="215" y="780" font-size="10" font-weight="500" fill="#64748b">Digital Token:</text>
  <text x="300" y="780" font-size="10" font-weight="700" fill="#0f172a" font-family="monospace">AP-REV-DPI-2026-98124-SHA256</text>
  <text x="215" y="800" font-size="10" font-weight="500" fill="#64748b">Digital Hash:</text>
  <text x="300" y="800" font-size="10" font-weight="700" fill="#0f172a" font-family="monospace">8f9ba12c4e5d6789b0123456789abcdef</text>
  <text x="215" y="820" font-size="10" font-weight="500" fill="#64748b">Signer Cert:</text>
  <text x="300" y="820" font-size="10" font-weight="700" fill="#059669">Class-3 e-Sign (NIC Gov CA) • Verified</text>

  <!-- Red Wax Seal -->
  <circle cx="680" cy="810" r="50" fill="#fef2f2" stroke="#dc2626" stroke-width="2.5" stroke-dasharray="6,3"/>
  <circle cx="680" cy="810" r="42" fill="none" stroke="#dc2626" stroke-width="1"/>
  <text x="680" y="795" font-size="8" font-weight="800" fill="#dc2626" text-anchor="middle">GOVT OF AP</text>
  <text x="680" y="812" font-size="10" font-weight="900" fill="#dc2626" text-anchor="middle">OFFICIAL</text>
  <text x="680" y="828" font-size="8" font-weight="800" fill="#dc2626" text-anchor="middle">REVENUE SEAL</text>

  <!-- Signatures Line -->
  <line x1="75" y1="980" x2="775" y2="980" stroke="#cbd5e1" stroke-width="1"/>
  
  <text x="95" y="1010" font-size="11" font-weight="700" fill="#1e3a8a">COMPETENT REVENUE AUTHORITY</text>
  <text x="95" y="1028" font-size="10" fill="#64748b">Office of the Tahsildar &amp; Mandal Revenue Officer</text>
  <text x="95" y="1044" font-size="10" fill="#059669" font-weight="700">✓ Digitally Signed &amp; Approved under AP e-Governance</text>

  <text x="755" y="1010" font-size="11" font-weight="700" fill="#1e3a8a" text-anchor="end">SUB-REGISTRAR OFFICE (SRO)</text>
  <text x="755" y="1028" font-size="10" fill="#64748b" text-anchor="end">Registration &amp; Stamps Department</text>
  <text x="755" y="1044" font-size="10" fill="#15803d" font-weight="700" text-anchor="end">✓ Certified Copy from Central LandStack Repository</text>

  <text x="425" y="1090" font-size="10" fill="#94a3b8" text-anchor="middle">This is a system generated statutory extract for official officer scrutiny under SIH26014 National LandStack DPI.</text>
</svg>`;
        return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
    };

    window.scrutinyZoom = 1.0;
    window.scrutinyRotate = 0;

    window.applyScrutinyTransform = function() {
        var img = document.getElementById('scrutiny-img-element');
        if (img) {
            img.style.transform = `scale(${window.scrutinyZoom}) rotate(${window.scrutinyRotate}deg)`;
        }
    };

    window.zoomScrutinyImage = function(delta) {
        window.scrutinyZoom = Math.max(0.3, Math.min(3.5, window.scrutinyZoom + delta));
        window.applyScrutinyTransform();
    };

    window.rotateScrutinyImage = function() {
        window.scrutinyRotate = (window.scrutinyRotate + 90) % 360;
        window.applyScrutinyTransform();
    };

    window.resetScrutinyImage = function() {
        window.scrutinyZoom = 1.0;
        window.scrutinyRotate = 0;
        window.applyScrutinyTransform();
    };

    window.openScrutinyFileNewTab = function() {
        var doc = window.currentScrutinyDoc || {};
        var fileData = doc.fileData;
        var fileName = doc.fileName || doc.docName || 'Document';

        if (!fileData) {
            fileData = window.generateOfficialDocumentSVG(doc.docType, doc.docName, doc.fileName, doc.docRef, doc.appNo);
        }

        var w = window.open("", "_blank");
        if (w) {
            if (fileData.startsWith('data:application/pdf') || (fileName.toLowerCase().endsWith('.pdf') && !fileData.startsWith('data:image'))) {
                w.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>${fileName} - Official LandStack Scrutiny Document</title>
    <style>
        body { margin: 0; padding: 0; background: #0f172a; font-family: -apple-system, sans-serif; display: flex; flex-direction: column; height: 100vh; }
        .bar { background: #1e293b; color: #fff; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; }
        iframe { flex: 1; border: none; width: 100%; height: 100%; }
        button { background: #2563eb; color: #fff; border: none; padding: 6px 14px; border-radius: 4px; font-weight: 700; cursor: pointer; }
    </style>
</head>
<body>
    <div class="bar">
        <span>📄 <strong>${fileName}</strong> • Ref: ${doc.docRef || 'DOC-2026'}</span>
        <div>
            <button onclick="window.print()">🖨️ Print Document</button>
            <button onclick="window.close()" style="background:#475569; margin-left:8px;">Close</button>
        </div>
    </div>
    <iframe src="${fileData}"></iframe>
</body>
</html>`);
            } else {
                w.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>${fileName} - Official LandStack Scrutiny Document</title>
    <style>
        body { margin: 0; padding: 0; background: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; min-height: 100vh; }
        .topbar { background: #1e293b; color: #f8fafc; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #3b82f6; position: sticky; top: 0; z-index: 100; }
        .viewer { flex: 1; display: flex; justify-content: center; align-items: center; padding: 24px; }
        .viewer img { max-width: 92vw; max-height: 88vh; object-fit: contain; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.6); background: #ffffff; }
        .btn { background: #2563eb; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px; }
        .btn:hover { background: #1d4ed8; }
        .btn-sec { background: #475569; }
        .btn-sec:hover { background: #334155; }
    </style>
</head>
<body>
    <div class="topbar">
        <div>
            <span style="font-size: 1.1rem; font-weight: 800; color: #60a5fa;">🏛️ AP LandStack DPI</span>
            <span style="margin: 0 8px; color: #64748b;">|</span>
            <strong style="color: #ffffff;">${fileName}</strong>
            <span style="font-size: 0.8rem; color: #94a3b8; margin-left: 8px; font-family: monospace;">(App: ${doc.appNo || 'MUT-2026'})</span>
        </div>
        <div style="display: flex; gap: 8px;">
            <button class="btn" onclick="window.print()">🖨️ Print / Save PDF</button>
            <button class="btn btn-sec" onclick="window.close()">✕ Close Window</button>
        </div>
    </div>
    <div class="viewer">
        <img src="${fileData}" alt="${fileName}" />
    </div>
</body>
</html>`);
            }
        }
    };

    window.switchScrutinyViewTab = function(tab) {
        var panelFile = document.getElementById('scrutiny-panel-file');
        var panelExt = document.getElementById('scrutiny-panel-extract');
        var btnFile = document.getElementById('btn-scrutiny-tab-file');
        var btnExt = document.getElementById('btn-scrutiny-tab-extract');

        if (tab === 'extract') {
            if (panelFile) panelFile.style.display = 'none';
            if (panelExt) panelExt.style.display = 'block';
            if (btnFile) {
                btnFile.style.borderColor = '#cbd5e1';
                btnFile.style.background = '#ffffff';
                btnFile.style.color = '#64748b';
            }
            if (btnExt) {
                btnExt.style.borderColor = '#2563eb';
                btnExt.style.background = '#eff6ff';
                btnExt.style.color = '#1e40af';
            }
        } else {
            if (panelFile) panelFile.style.display = 'block';
            if (panelExt) panelExt.style.display = 'none';
            if (btnFile) {
                btnFile.style.borderColor = '#2563eb';
                btnFile.style.background = '#eff6ff';
                btnFile.style.color = '#1e40af';
            }
            if (btnExt) {
                btnExt.style.borderColor = '#cbd5e1';
                btnExt.style.background = '#ffffff';
                btnExt.style.color = '#64748b';
            }
        }
    };

    window.handleManualScrutinyFileUpload = function(input) {
        if (!input || !input.files || input.files.length === 0) return;
        var file = input.files[0];
        var sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        var sizeStr = sizeMB > 0 ? `${sizeMB} MB` : `${Math.round(file.size / 1024)} KB`;
        var isPdf = file.name.toLowerCase().endsWith('.pdf');

        var reader = new FileReader();
        reader.onload = function(e) {
            var dataUrl = e.target.result;
            
            if (window.currentScrutinyDoc) {
                window.currentScrutinyDoc.fileData = dataUrl;
                window.currentScrutinyDoc.fileName = file.name;
            }

            window.saveFileToIndexedDB(file.name, dataUrl, file.name);
            if (window.currentScrutinyDoc && window.currentScrutinyDoc.docId) {
                window.saveFileToIndexedDB(window.currentScrutinyDoc.docId, dataUrl, file.name);
            }

            var headerFileName = document.getElementById('scrutiny-file-name-header');
            var headerFileSize = document.getElementById('scrutiny-file-size-badge');
            var headerFileIcon = document.getElementById('scrutiny-file-icon');
            var elFile = document.getElementById('scrutiny-file-name');

            if (headerFileName) headerFileName.textContent = file.name;
            if (headerFileSize) headerFileSize.textContent = sizeStr;
            if (elFile) elFile.textContent = file.name;
            if (headerFileIcon) {
                headerFileIcon.innerHTML = isPdf ? '<i class="fas fa-file-pdf" style="color:#ef4444;"></i>' : '<i class="fas fa-file-image" style="color:#10b981;"></i>';
            }

            var imgEl = document.getElementById('scrutiny-img-element');
            var iframeEl = document.getElementById('scrutiny-iframe-element');
            var fallbackEl = document.getElementById('scrutiny-fallback-element');

            window.resetScrutinyImage();

            if (isPdf) {
                if (iframeEl) {
                    iframeEl.src = dataUrl;
                    iframeEl.style.display = 'block';
                }
                if (imgEl) imgEl.style.display = 'none';
                if (fallbackEl) fallbackEl.style.display = 'none';
            } else {
                if (imgEl) {
                    imgEl.src = dataUrl;
                    imgEl.style.display = 'block';
                }
                if (iframeEl) iframeEl.style.display = 'none';
                if (fallbackEl) fallbackEl.style.display = 'none';
            }
        };
        reader.readAsDataURL(file);
    };

    window.openDocumentScrutiny = function(appNo, docId, docType, docName, fileName, docRef) {
        window.uploadedFileBlobs = window.uploadedFileBlobs || {};
        window.allTaskDocuments = window.allTaskDocuments || {};

        // 1. Resolve actual uploaded file data URL / Base64 from all caches
        var fileData = null;
        if (window.uploadedFileBlobs) {
            fileData = window.uploadedFileBlobs[fileName] || 
                       window.uploadedFileBlobs[fileName.toLowerCase()] || 
                       window.uploadedFileBlobs[docId] || 
                       window.uploadedFileBlobs[docRef];
        }
        if (!fileData && window.allTaskDocuments) {
            var cached = window.allTaskDocuments[docId] || window.allTaskDocuments[fileName] || window.allTaskDocuments[appNo + '_' + docId];
            if (cached && cached.file_data) {
                fileData = cached.file_data;
            }
        }
        if (!fileData && window.sroCustomFiles) {
            var sroKey = docId.replace('doc-', '');
            if (window.sroCustomFiles[sroKey] && window.sroCustomFiles[sroKey].file_data) {
                fileData = window.sroCustomFiles[sroKey].file_data;
            }
        }
        if (!fileData) {
            try {
                fileData = localStorage.getItem('landstack_file_' + fileName) || localStorage.getItem('landstack_file_' + docId);
            } catch (e) {}
        }

        var isGeneratedFallback = false;
        if (!fileData) {
            fileData = window.generateOfficialDocumentSVG(docType, docName, fileName, docRef, appNo);
            isGeneratedFallback = true;
        }

        window.currentScrutinyDoc = {
            appNo: appNo,
            docId: docId,
            docType: docType,
            docName: docName,
            fileName: fileName,
            docRef: docRef,
            fileData: fileData
        };

        var elApp = document.getElementById('scrutiny-app-no');
        var elFile = document.getElementById('scrutiny-file-name');
        var elRef = document.getElementById('scrutiny-doc-ref');
        var elTitle = document.getElementById('scrutiny-modal-title');
        var elHead = document.getElementById('scrutiny-cert-heading');
        var elToken = document.getElementById('scrutiny-cert-token');
        var elBody = document.getElementById('scrutiny-cert-body');
        var notesInput = document.getElementById('scrutiny-officer-notes');
        var headerFileName = document.getElementById('scrutiny-file-name-header');
        var headerFileSize = document.getElementById('scrutiny-file-size-badge');
        var headerFileIcon = document.getElementById('scrutiny-file-icon');

        if (elApp) elApp.textContent = appNo;
        if (elFile) elFile.textContent = fileName || 'Uploaded_Document.pdf';
        if (elRef) elRef.textContent = docRef || 'DOC-REF-2026';
        if (elTitle) elTitle.textContent = 'Document Scrutiny: ' + (docName || 'Statutory Proof');
        if (elHead) elHead.textContent = (docName || 'STATUTORY REVENUE CERTIFICATE').toUpperCase();
        if (elToken) elToken.textContent = `AP-REV-${docType ? docType.toUpperCase() : 'DOC'}-2026-${Math.floor(10000 + Math.random() * 90000)}`;

        if (headerFileName) headerFileName.textContent = fileName || 'Uploaded_Document.pdf';
        var isPdf = (fileName && fileName.toLowerCase().endsWith('.pdf') && !fileData.startsWith('data:image')) || (fileData && fileData.startsWith('data:application/pdf'));
        var isImage = (fileName && /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(fileName)) || (fileData && fileData.startsWith('data:image'));

        if (headerFileIcon) {
            headerFileIcon.innerHTML = isPdf ? '<i class="fas fa-file-pdf" style="color:#ef4444;"></i>' : (isImage ? '<i class="fas fa-file-image" style="color:#10b981;"></i>' : '<i class="fas fa-file-alt" style="color:#60a5fa;"></i>');
        }

        // Configure viewport display with the document
        var imgEl = document.getElementById('scrutiny-img-element');
        var iframeEl = document.getElementById('scrutiny-iframe-element');
        var fallbackEl = document.getElementById('scrutiny-fallback-element');

        window.resetScrutinyImage();

        if (isPdf) {
            if (iframeEl) {
                iframeEl.src = fileData;
                iframeEl.style.display = 'block';
            }
            if (imgEl) imgEl.style.display = 'none';
            if (fallbackEl) fallbackEl.style.display = 'none';
        } else {
            if (imgEl) {
                imgEl.src = fileData;
                imgEl.style.display = 'block';
            }
            if (iframeEl) iframeEl.style.display = 'none';
            if (fallbackEl) fallbackEl.style.display = 'none';
        }

        // Asynchronously check IndexedDB in case file was stored from another tab/session
        if (isGeneratedFallback) {
            window.getFileFromIndexedDB(fileName).then(function(dbData) {
                if (!dbData) {
                    return window.getFileFromIndexedDB(docId);
                }
                return dbData;
            }).then(function(realData) {
                if (realData && window.currentScrutinyDoc && window.currentScrutinyDoc.docId === docId) {
                    window.currentScrutinyDoc.fileData = realData;
                    var realIsPdf = fileName.toLowerCase().endsWith('.pdf') || realData.startsWith('data:application/pdf');
                    if (realIsPdf) {
                        if (iframeEl) { iframeEl.src = realData; iframeEl.style.display = 'block'; }
                        if (imgEl) imgEl.style.display = 'none';
                    } else {
                        if (imgEl) { imgEl.src = realData; imgEl.style.display = 'block'; }
                        if (iframeEl) iframeEl.style.display = 'none';
                    }
                }
            });
        }

        // Switch to the actual file panel view by default
        window.switchScrutinyViewTab('file');

        if (notesInput) {
            notesInput.value = `Verified uploaded ${fileName || docName} against civil registry and revenue passbook records. Authenticity confirmed.`;
        }

        // Reset verification checkboxes
        var chk1 = document.getElementById('chk-scrutiny-seal');
        var chk2 = document.getElementById('chk-scrutiny-kyc');
        var chk3 = document.getElementById('chk-scrutiny-schedule');
        if (chk1) chk1.checked = true;
        if (chk2) chk2.checked = true;
        if (chk3) chk3.checked = true;

        // Build specific official certificate HTML template based on document type
        var bodyHTML = '';

        if (docType === 'death_cert' || (docName && docName.toLowerCase().includes('death'))) {
            bodyHTML = `
                <div style="background: #fafafa; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.76rem;">
                        <div><strong>Certificate Registration No:</strong> <span style="font-family:monospace; color:#1e40af;">${docRef || 'DC-AP-VSP-2025-0812'}</span></div>
                        <div><strong>Date of Registration:</strong> <span>14-Dec-2025</span></div>
                        <div><strong>Deceased Person:</strong> <span style="font-weight:700; color:#0f172a;">Late K. Ramachandra Murthy</span></div>
                        <div><strong>Deceased Aadhaar:</strong> <code>XXXX-XXXX-4102</code></div>
                        <div><strong>Date of Demise:</strong> <span>02-Dec-2025</span></div>
                        <div><strong>Place of Demise:</strong> <span>Visakhapatnam Urban (Ward 14)</span></div>
                        <div><strong>Cause of Death:</strong> <span>Natural (Age-related ailments)</span></div>
                        <div><strong>Issuing Registrar:</strong> <span>Registrar of Births & Deaths, GVMC</span></div>
                    </div>
                </div>
                <div style="font-size: 0.74rem; color: #475569; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 10px;">
                    <strong>Statutory Finding:</strong> The above death has been legally entered in the District Civil Register of Deaths under Section 12/17 of the Registration of Births and Deaths Act, 1969.
                </div>
            `;
        } else if (docType === 'legal_heir' || (docName && docName.toLowerCase().includes('heir'))) {
            bodyHTML = `
                <div style="background: #fafafa; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                    <div style="font-size: 0.75rem; margin-bottom: 8px;">
                        <strong>Inquiry Order Ref:</strong> <span style="font-family:monospace; color:#1e40af;">${docRef || 'LH-2026-VSP-901'}</span> • <strong>Tahsildar Jurisdiction:</strong> Visakhapatnam Urban
                    </div>
                    <div style="font-size: 0.73rem; color: #334155; margin-bottom: 8px;">
                        Following spot inquiry by Revenue Inspector and Village Revenue Officer, the following class-1 legal heirs are confirmed:
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.73rem; text-align: left;">
                        <thead>
                            <tr style="background: #e2e8f0; color: #1e293b;">
                                <th style="padding: 5px 8px; border: 1px solid #cbd5e1;">#</th>
                                <th style="padding: 5px 8px; border: 1px solid #cbd5e1;">Legal Heir Full Name</th>
                                <th style="padding: 5px 8px; border: 1px solid #cbd5e1;">Relationship</th>
                                <th style="padding: 5px 8px; border: 1px solid #cbd5e1;">Age</th>
                                <th style="padding: 5px 8px; border: 1px solid #cbd5e1;">Aadhaar (Masked)</th>
                                <th style="padding: 5px 8px; border: 1px solid #cbd5e1;">Entitled Share</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="padding: 5px 8px; border: 1px solid #cbd5e1;">1</td>
                                <td style="padding: 5px 8px; border: 1px solid #cbd5e1; font-weight:700;">K. Venkata Rao</td>
                                <td style="padding: 5px 8px; border: 1px solid #cbd5e1;">Son</td>
                                <td style="padding: 5px 8px; border: 1px solid #cbd5e1;">42 Yrs</td>
                                <td style="padding: 5px 8px; border: 1px solid #cbd5e1;"><code>XXXX-XXXX-8921</code></td>
                                <td style="padding: 5px 8px; border: 1px solid #cbd5e1; color:#047857; font-weight:700;">50.0% (175 Sq.Yds)</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 8px; border: 1px solid #cbd5e1;">2</td>
                                <td style="padding: 5px 8px; border: 1px solid #cbd5e1; font-weight:700;">K. Lakshmi</td>
                                <td style="padding: 5px 8px; border: 1px solid #cbd5e1;">Daughter</td>
                                <td style="padding: 5px 8px; border: 1px solid #cbd5e1;">38 Yrs</td>
                                <td style="padding: 5px 8px; border: 1px solid #cbd5e1;"><code>XXXX-XXXX-6532</code></td>
                                <td style="padding: 5px 8px; border: 1px solid #cbd5e1; color:#047857; font-weight:700;">50.0% (175 Sq.Yds)</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div style="font-size: 0.74rem; color: #047857; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 8px 10px;">
                    <i class="fas fa-check-circle"></i> <strong>Genealogy Verified:</strong> Zero rival claims or disputed succession objections received within statutory notice window.
                </div>
            `;
        } else if (docType === 'partition_deed' || (docName && docName.toLowerCase().includes('partition'))) {
            bodyHTML = `
                <div style="background: #fafafa; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.76rem; margin-bottom: 10px;">
                        <div><strong>Registered Deed No:</strong> <span style="font-family:monospace; color:#1e40af;">${docRef || 'PART-AGR-2026-0045'}</span></div>
                        <div><strong>Registration Date:</strong> <span>04-Sep-2026</span></div>
                        <div><strong>SRO Jurisdiction:</strong> <span>SRO Visakhapatnam (Urban)</span></div>
                        <div><strong>Nature of Instrument:</strong> <span>Family Settlement & Cadastral Partition</span></div>
                    </div>
                    <div style="font-size: 0.74rem; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px;">
                        <div style="font-weight:700; color:#1e3a8a; margin-bottom:4px;"><i class="fas fa-map-marked-alt"></i> Partitioned Cadastral Plot Schedule:</div>
                        <div>• <strong>Sub-Plot 1 (North-East Extent):</strong> 175.0 Sq.Yds allotted to <em>K. Venkata Rao</em> (Independent Access Road frontage)</div>
                        <div style="margin-top:2px;">• <strong>Sub-Plot 2 (South-West Extent):</strong> 175.0 Sq.Yds allotted to <em>K. Lakshmi</em> (Demarcated with boundary stones)</div>
                    </div>
                </div>
                <div style="font-size: 0.74rem; color: #1e40af; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 10px;">
                    <i class="fas fa-handshake"></i> <strong>Consensus Statement:</strong> All partitioning parties have executed mutual consent with biometric KYC tokens.
                </div>
            `;
        } else {
            bodyHTML = `
                <div style="background: #fafafa; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.76rem;">
                        <div><strong>Document Reference:</strong> <span style="font-family:monospace; color:#1e40af;">${docRef || 'DOC-AP-2026'}</span></div>
                        <div><strong>Uploaded Document Name:</strong> <span>${fileName || 'Document.pdf'}</span></div>
                        <div><strong>Instrument Category:</strong> <span>${docName || 'Statutory Deed / e-Challan'}</span></div>
                        <div><strong>Issuing Authority:</strong> <span>Registration & Revenue Dept, Govt of AP</span></div>
                        <div><strong>Cadastral Verification:</strong> <span>ULPIN Linked & Coordinates Match Master</span></div>
                        <div><strong>Digital Hash Status:</strong> <span style="color:#059669; font-weight:700;">Verified SHA256 Match</span></div>
                    </div>
                </div>
                <div style="font-size: 0.74rem; color: #047857; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 8px 10px;">
                    <i class="fas fa-file-check"></i> Scanned statutory document received through LandStack DPI portal. Available for officer cross-verification.
                </div>
            `;
        }

        if (elBody) elBody.innerHTML = bodyHTML;

        window.openModal('modal-document-scrutiny');
    };

    window.submitOfficerDocumentScrutiny = function() {
        if (!window.currentScrutinyDoc) {
            alert('No document currently selected for scrutiny.');
            return;
        }

        var chk1 = document.getElementById('chk-scrutiny-seal');
        var chk2 = document.getElementById('chk-scrutiny-kyc');
        var chk3 = document.getElementById('chk-scrutiny-schedule');

        if ((chk1 && !chk1.checked) || (chk2 && !chk2.checked) || (chk3 && !chk3.checked)) {
            alert('Please confirm all 3 verification checklist items before signing off on document scrutiny.');
            return;
        }

        var notesInput = document.getElementById('scrutiny-officer-notes');
        var notes = notesInput ? notesInput.value.trim() : 'Document scrutinized and verified against civil records.';
        var btn = document.getElementById('btn-confirm-doc-verify');

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Recording Verification...';
        }

        fetch('/api/officer/verify-document/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                application_no: window.currentScrutinyDoc.appNo,
                doc_id: window.currentScrutinyDoc.docId,
                remarks: notes
            })
        })
        .then(res => res.json())
        .then(data => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check-double"></i> Mark Document Scrutinized & Verified';
            }

            if (data.success) {
                alert(`✅ ${data.message || 'Document successfully verified and marked scrutinized!'}`);
                window.closeModal('modal-document-scrutiny');
                if (window.loadOfficerPendingTasks) window.loadOfficerPendingTasks();
                var trackDrawer = document.getElementById('drawer-tracking');
                if (trackDrawer && trackDrawer.style.display === 'flex') {
                    window.loadTrackingByNo(window.currentScrutinyDoc.appNo);
                }
            } else {
                alert('Verification Error: ' + (data.message || 'Unknown error'));
            }
        })
        .catch(err => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check-double"></i> Mark Document Scrutinized & Verified';
            }
            alert('Network error during document verification: ' + err);
        });
    };

    window.submitSurveyorApproval = function(appNo) {
        var remarksInput = document.getElementById('surv-remarks-' + appNo);
        var droneRefInput = document.getElementById('surv-drone-ref-' + appNo);
        var remarks = remarksInput ? remarksInput.value : '';
        var droneRef = droneRefInput ? droneRefInput.value : '';

        fetch('/api/officer/approve-task/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                application_no: appNo,
                officer_role: 'surveyor',
                remarks: remarks,
                drone_survey_ref: droneRef
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert(`✅ ${data.message}`);
                window.loadOfficerPendingTasks();
                window.switchOfficerDeskTab('tahsildar');
                var trackDrawer = document.getElementById('drawer-tracking');
                if (trackDrawer && trackDrawer.style.display === 'flex') {
                    window.loadTrackingByNo(appNo);
                }
            } else {
                alert('Approval error: ' + data.message);
            }
        })
        .catch(err => alert('Network error: ' + err));
    };

    window.submitTahsildarApproval = function(appNo) {
        fetch('/api/officer/approve-task/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                application_no: appNo,
                officer_role: 'tahsildar'
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert(`✅ ${data.message}`);
                window.loadOfficerPendingTasks();
                loadParcels();
                var trackDrawer = document.getElementById('drawer-tracking');
                if (trackDrawer && trackDrawer.style.display === 'flex') {
                    window.loadTrackingByNo(appNo);
                }
            } else {
                alert('Approval error: ' + data.message);
            }
        })
        .catch(err => alert('Network error: ' + err));
    };

    // ==========================================
    // MODULE D: DRONE DGPS SHAPEFILE & RTK CADASTRAL INGESTION
    // ==========================================
    window.activeDroneTargetParcelId = null;
    // ==========================================
    // MODULE D: DRONE DGPS SHAPEFILE & RTK CADASTRAL INGESTION
    // ==========================================
    window.activeDroneTargetParcelId = null;
    window.activeDroneCoordinates = null;
    window.dronePreviewLayer = null;

    window.initiateSubdivisionFromSurveyorTask = function(appNo, parcelId) {
        if (!isOfficerTabAuthenticated()) {
            window.openModal('modal-officer-auth');
            return;
        }

        window.closeModal('modal-officer-approvals');
        window.activeMutationTaskForSubdivide = appNo;

        var targetId = parcelId;
        var feature = rawGeoJson ? rawGeoJson.features.find(f => f.properties.id === targetId) : null;
        if (!feature && rawGeoJson && rawGeoJson.features.length > 0) {
            feature = rawGeoJson.features[0];
            targetId = feature.properties.id;
        }

        if (feature) {
            window.selectAndHighlightParcel(targetId, true);
            setTimeout(function() {
                handleParcelSelectedForSplit(feature.properties, feature.geometry.coordinates[0]);
                setToolHint(`[Task ${appNo}] Surveyor Pothissing: Click 2 points across parcel ${feature.properties.lot_number || feature.properties.parcel_id} to cut & bisect.`);
            }, 400);
        } else {
            alert(`Parcel #${parcelId} not found in active cadastre.`);
        }
    };

    function renderDroneGCPTable(coords, accuracyStr) {
        var tbody = document.getElementById('tbody-drone-gcps');
        if (!tbody || !coords) return;
        var pts = coords.slice(0, -1);
        tbody.innerHTML = pts.map((c, i) => `
            <tr style="border-bottom: 1px solid #e2e8f0; ${i % 2 === 0 ? 'background:#f8fafc;' : 'background:#fff;'}">
                <td style="padding: 4px 8px; font-weight: 700; color: #1e40af;">GCP #${i + 1}</td>
                <td style="padding: 4px 8px; color: #0f172a;">${c[0].toFixed(7)}° E</td>
                <td style="padding: 4px 8px; color: #0f172a;">${c[1].toFixed(7)}° N</td>
                <td style="padding: 4px 8px; font-weight: 700; color: #059669;">${accuracyStr || '± 1.2 cm'}</td>
            </tr>
        `).join('');
    }

    function updateDroneAreaDiscrepancy(droneAreaSqft) {
        var targetFeat = rawGeoJson ? rawGeoJson.features.find(f => f.properties.id === window.activeDroneTargetParcelId) : null;
        var deltaBadge = document.getElementById('drone-area-delta-badge');
        if (!deltaBadge) return;

        if (targetFeat && targetFeat.properties && targetFeat.properties.area_sqft) {
            var baseArea = targetFeat.properties.area_sqft;
            var delta = droneAreaSqft - baseArea;
            var pct = (delta / baseArea) * 100;
            var sign = delta >= 0 ? '+' : '';
            var isAcceptable = Math.abs(pct) <= 2.5;

            deltaBadge.innerHTML = `&Delta; ${sign}${delta.toFixed(1)} Sq.Ft (${sign}${pct.toFixed(2)}%) ${isAcceptable ? '<i class="fas fa-check-circle" style="color:#059669;"></i> In Tolerance' : '<i class="fas fa-exclamation-triangle" style="color:#dc2626;"></i> Re-Check'}`;
            deltaBadge.style.background = isAcceptable ? '#dcfce7' : '#fee2e2';
            deltaBadge.style.color = isAcceptable ? '#166534' : '#991b1b';
        } else {
            deltaBadge.textContent = 'Baseline Ready';
        }
    }

    window.filterDroneParcelsByULPIN = function(query) {
        var sel = document.getElementById('drone-target-parcel');
        var countEl = document.getElementById('drone-search-match-count');
        if (!sel || !rawGeoJson || !rawGeoJson.features) return;

        var q = (query || '').trim().toLowerCase();
        var allFeatures = rawGeoJson.features;
        var matched = allFeatures.filter(f => {
            if (!q) return true;
            var p = f.properties;
            var ulpin = (p.ulpin || '').toLowerCase();
            var parcelId = (p.parcel_id || '').toLowerCase();
            var lot = (p.lot_number || '').toLowerCase();
            var survey = (p.survey_number || '').toLowerCase();
            var owner = (p.owner_name || '').toLowerCase();
            return ulpin.includes(q) || parcelId.includes(q) || lot.includes(q) || survey.includes(q) || owner.includes(q);
        });

        if (countEl) {
            countEl.textContent = q ? `${matched.length} of ${allFeatures.length} parcels match` : `${allFeatures.length} parcels available`;
        }

        if (matched.length === 0) {
            sel.innerHTML = `<option value="">No parcel found matching "${query}"</option>`;
            return;
        }

        var currentSelectedId = window.activeDroneTargetParcelId;
        var isCurrentStillMatched = matched.some(f => f.properties.id === currentSelectedId);

        sel.innerHTML = matched.map((f, idx) => {
            var p = f.properties;
            var isSel = isCurrentStillMatched ? (p.id === currentSelectedId) : (idx === 0);
            return `<option value="${p.id}" ${isSel ? 'selected' : ''}>${p.ulpin ? '[' + p.ulpin + '] ' : ''}${p.lot_number || p.parcel_id} - ${p.owner_name || 'Owner'} (${p.survey_number || 'Sy. No.'})</option>`;
        }).join('');

        var newTargetId = isCurrentStillMatched ? currentSelectedId : matched[0].properties.id;
        window.activeDroneTargetParcelId = newTargetId;
        window.updateDroneSelectedParcelCard(newTargetId);
        window.selectDronePreset(window.activeDroneFlightPresetId || 'DRONE-VSP-2026-F801');
    };

    window.updateDroneSelectedParcelCard = function(parcelId) {
        if (!rawGeoJson || !rawGeoJson.features) return;
        var feat = rawGeoJson.features.find(f => f.properties.id === parcelId);
        if (!feat) return;
        var p = feat.properties;

        var elUlpin = document.getElementById('drone-card-ulpin');
        var elSurvey = document.getElementById('drone-card-survey');
        var elOwner = document.getElementById('drone-card-owner');
        var elArea = document.getElementById('drone-card-area');

        if (elUlpin) elUlpin.textContent = p.ulpin || p.parcel_id || '---';
        if (elSurvey) elSurvey.textContent = p.survey_number || '---';
        if (elOwner) elOwner.textContent = p.owner_name || '---';
        if (elArea) elArea.textContent = `${Number(p.area_sqft || 2400).toLocaleString('en-IN')} Sq.Ft (${((p.area_sqft || 2400)/9).toFixed(1)} Sq.Yds)`;
    };

    window.openDroneDGPSModal = function(parcelId) {
        if (!isOfficerTabAuthenticated()) {
            window.openModal('modal-officer-auth');
            return;
        }

        var searchInput = document.getElementById('drone-ulpin-search-input');
        if (searchInput) searchInput.value = '';

        var targetId = parcelId || activeParcelId || (rawGeoJson && rawGeoJson.features[0] ? rawGeoJson.features[0].properties.id : null);
        window.activeDroneTargetParcelId = targetId;

        // Populate dropdown with all parcels
        window.filterDroneParcelsByULPIN('');

        // If specific parcel was requested, select it
        if (targetId) {
            var sel = document.getElementById('drone-target-parcel');
            if (sel) sel.value = targetId;
            window.updateDroneSelectedParcelCard(targetId);
        }

        window.selectDronePreset('DRONE-VSP-2026-F801');
        window.openModal('modal-drone-dgps');
    };

    window.onDroneTargetParcelChange = function() {
        var sel = document.getElementById('drone-target-parcel');
        if (!sel || !sel.value) return;
        var targetId = parseInt(sel.value);
        window.activeDroneTargetParcelId = targetId;
        window.updateDroneSelectedParcelCard(targetId);
        window.selectDronePreset(window.activeDroneFlightPresetId || 'DRONE-VSP-2026-F801');
    };

    window.selectDronePreset = function(flightId) {
        window.activeDroneFlightPresetId = flightId;
        var btn1 = document.getElementById('btn-drone-preset-1');
        var btn2 = document.getElementById('btn-drone-preset-2');
        var accuracyStr = flightId === 'DRONE-VSP-2026-F904' ? '± 1.5 cm' : '± 1.2 cm';

        if (flightId === 'DRONE-VSP-2026-F904') {
            if (btn1) {
                btn1.style.border = '1.5px solid #cbd5e1';
                btn1.style.background = '#ffffff';
            }
            if (btn2) {
                btn2.style.border = '1.5px solid #2563eb';
                btn2.style.background = '#eff6ff';
            }
        } else {
            if (btn1) {
                btn1.style.border = '1.5px solid #2563eb';
                btn1.style.background = '#eff6ff';
            }
            if (btn2) {
                btn2.style.border = '1.5px solid #cbd5e1';
                btn2.style.background = '#ffffff';
            }
        }

        // Generate precision Drone RTK boundary for the target parcel
        var targetFeat = rawGeoJson ? rawGeoJson.features.find(f => f.properties.id === window.activeDroneTargetParcelId) : null;
        if (targetFeat && targetFeat.geometry && targetFeat.geometry.coordinates) {
            var baseCoords = targetFeat.geometry.coordinates[0];
            // Generate high-precision sub-centimeter RTK perturbation
            window.activeDroneCoordinates = baseCoords.map((c, idx) => {
                var delta = (flightId === 'DRONE-VSP-2026-F904' ? 0.000015 : 0.000008) * ((idx % 2 === 0) ? 1 : -1);
                return [Number((c[0] + delta).toFixed(7)), Number((c[1] + delta).toFixed(7))];
            });

            // Ensure closed ring
            window.activeDroneCoordinates[window.activeDroneCoordinates.length - 1] = [window.activeDroneCoordinates[0][0], window.activeDroneCoordinates[0][1]];

            var areaSqft = calculateShoelaceArea(window.activeDroneCoordinates);
            var areaSqyds = Math.round(areaSqft / 9.0 * 10) / 10;
            var elArea = document.getElementById('drone-calc-area');
            var elVert = document.getElementById('drone-calc-vertices');
            if (elArea) elArea.textContent = `${areaSqft.toLocaleString('en-IN', {minimumFractionDigits: 1, maximumFractionDigits: 1})} Sq.Ft (${areaSqyds.toLocaleString('en-IN', {minimumFractionDigits: 1, maximumFractionDigits: 1})} Sq.Yds)`;
            if (elVert) elVert.textContent = `${window.activeDroneCoordinates.length - 1} DGPS Ground Control Points (GCPs RTK)`;

            renderDroneGCPTable(window.activeDroneCoordinates, accuracyStr);
            updateDroneAreaDiscrepancy(areaSqft);
        }
    };

    window.processDroneGeoJsonObject = function(geo, sourceName) {
        if (!geo) return false;
        var coords = null;
        var props = {};

        if (geo.type === 'FeatureCollection' && geo.features && geo.features[0]) {
            props = geo.features[0].properties || {};
            var geom = geo.features[0].geometry;
            if (geom) {
                if (geom.type === 'Polygon' && Array.isArray(geom.coordinates) && Array.isArray(geom.coordinates[0])) {
                    coords = geom.coordinates[0];
                } else if (Array.isArray(geom.coordinates)) {
                    coords = geom.coordinates;
                }
            }
        } else if (geo.type === 'Feature' && geo.geometry) {
            props = geo.properties || {};
            var geom = geo.geometry;
            if (geom.type === 'Polygon' && Array.isArray(geom.coordinates) && Array.isArray(geom.coordinates[0])) {
                coords = geom.coordinates[0];
            } else if (Array.isArray(geom.coordinates)) {
                coords = geom.coordinates;
            }
        } else if (geo.coordinates) {
            coords = (Array.isArray(geo.coordinates[0]) && Array.isArray(geo.coordinates[0][0]))
                ? geo.coordinates[0]
                : geo.coordinates;
        }

        // If ULPIN or parcel_id is present in file metadata, auto-select matching target parcel
        var targetUlpin = props.ulpin || props.parcel_id;
        if (targetUlpin && rawGeoJson && rawGeoJson.features) {
            var matchedFeat = rawGeoJson.features.find(f => 
                (f.properties.ulpin && f.properties.ulpin.toLowerCase() === targetUlpin.toLowerCase()) ||
                (f.properties.parcel_id && f.properties.parcel_id.toLowerCase() === targetUlpin.toLowerCase())
            );
            if (matchedFeat) {
                window.activeDroneTargetParcelId = matchedFeat.properties.id;
                var sel = document.getElementById('drone-target-parcel');
                var searchInput = document.getElementById('drone-ulpin-search-input');
                if (searchInput) searchInput.value = targetUlpin;
                if (sel) {
                    sel.value = matchedFeat.properties.id;
                }
                window.updateDroneSelectedParcelCard(matchedFeat.properties.id);
            }
        }

        if (coords && coords.length >= 3) {
            // Ensure closed ring
            if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
                coords.push([coords[0][0], coords[0][1]]);
            }

            window.activeDroneCoordinates = coords;
            var areaSqft = calculateShoelaceArea(coords);
            var areaSqyds = Math.round(areaSqft / 9.0 * 10) / 10;
            var elArea = document.getElementById('drone-calc-area');
            var elVert = document.getElementById('drone-calc-vertices');
            if (elArea) elArea.textContent = `${areaSqft.toLocaleString('en-IN', {minimumFractionDigits: 1, maximumFractionDigits: 1})} Sq.Ft (${areaSqyds.toLocaleString('en-IN', {minimumFractionDigits: 1, maximumFractionDigits: 1})} Sq.Yds)`;
            if (elVert) elVert.textContent = `${coords.length - 1} DGPS RTK Survey Vertices (Imported)`;

            var accuracyStr = props.dgps_accuracy || '± 1.8 cm RTK';
            renderDroneGCPTable(coords, accuracyStr);
            updateDroneAreaDiscrepancy(areaSqft);
            return true;
        } else {
            alert('Invalid polygon geometry found in uploaded survey file. Expected array of [lng, lat] coordinates.');
            return false;
        }
    };

    window.handleDroneFileImport = function(event) {
        var file = event.target.files[0];
        if (!file) return;

        var fileName = file.name.toLowerCase();

        // If file is ESRI Shapefile archive (.zip)
        if (fileName.endsWith('.zip')) {
            var formData = new FormData();
            formData.append('file', file);

            var elVert = document.getElementById('drone-calc-vertices');
            if (elVert) elVert.textContent = 'Extracting ESRI Shapefile (.shp/.dbf)...';

            fetch('/api/parcels/parse-shapefile/', {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                if (data.success && data.geojson) {
                    if (window.processDroneGeoJsonObject(data.geojson, file.name)) {
                        alert(`✅ Successfully imported ESRI Shapefile "${file.name}"!\nRecalculated Area and RTK Ground Control Points (GCPs) loaded.`);
                    }
                } else {
                    alert('Shapefile parsing error: ' + (data.message || 'Unknown error'));
                }
            })
            .catch(err => {
                alert('Network error while processing Shapefile: ' + err);
            });
            return;
        }

        // Standard GeoJSON / JSON file
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var geo = JSON.parse(e.target.result);
                if (window.processDroneGeoJsonObject(geo, file.name)) {
                    alert(`✅ Successfully imported "${file.name}"!\nCalculated Area and RTK Ground Control Points (GCPs) have been loaded.`);
                }
            } catch (err) {
                alert('Error parsing GeoJSON: ' + err);
            }
        };
        reader.readAsText(file);
    };

    window.loadDemoSurveyGeoJSON = function(ulpin) {
        fetch(`/static/drone_survey_${ulpin}.geojson?t=` + new Date().getTime())
            .then(res => {
                if (!res.ok) throw new Error('File not found at /static/drone_survey_' + ulpin + '.geojson');
                return res.json();
            })
            .then(geo => {
                if (window.processDroneGeoJsonObject(geo, `Demo Survey (${ulpin})`)) {
                    alert(`✅ Demo Drone Survey Loaded for ULPIN: ${ulpin}!\nRecalculated Area & Ground Control Points are active.`);
                }
            })
            .catch(err => {
                alert('Failed to load demo survey file: ' + err);
            });
    };

    window.previewDroneOnMap = function() {
        if (!window.activeDroneCoordinates || window.activeDroneCoordinates.length < 3) {
            alert('No drone survey coordinates available to preview.');
            return;
        }

        if (window.dronePreviewLayer) {
            map.removeLayer(window.dronePreviewLayer);
        }

        window.dronePreviewLayer = L.featureGroup();

        var latlngs = window.activeDroneCoordinates.map(c => [c[1], c[0]]);
        var dronePoly = L.polygon(latlngs, {
            color: '#06b6d4',
            fillColor: '#22d3ee',
            fillOpacity: 0.55,
            weight: 3.5,
            dashArray: '6 6'
        });
        window.dronePreviewLayer.addLayer(dronePoly);

        // Add GCP pins
        latlngs.slice(0, -1).forEach((pt, i) => {
            var gcpMarker = L.circleMarker(pt, {
                radius: 5,
                fillColor: '#f59e0b',
                color: '#ffffff',
                weight: 2,
                fillOpacity: 1
            });
            gcpMarker.bindTooltip(`GCP #${i + 1} (RTK ±1.2cm)`, { permanent: false, direction: 'top' });
            window.dronePreviewLayer.addLayer(gcpMarker);
        });

        window.dronePreviewLayer.addTo(map);
        map.fitBounds(dronePoly.getBounds(), { padding: [60, 60], maxZoom: 21 });
        window.closeModal('modal-drone-dgps');

        setTimeout(() => {
            alert('🛰️ Drone DGPS Boundary & GCPs previewed on satellite map (Cyan dashed line). Open Drone DGPS modal again to commit.');
        }, 400);
    };

    window.commitDroneSurveyToParcel = function() {
        if (!window.activeDroneTargetParcelId) {
            alert('Please select a target parcel first.');
            return;
        }
        if (!window.activeDroneCoordinates || window.activeDroneCoordinates.length < 3) {
            alert('No valid drone coordinates to commit.');
            return;
        }

        var commitBtn = document.getElementById('btn-commit-drone-boundary');
        if (commitBtn) {
            commitBtn.disabled = true;
            commitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Committing to DB...';
        }

        fetch(`/api/parcels/${window.activeDroneTargetParcelId}/ingest-drone-shapefile/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coordinates: window.activeDroneCoordinates,
                flight_ref: 'DRONE-VSP-2026-F801'
            })
        })
        .then(res => res.json())
        .then(data => {
            if (commitBtn) {
                commitBtn.disabled = false;
                commitBtn.innerHTML = '<i class="fas fa-check-double"></i> Commit to Cadastral Database';
            }

            if (data.success) {
                window.closeModal('modal-drone-dgps');
                if (window.dronePreviewLayer) {
                    map.removeLayer(window.dronePreviewLayer);
                    window.dronePreviewLayer = null;
                }
                loadParcels(function() {
                    window.selectAndHighlightParcel(window.activeDroneTargetParcelId, true);
                    alert(`✅ Success! Drone DGPS shapefile ingested into Parcel Database.\nRecalculated Area: ${data.area_sqft} Sq.Ft (${data.area_sqyds} Sq.Yds)\nGNSS RTK Accuracy: ${data.accuracy}`);
                });
            } else {
                alert('Failed to commit drone shapefile: ' + data.message);
            }
        })
        .catch(err => {
            if (commitBtn) {
                commitBtn.disabled = false;
                commitBtn.innerHTML = '<i class="fas fa-check-double"></i> Commit to Cadastral Database';
            }
            alert('Network error: ' + err);
        });
    };

    // ========================================================
    // MODULE D / SPATIAL TOOLS: ADD NEW PARCEL VIA SHAPEFILE / GEOJSON
    // ========================================================
    window.pendingAddParcelCoords = null;
    window.addParcelPreviewLayer = null;

    window.openAddParcelModal = function() {
        if (!isOfficerTabAuthenticated()) {
            window.openModal('modal-officer-auth');
            return;
        }

        // Reset inputs
        var fileInput = document.getElementById('add-parcel-file-input');
        if (fileInput) fileInput.value = '';

        window.pendingAddParcelCoords = null;
        var statusBadge = document.getElementById('add-parcel-status-badge');
        if (statusBadge) {
            statusBadge.textContent = 'Waiting for file upload';
            statusBadge.style.background = '#e2e8f0';
            statusBadge.style.color = '#475569';
        }
        var areaDisplay = document.getElementById('add-parcel-area-display');
        if (areaDisplay) areaDisplay.textContent = '-- Sq.Ft (-- Sq.Yds)';
        var centroidDisplay = document.getElementById('add-parcel-centroid-display');
        if (centroidDisplay) centroidDisplay.textContent = 'No coordinates loaded';

        var tbody = document.getElementById('tbody-add-parcel-coords');
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="padding: 8px; text-align: center; color: #94a3b8;">No coordinates ingested yet</td></tr>';

        // Pre-fill default form fields
        var randNum = Math.floor(100 + Math.random() * 900);
        var inputUlpin = document.getElementById('add-parcel-ulpin');
        if (inputUlpin) inputUlpin.value = `79Q5${Math.random().toString(36).substring(2, 6).toUpperCase()}P${randNum}`;
        var inputSurvey = document.getElementById('add-parcel-survey-no');
        if (inputSurvey) inputSurvey.value = `Sy. No. ${Math.floor(100 + Math.random() * 50)}/${Math.floor(1 + Math.random() * 5)}`;
        var inputLot = document.getElementById('add-parcel-lot-no');
        if (inputLot) inputLot.value = `Plot ${randNum}`;
        var inputOwner = document.getElementById('add-parcel-owner-name');
        if (inputOwner) inputOwner.value = '';
        var inputAddress = document.getElementById('add-parcel-address');
        if (inputAddress) inputAddress.value = '';
        var inputMarket = document.getElementById('add-parcel-market-val');
        if (inputMarket) inputMarket.value = '';

        window.openModal('modal-add-parcel');
    };

    window.handleAddParcelFile = function(event) {
        var file = event.target.files[0];
        if (!file) return;

        var fileName = file.name.toLowerCase();

        if (fileName.endsWith('.zip')) {
            var formData = new FormData();
            formData.append('file', file);

            var statusBadge = document.getElementById('add-parcel-status-badge');
            if (statusBadge) {
                statusBadge.textContent = 'Unpacking Shapefile (.shp/.dbf)...';
                statusBadge.style.background = '#fef3c7';
                statusBadge.style.color = '#92400e';
            }

            fetch('/api/parcels/parse-shapefile/', {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                if (data.success && data.geojson) {
                    window.processAddParcelGeoJsonObject(data.geojson, file.name);
                } else {
                    alert('Shapefile parsing error: ' + (data.message || 'Could not parse shapefile.'));
                }
            })
            .catch(err => {
                alert('Network error while processing Shapefile: ' + err);
            });
            return;
        }

        // GeoJSON / JSON
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var geo = JSON.parse(e.target.result);
                window.processAddParcelGeoJsonObject(geo, file.name);
            } catch (err) {
                alert('Error parsing GeoJSON file: ' + err);
            }
        };
        reader.readAsText(file);
    };

    window.loadAddParcelDemoFile = function(type) {
        var statusBadge = document.getElementById('add-parcel-status-badge');
        if (statusBadge) {
            statusBadge.textContent = 'Fetching Vizag Railway Station survey...';
            statusBadge.style.background = '#dbeafe';
            statusBadge.style.color = '#1e40af';
        }

        var fileName = (type === 'vizag_rly_zip') ? 'vizag_railway_station.zip' : (type === 'zip' ? 'new_parcel_demo.zip' : 'vizag_railway_station.geojson');

        if (fileName.endsWith('.zip')) {
            fetch(`/static/${fileName}?t=` + new Date().getTime())
                .then(res => {
                    if (!res.ok) throw new Error('File not found');
                    return res.blob();
                })
                .then(blob => {
                    var formData = new FormData();
                    formData.append('file', blob, fileName);
                    return fetch('/api/parcels/parse-shapefile/', {
                        method: 'POST',
                        body: formData
                    });
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.geojson) {
                        window.processAddParcelGeoJsonObject(data.geojson, fileName);
                    } else {
                        alert('Could not parse demo shapefile: ' + data.message);
                    }
                })
                .catch(err => alert('Failed to load demo shapefile: ' + err));
        } else {
            fetch(`/static/${fileName}?t=` + new Date().getTime())
                .then(res => res.json())
                .then(geo => {
                    window.processAddParcelGeoJsonObject(geo, fileName);
                })
                .catch(err => alert('Failed to load demo GeoJSON: ' + err));
        }
    };

    window.processAddParcelGeoJsonObject = function(geo, sourceName) {
        if (!geo) return;
        var coords = null;
        var props = {};

        if (geo.type === 'FeatureCollection' && geo.features && geo.features[0]) {
            props = geo.features[0].properties || {};
            var geom = geo.features[0].geometry;
            if (geom) {
                if (geom.type === 'Polygon' && Array.isArray(geom.coordinates) && Array.isArray(geom.coordinates[0])) {
                    coords = geom.coordinates[0];
                } else if (Array.isArray(geom.coordinates)) {
                    coords = geom.coordinates;
                }
            }
        } else if (geo.type === 'Feature' && geo.geometry) {
            props = geo.properties || {};
            var geom = geo.geometry;
            if (geom.type === 'Polygon' && Array.isArray(geom.coordinates) && Array.isArray(geom.coordinates[0])) {
                coords = geom.coordinates[0];
            } else if (Array.isArray(geom.coordinates)) {
                coords = geom.coordinates;
            }
        } else if (geo.coordinates) {
            coords = (Array.isArray(geo.coordinates[0]) && Array.isArray(geo.coordinates[0][0]))
                ? geo.coordinates[0]
                : geo.coordinates;
        }

        if (!coords || coords.length < 3) {
            alert('Invalid polygon geometry in uploaded file. At least 3 coordinates required.');
            return;
        }

        // Ensure closed ring
        if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
            coords.push([coords[0][0], coords[0][1]]);
        }

        window.pendingAddParcelCoords = coords;

        // Calculate Geodesic Area
        var areaSqft = calculateShoelaceArea(coords);
        var areaSqyds = Math.round(areaSqft / 9.0 * 10) / 10;

        // Calculate Centroid
        var pts = coords.slice(0, -1);
        var cLng = pts.reduce((acc, c) => acc + c[0], 0) / pts.length;
        var cLat = pts.reduce((acc, c) => acc + c[1], 0) / pts.length;

        // Update Summary Card
        var statusBadge = document.getElementById('add-parcel-status-badge');
        if (statusBadge) {
            statusBadge.textContent = `✅ ${sourceName} Ingested`;
            statusBadge.style.background = '#dcfce7';
            statusBadge.style.color = '#15803d';
        }

        var areaDisplay = document.getElementById('add-parcel-area-display');
        if (areaDisplay) {
            areaDisplay.textContent = `${areaSqft.toLocaleString('en-IN', {minimumFractionDigits: 1, maximumFractionDigits: 1})} Sq.Ft (${areaSqyds.toLocaleString('en-IN', {minimumFractionDigits: 1, maximumFractionDigits: 1})} Sq.Yds)`;
        }

        var centroidDisplay = document.getElementById('add-parcel-centroid-display');
        if (centroidDisplay) {
            centroidDisplay.textContent = `${pts.length} Vertices • Centroid: [${cLng.toFixed(6)}°, ${cLat.toFixed(6)}°]`;
        }

        // Update Form Fields with Ingested Attributes
        if (props.ulpin) document.getElementById('add-parcel-ulpin').value = props.ulpin;
        if (props.survey_number || props.survey_no) document.getElementById('add-parcel-survey-no').value = props.survey_number || props.survey_no;
        if (props.lot_number || props.lot_no) document.getElementById('add-parcel-lot-no').value = props.lot_number || props.lot_no;
        if (props.owner_name || props.owner) document.getElementById('add-parcel-owner-name').value = props.owner_name || props.owner;
        if (props.zone) document.getElementById('add-parcel-zone').value = props.zone.toLowerCase().replace(' ', '_');
        if (props.property_type || props.prop_type) document.getElementById('add-parcel-prop-type').value = props.property_type || props.prop_type;
        if (props.status) document.getElementById('add-parcel-status').value = props.status.toLowerCase();
        if (props.address) document.getElementById('add-parcel-address').value = props.address;
        
        var marketVal = Math.round(areaSqft * 4500);
        document.getElementById('add-parcel-market-val').value = props.market_value || marketVal;

        if (!document.getElementById('add-parcel-address').value) {
            var zoneText = document.getElementById('add-parcel-zone').value.replace('_', ' ').toUpperCase();
            var plotText = document.getElementById('add-parcel-lot-no').value || 'Plot';
            document.getElementById('add-parcel-address').value = `${plotText}, ${zoneText}, Visakhapatnam, Andhra Pradesh`;
        }

        // Render Coordinates Table
        var tbody = document.getElementById('tbody-add-parcel-coords');
        if (tbody) {
            tbody.innerHTML = pts.map((c, i) => `
                <tr style="border-bottom: 1px solid #e2e8f0; ${i % 2 === 0 ? 'background:#f8fafc;' : 'background:#fff;'}">
                    <td style="padding: 4px 8px; font-weight: 700; color: #065f46;">Vertex #${i + 1}</td>
                    <td style="padding: 4px 8px; color: #0f172a;">${c[0].toFixed(7)}° E</td>
                    <td style="padding: 4px 8px; color: #0f172a;">${c[1].toFixed(7)}° N</td>
                </tr>
            `).join('');
        }
    };

    window.previewAddParcelBoundary = function() {
        if (!window.pendingAddParcelCoords || window.pendingAddParcelCoords.length < 3) {
            alert('Please upload a valid Shapefile or GeoJSON first.');
            return;
        }

        if (window.addParcelPreviewLayer) {
            map.removeLayer(window.addParcelPreviewLayer);
        }

        window.addParcelPreviewLayer = L.featureGroup();
        var latlngs = window.pendingAddParcelCoords.map(c => [c[1], c[0]]);

        var newPoly = L.polygon(latlngs, {
            color: '#059669',
            fillColor: '#10b981',
            fillOpacity: 0.55,
            weight: 3.5,
            dashArray: '6 4'
        });
        window.addParcelPreviewLayer.addLayer(newPoly);

        latlngs.slice(0, -1).forEach((pt, i) => {
            var m = L.circleMarker(pt, {
                radius: 5,
                fillColor: '#10b981',
                color: '#ffffff',
                weight: 2,
                fillOpacity: 1
            });
            m.bindTooltip(`New Vertex #${i + 1}`, { permanent: false, direction: 'top' });
            window.addParcelPreviewLayer.addLayer(m);
        });

        window.addParcelPreviewLayer.addTo(map);
        map.fitBounds(newPoly.getBounds(), { padding: [60, 60], maxZoom: 21 });
        window.closeModal('modal-add-parcel');

        setTimeout(() => {
            alert('🛰️ New parcel boundary previewed on satellite map (Emerald dashed line).\nOpen "Add Parcel" in Spatial Tools to complete registration.');
        }, 350);
    };

    window.submitNewParcelFromAddModal = function(event) {
        event.preventDefault();

        if (!window.pendingAddParcelCoords || window.pendingAddParcelCoords.length < 3) {
            alert('Please upload a valid Shapefile or GeoJSON boundary before saving.');
            return;
        }

        var btnSave = document.getElementById('btn-save-new-parcel');
        if (btnSave) {
            btnSave.disabled = true;
            btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registering Parcel...';
        }

        var coords = window.pendingAddParcelCoords;
        var pts = coords.slice(0, -1);
        var cLng = pts.reduce((acc, c) => acc + c[0], 0) / pts.length;
        var cLat = pts.reduce((acc, c) => acc + c[1], 0) / pts.length;
        var areaSqft = calculateShoelaceArea(coords);
        var areaSqyds = Math.round(areaSqft / 9.0 * 10) / 10;

        var ulpin = document.getElementById('add-parcel-ulpin').value.trim();
        var surveyNo = document.getElementById('add-parcel-survey-no').value.trim();
        var lotNo = document.getElementById('add-parcel-lot-no').value.trim();
        var zone = document.getElementById('add-parcel-zone').value;
        var owner = document.getElementById('add-parcel-owner-name').value.trim();
        var propType = document.getElementById('add-parcel-prop-type').value;
        var status = document.getElementById('add-parcel-status').value;
        var address = document.getElementById('add-parcel-address').value.trim();
        var marketVal = parseFloat(document.getElementById('add-parcel-market-val').value) || Math.round(areaSqft * 4500);

        var zoneCode = zone.substring(0, 3).toUpperCase();
        var randSuffix = Math.floor(100 + Math.random() * 900);
        var parcelId = `VSP-${zoneCode}-${randSuffix}`;

        var payload = {
            parcel_id: parcelId,
            ulpin: ulpin || `AP-VSP-${zoneCode}-${randSuffix}01`,
            ror_number: `ROR-2026-VSP-${randSuffix}`,
            survey_number: surveyNo,
            lot_number: lotNo,
            owner_name: owner,
            zone: zone,
            property_type: propType,
            status: status,
            market_value: marketVal,
            area_sqft: areaSqft,
            dimensions: `${areaSqft.toFixed(0)} sqft (${areaSqyds.toFixed(0)} sqyds)`,
            address: address,
            latitude: cLat,
            longitude: cLng,
            boundary: coords,
            description: `Demarcated and registered via official Shapefile ingestion by Survey Officer.`
        };

        fetch('/api/parcels/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(errData => { throw new Error(JSON.stringify(errData)); });
            }
            return res.json();
        })
        .then(data => {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = '<i class="fas fa-save"></i> Save & Register Parcel';
            }

            window.closeModal('modal-add-parcel');
            if (window.addParcelPreviewLayer) {
                map.removeLayer(window.addParcelPreviewLayer);
                window.addParcelPreviewLayer = null;
            }

            // Reload parcels and fly to the new parcel
            loadParcels(function() {
                var newId = data.id;
                window.selectAndHighlightParcel(newId, true);
                alert(`🎉 SUCCESS! New Parcel Registered in Master Cadastre!\n• Parcel ID: ${data.parcel_id}\n• ULPIN: ${data.ulpin}\n• Survey No: ${data.survey_number}\n• Area: ${data.area_sqft} Sq.Ft (${(data.area_sqft/9).toFixed(1)} Sq.Yds)\n• Owner: ${data.owner_name}`);
            });
        })
        .catch(err => {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = '<i class="fas fa-save"></i> Save & Register Parcel';
            }
            alert('Failed to register new parcel: ' + err);
        });
    };

    // ========================================================
    // CITIZEN LIVE LOCATION & SPATIAL POSITIONING
    // ========================================================
    window.citizenLocationLayer = null;

    window.locateCitizenLivePosition = function(isUserTriggered) {
        var toastEl = document.getElementById('toast-notification');
        if (toastEl) {
            toastEl.textContent = '🛰️ Requesting GPS satellite fix to locate your current position...';
            toastEl.style.display = 'block';
        }

        var btnLocate = document.getElementById('btn-locate-citizen');
        if (btnLocate) {
            btnLocate.classList.add('locating-pulse');
        }

        if (!navigator.geolocation) {
            fallbackCitizenLocation('Geolocation API not supported by this browser.');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            function(pos) {
                if (btnLocate) btnLocate.classList.remove('locating-pulse');
                var lat = pos.coords.latitude;
                var lng = pos.coords.longitude;
                var accuracy = pos.coords.accuracy || 20;

                renderCitizenLocation(lat, lng, accuracy, true);
            },
            function(err) {
                if (btnLocate) btnLocate.classList.remove('locating-pulse');
                var msg = 'Could not access GPS';
                if (err.code === 1) msg = 'Location permission denied by user';
                else if (err.code === 2) msg = 'Position unavailable';
                else if (err.code === 3) msg = 'Location request timed out';
                
                console.warn('Geolocation warning:', msg, err);
                fallbackCitizenLocation(msg);
            },
            {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 60000
            }
        );
    };

    function renderCitizenLocation(lat, lng, accuracy, isLive) {
        window.currentUserLat = lat;
        window.currentUserLng = lng;
        window.currentUserAccuracy = accuracy;
        window.currentUserIsLive = isLive;

        if (window.citizenLocationLayer) {
            map.removeLayer(window.citizenLocationLayer);
            window.citizenLocationLayer = null;
        }

        window.citizenLocationLayer = L.featureGroup();

        // Accuracy bounding circle
        var circle = L.circle([lat, lng], {
            radius: Math.max(accuracy, 30),
            color: '#2563eb',
            fillColor: '#3b82f6',
            fillOpacity: 0.12,
            weight: 1.5,
            dashArray: '4 4'
        });
        window.citizenLocationLayer.addLayer(circle);

        // Custom pulsing GPS pin icon
        var gpsIcon = L.divIcon({
            className: 'citizen-gps-div-icon',
            html: `
                <div class="citizen-gps-marker">
                    <div class="pulse-ring"></div>
                    <div class="dot-inner"><i class="fas fa-street-view"></i></div>
                </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -16]
        });

        var marker = L.marker([lat, lng], { icon: gpsIcon, zIndexOffset: 1000 });
        
        var popupHtml = `
            <div style="font-family: inherit; font-size: 0.8rem; padding: 4px; min-width: 220px;">
                <div style="font-weight: 800; color: #1e40af; display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                    <i class="fas fa-street-view" style="color: #2563eb;"></i> Your Current Location
                </div>
                <div style="font-size: 0.74rem; color: #475569; margin-bottom: 8px; line-height: 1.4;">
                    <span>Coordinates: <strong>${lat.toFixed(6)}° N, ${lng.toFixed(6)}° E</strong></span><br>
                    <span>GPS Fix: <strong style="color: #059669;">${isLive ? 'Live Satellites (Active)' : 'Urban Ward Center'} (±${Math.round(accuracy)}m)</strong></span>
                </div>
                <button onclick="findNearestCadastralParcel(${lat}, ${lng})" style="width: 100%; padding: 6px 8px; font-size: 0.74rem; font-weight: 700; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px;">
                    <i class="fas fa-search-location"></i> View Nearest Cadastral Parcel
                </button>
            </div>
        `;
        marker.bindPopup(popupHtml);
        window.citizenLocationLayer.addLayer(marker);

        window.citizenLocationLayer.addTo(map);

        // Update dedicated floating GIS Location Card if present
        var locCard = document.getElementById('citizen-location-card');
        if (locCard) {
            var coordsEl = document.getElementById('gis-loc-coords');
            var fixEl = document.getElementById('gis-loc-fix');
            if (coordsEl) coordsEl.textContent = `${lat.toFixed(6)}° N, ${lng.toFixed(6)}° E`;
            if (fixEl) fixEl.innerHTML = `<strong style="color:#059669;">${isLive ? 'Live Satellites (Active)' : 'Urban Ward Center'} (±${Math.round(accuracy)}m)</strong>`;
            locCard.style.display = 'block';
        }

        // Fly smoothly to citizen location if viewport is initialized, else setView directly
        try {
            var mapSize = map.getSize();
            if (mapSize && mapSize.x > 0 && mapSize.y > 0) {
                map.flyTo([lat, lng], 18, {
                    animate: true,
                    duration: 1.5
                });
            } else {
                map.setView([lat, lng], 18);
            }
        } catch(e) {
            map.setView([lat, lng], 18);
        }

        setTimeout(function() {
            marker.openPopup();
        }, 1600);

        var toastEl = document.getElementById('toast-notification');
        if (toastEl) {
            toastEl.textContent = `📍 Pointed to your location [${lat.toFixed(4)}°, ${lng.toFixed(4)}°] (Accuracy: ±${Math.round(accuracy)}m)`;
            toastEl.style.display = 'block';
            setTimeout(() => { toastEl.style.display = 'none'; }, 4500);
        }
    }

    function fallbackCitizenLocation(reason) {
        // Fallback location in Visakhapatnam (Dwaraka Nagar / MVP Colony urban hub where parcels exist)
        var fallbackLat = 17.7302;
        var fallbackLng = 83.3150;
        var fallbackAccuracy = 45;

        renderCitizenLocation(fallbackLat, fallbackLng, fallbackAccuracy, false);

        var toastEl = document.getElementById('toast-notification');
        if (toastEl) {
            toastEl.textContent = `📍 Pointed to Visakhapatnam Urban Ward (${reason}). Click 'Allow Location' for exact GPS.`;
            toastEl.style.display = 'block';
            setTimeout(() => { toastEl.style.display = 'none'; }, 5000);
        }
    }

    window.triggerNearestParcelFromCard = function() {
        var lat = typeof window.currentUserLat === 'number' ? window.currentUserLat : 17.7302;
        var lng = typeof window.currentUserLng === 'number' ? window.currentUserLng : 83.3150;
        window.findNearestCadastralParcel(lat, lng);
    };

    window.closeCitizenLocationCard = function() {
        var card = document.getElementById('citizen-location-card');
        if (card) card.style.display = 'none';
    };

    window.findNearestCadastralParcel = function(lat, lng) {
        if (typeof lat !== 'number' || typeof lng !== 'number') {
            lat = typeof window.currentUserLat === 'number' ? window.currentUserLat : 17.7302;
            lng = typeof window.currentUserLng === 'number' ? window.currentUserLng : 83.3150;
        }

        // Ensure data availability from memory or bundled source
        if (!rawGeoJson || !rawGeoJson.features || rawGeoJson.features.length === 0) {
            var bundled = (typeof window !== 'undefined' && window.PARCELS_GEOJSON && window.PARCELS_GEOJSON.features && window.PARCELS_GEOJSON.features.length > 0) ? window.PARCELS_GEOJSON :
                          (typeof window !== 'undefined' && window.parent && window.parent.PARCELS_GEOJSON && window.parent.PARCELS_GEOJSON.features && window.parent.PARCELS_GEOJSON.features.length > 0) ? window.parent.PARCELS_GEOJSON : null;
            if (bundled) {
                rawGeoJson = bundled;
                if (!allParcels || allParcels.length === 0) {
                    allParcels = rawGeoJson.features.map(function(f) { return f.properties; });
                }
            } else {
                var toastEl = document.getElementById('toast-notification');
                if (toastEl) {
                    toastEl.textContent = '⏳ Cadastral parcel dataset is loading... Retrying in a moment.';
                    toastEl.style.display = 'block';
                    setTimeout(() => { toastEl.style.display = 'none'; }, 3000);
                }
                setTimeout(function() {
                    window.findNearestCadastralParcel(lat, lng);
                }, 1000);
                return;
            }
        }

        var nearestFeat = null;
        var minDist = Infinity;
        var approxMeters = 0;

        rawGeoJson.features.forEach(function(f) {
            if (!f.geometry || !f.geometry.coordinates || !f.geometry.coordinates[0]) return;
            var coords = f.geometry.coordinates[0];
            var clat = coords.reduce((acc, c) => acc + c[1], 0) / coords.length;
            var clng = coords.reduce((acc, c) => acc + c[0], 0) / coords.length;

            var d = Math.hypot(lat - clat, lng - clng);
            if (d < minDist) {
                minDist = d;
                nearestFeat = f;
                // Geographic distance estimation (1 deg lat ~ 111,000 m)
                approxMeters = Math.round(d * 111000);
            }
        });

        if (nearestFeat && nearestFeat.properties) {
            var p = nearestFeat.properties;
            window.selectAndHighlightParcel(p.id, true);

            var toastEl = document.getElementById('toast-notification');
            if (toastEl) {
                var distStr = approxMeters < 1000 ? `${approxMeters}m` : `${(approxMeters/1000).toFixed(1)}km`;
                toastEl.textContent = `📍 Nearest Cadastral Parcel: ${p.lot_number || p.parcel_id} (Sy. No. ${p.survey_number}) ~${distStr} away. ULPIN: ${p.ulpin}`;
                toastEl.style.display = 'block';
                setTimeout(() => { toastEl.style.display = 'none'; }, 6000);
            }

            return {
                success: true,
                parcelId: p.id,
                ulpin: p.ulpin,
                surveyNumber: p.survey_number,
                distanceMeters: approxMeters
            };
        }
        return { success: false, error: 'No cadastral parcel found' };
    };

    // Listen for iframe communication from parent workspace with origin verification
    window.addEventListener('message', function(e) {
        if (e.origin && window.location.origin && e.origin !== window.location.origin) {
            return;
        }
        if (e.data && e.data.type === 'LOCATE_PARCEL' && e.data.ulpin) {
            var targetUlpin = String(e.data.ulpin).trim();
            function performLocate() {
                if (rawGeoJson && rawGeoJson.features && rawGeoJson.features.length > 0) {
                    var q = targetUlpin.toLowerCase();
                    var matchedFeat = rawGeoJson.features.find(function(f) {
                        var p = f.properties || {};
                        var u = (p.ulpin || '').toLowerCase();
                        var pid = String(p.parcel_id || '');
                        var id = String(p.id || '');
                        var sy = String(p.survey_number || '').toLowerCase();
                        return u.includes(q) || pid === q || id === q || sy.includes(q);
                    });
                    if (matchedFeat && matchedFeat.properties) {
                        window.selectAndHighlightParcel(matchedFeat.properties.id, true);
                        try {
                            if (window.parent && window.parent !== window) {
                                window.parent.postMessage({
                                    type: 'PARCEL_LOCATED',
                                    ulpin: matchedFeat.properties.ulpin,
                                    surveyNumber: matchedFeat.properties.survey_number,
                                    lotNumber: matchedFeat.properties.lot_number || matchedFeat.properties.parcel_id,
                                    id: matchedFeat.properties.id
                                }, window.location.origin);
                            }
                        } catch(err) {}
                        return true;
                    }
                }
                return false;
            }

            if (!performLocate()) {
                var retries = 0;
                var pollInterval = setInterval(function() {
                    retries++;
                    if (performLocate() || retries >= 5) {
                        clearInterval(pollInterval);
                        if (retries >= 5) {
                            try {
                                if (window.parent && window.parent !== window) {
                                    window.parent.postMessage({
                                        type: 'PARCEL_NOT_FOUND',
                                        ulpin: targetUlpin
                                    }, window.location.origin);
                                }
                            } catch(err) {}
                        }
                    }
                }, 400);
            }
        }
    });

    // Load parcels on start
    loadParcels(function() {
        // Ensure default demo citizen property is set for citizen mode
        if (currentRole === 'citizen' && !sessionStorage.getItem('landstack_citizen_ulpins')) {
            sessionStorage.setItem('landstack_citizen_ulpins', JSON.stringify(['79Q5CNX8ICNOELA', '79Q5RUS004501']));
            sessionStorage.setItem('landstack_citizen_ulpin', '79Q5CNX8ICNOELA');
            sessionStorage.setItem('landstack_citizen_name', 'Sri K. Rama Rao');
            sessionStorage.setItem('landstack_citizen_aadhaar', '5489 2104 8921');
            sessionStorage.setItem('landstack_citizen_parcel_id', '2422');
        }

        // Check if citizen auto-location is requested or citizen just logged in
        var urlParams = new URLSearchParams(window.location.search);
        var urlRole = (urlParams.get('role') || '').toLowerCase();
        var targetUlpin = urlParams.get('ulpin');

        if (targetUlpin && rawGeoJson && rawGeoJson.features) {
            var matchedFeat = rawGeoJson.features.find(function(f) {
                var u = (f.properties && f.properties.ulpin) ? f.properties.ulpin.toLowerCase() : '';
                return u.includes(targetUlpin.toLowerCase());
            });
            if (matchedFeat && matchedFeat.properties) {
                setTimeout(function() {
                    window.selectAndHighlightParcel(matchedFeat.properties.id, true);
                }, 400);
                return;
            }
        }

        var shouldAutoLocate = urlParams.get('locate') === 'true' || 
                               sessionStorage.getItem('landstack_locate_on_login') === 'true' ||
                               (currentRole === 'citizen' && !sessionStorage.getItem('landstack_located_once'));

        if (shouldAutoLocate && currentRole === 'citizen') {
            sessionStorage.removeItem('landstack_locate_on_login');
            sessionStorage.setItem('landstack_located_once', 'true');
            setTimeout(function() {
                window.locateCitizenLivePosition(false);
            }, 800);
        }
    });

    if (window.loadOfficerPendingTasks) {
        window.loadOfficerPendingTasks();
    }

            // ==============================================================================
    // MODULE E: INNOVATION DIFFERENTIATORS
    // District Collector Decision-Support Analytics Dashboard
    // ==============================================================================

    // District Collector Analytics Modal
    window.openCollectorAnalyticsModal = function() {
        openModal('modal-collector-analytics');
        window.fetchCollectorAnalyticsData(false);
    };

    window.fetchCollectorAnalyticsData = function(showToastNotif) {
        var refreshIcon = document.getElementById('analytics-refresh-icon');
        if (refreshIcon) refreshIcon.classList.add('fa-spin');

        fetch('/api/analytics/dashboard/')
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (refreshIcon) refreshIcon.classList.remove('fa-spin');
                if (!data.success || !data.kpis) return;

                var kpis = data.kpis;

                // KPI 1: Cadastral Extent
                var elParcels = document.getElementById('col-kpi-parcels');
                if (elParcels) elParcels.textContent = kpis.total_parcels;
                var elAcres = document.getElementById('col-kpi-acres');
                if (elAcres) elAcres.textContent = kpis.total_area_acres.toLocaleString();
                var elVal = document.getElementById('col-kpi-val');
                if (elVal) elVal.textContent = kpis.total_valuation_crores.toLocaleString();

                // KPI 2: Municipal Property Tax
                var elTaxEff = document.getElementById('col-kpi-tax-efficiency');
                if (elTaxEff) elTaxEff.textContent = kpis.tax_efficiency_pct + '%';
                var elTaxColl = document.getElementById('col-kpi-tax-collected');
                if (elTaxColl) elTaxColl.textContent = (kpis.tax_collected_inr / 10000000).toFixed(2);
                var elTaxDem = document.getElementById('col-kpi-tax-demand');
                if (elTaxDem) elTaxDem.textContent = (kpis.tax_demand_inr / 10000000).toFixed(2);

                // KPI 3: Dispute Rate
                var elDisputePct = document.getElementById('col-kpi-dispute-pct');
                if (elDisputePct) elDisputePct.textContent = kpis.dispute_pct + '%';
                var elDisputeCount = document.getElementById('col-kpi-dispute-count');
                if (elDisputeCount) elDisputeCount.textContent = kpis.disputed_count;
                var elDisputeAcres = document.getElementById('col-kpi-dispute-acres');
                if (elDisputeAcres) elDisputeAcres.textContent = kpis.disputed_acres;

                // KPI 4: Mutation SLA
                var elMutAvg = document.getElementById('col-kpi-mutation-avg');
                if (elMutAvg) elMutAvg.textContent = kpis.mutation_sla.avg_turnaround_days;
                var elMutCompliance = document.getElementById('col-kpi-mutation-compliance');
                if (elMutCompliance) elMutCompliance.textContent = kpis.mutation_sla.sla_compliance_rate_pct + '%';
                var elMutDone = document.getElementById('col-kpi-mutations-done');
                if (elMutDone) elMutDone.textContent = kpis.mutation_sla.completed_mutations;

                // Zone Breakdown List
                var zoneListEl = document.getElementById('collector-zone-breakdown-list');
                if (zoneListEl && kpis.zone_distribution) {
                    zoneListEl.innerHTML = kpis.zone_distribution.map(function(z) {
                        return `
                            <div style="font-size: 0.76rem;">
                                <div style="display:flex; justify-content:space-between; margin-bottom: 3px;">
                                    <span style="font-weight:700; color:#1e293b;">${z.zone_name} (${z.parcel_count} plots)</span>
                                    <span style="font-weight:800; color:#2563eb;">${z.area_acres} Acres • ₹${z.valuation_cr} Cr</span>
                                </div>
                                <div style="background: #e2e8f0; height: 7px; border-radius: 4px; overflow: hidden;">
                                    <div style="background: linear-gradient(90deg, #2563eb, #38bdf8); height: 100%; width: ${Math.min(100, Math.max(5, z.pct_of_total))}%;"></div>
                                </div>
                            </div>
                        `;
                    }).join('');
                }

                // CRZ Regulatory Counts
                if (kpis.crz_breakdown) {
                    var elCrz1 = document.getElementById('col-crz-1-count');
                    if (elCrz1) elCrz1.textContent = kpis.crz_breakdown.crz_1_ndz + ' Plots';
                    var elCrz2 = document.getElementById('col-crz-2-count');
                    if (elCrz2) elCrz2.textContent = kpis.crz_breakdown.crz_2_regulated + ' Plots';
                    var elCrzEco = document.getElementById('col-crz-eco-count');
                    if (elCrzEco) elCrzEco.textContent = kpis.crz_breakdown.eco_buffer + ' Plots';
                    var elCrzClear = document.getElementById('col-crz-clear-count');
                    if (elCrzClear) elCrzClear.textContent = kpis.crz_breakdown.none + ' Plots';
                }

                if (showToastNotif) {
                    showToast('District Collector live data refreshed successfully');
                }
            })
            .catch(function(err) {
                if (refreshIcon) refreshIcon.classList.remove('fa-spin');
                console.warn('Dashboard fetch error:', err);
            });
    };

    window.printCollectorDossier = function() {
        window.print();
    };
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMapModule);
} else {
    initMapModule();
}
