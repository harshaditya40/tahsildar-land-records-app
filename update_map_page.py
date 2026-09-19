import os
import re

def update_map():
    with open('scratch/live_landstack_map.html', 'r', encoding='utf-8') as f:
        html = f.read()

    # 1. Update Title to exact UTF-8 string required
    html = re.sub(
        r'<title>.*?</title>',
        '<title>TAHSILDAR \u2014 GIS Land Governance & Cadastral Portal | SIH26014</title>',
        html,
        count=1
    )
    html = html.replace('LAND STACK ', 'TAHSILDAR ')

    # 2. Add Top Government Identity Strip immediately after <body>
    gov_strip = '''<body>
    <!-- Top Government Identity Strip -->
    <div class="tahsildar-top-gov-strip" style="position:fixed; top:0; left:0; width:100vw; height:28px; background:#0d2621; color:#e2e8f0; font-size:0.72rem; font-weight:600; display:flex; justify-content:space-between; align-items:center; padding:0 20px; z-index:99999; font-family:Inter,sans-serif; border-bottom:1px solid rgba(255,255,255,0.1); box-sizing:border-box;">
        <div style="display:flex; align-items:center; gap:10px;">
            <span style="display:flex; gap:1px; width:12px; height:9px; border:1px solid #555;">
                <span style="background:#FF9933; flex:1;"></span>
                <span style="background:#FFFFFF; flex:1;"></span>
                <span style="background:#128807; flex:1;"></span>
            </span>
            <span>GOVERNMENT OF ANDHRA PRADESH &bull; DEPARTMENT OF LAND RESOURCES (DoLR)</span>
        </div>
        <div style="display:flex; gap:16px; align-items:center;">
            <a href="/" style="color:#60a5fa; text-decoration:none; font-weight:700;"><i class="fas fa-home"></i> Portal Home</a>
            <a href="/workspace/?role=citizen&view=dashboard" style="color:#34d399; text-decoration:none; font-weight:700;"><i class="fas fa-th-large"></i> Citizen Workspace</a>
            <a href="/workspace/?role=citizen&view=my-lands" style="color:#fbbf24; text-decoration:none; font-weight:700;"><i class="fas fa-house-user"></i> My Lands (2)</a>
            <span style="color:#94a3b8; font-size:0.70rem;">Pilot: Visakhapatnam (255 Parcels)</span>
        </div>
    </div>
'''
    html = html.replace('<body>', gov_strip, 1)

    # 3. Adjust dock position so it doesn't collide with the 28px top strip
    html = html.replace(
        '.landstack-vertical-dock {',
        '.landstack-vertical-dock { top: 38px !important;'
    )
    html = html.replace(
        '.search-container {',
        '.search-container { top: 38px !important;'
    )

    # 4. Brand the dock logo button
    html = html.replace(
        '<i class="fas fa-layer-group" style="color: #2563eb;"></i> <span>LandStack</span>',
        '<i class="fas fa-layer-group" style="color: #10b981;"></i> <span>TAHSILDAR</span>'
    )

    # 5. Insert the Sliding Parcel Intelligence Drawer Panel right after <div id="map"></div>
    parcel_drawer_html = '''
    <!-- =========================================================
         SLIDING PARCEL INTELLIGENCE DRAWER PANEL (#parcel-drawer-panel)
         Full-Fidelity Institutional DPI Cadastral Inspector
         ========================================================= -->
    <div id="parcel-drawer-panel" class="parcel-sliding-drawer" style="display:none;">
        <div class="drawer-header-bar">
            <div style="display:flex; align-items:center; gap:10px;">
                <span class="drawer-header-badge"><i class="fas fa-satellite"></i> CADASTRE</span>
                <h3 id="drawer-title" style="margin:0; font-size:1.05rem; font-weight:700; color:#0f2b5c;">Cadastral Parcel Details</h3>
            </div>
            <button class="btn-close-drawer" onclick="closeParcelDrawer()">&times;</button>
        </div>

        <div class="drawer-sub-bar">
            <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:0.72rem; color:#64748b; font-weight:600;">ULPIN (Bhu-Aadhaar):</span>
                <span id="drawer-ulpin-val" class="drawer-ulpin-pill">79Q5CNX8ICNOEL</span>
                <button class="btn-copy-mini" onclick="copyDrawerULPIN()" title="Copy 14-Digit ULPIN"><i class="fas fa-copy"></i></button>
            </div>
            <div style="display:flex; gap:6px;">
                <span id="drawer-ror-badge" class="badge-status badge-ror-active">RoR Form 1-B Valid</span>
                <span id="drawer-mut-badge" class="badge-status badge-mut-clear">Clear Title</span>
            </div>
        </div>

        <!-- Tab Navigation for Progressive Disclosure -->
        <div class="drawer-tabs-nav">
            <button class="drawer-tab-btn active" data-tab="tab-overview" onclick="switchDrawerTab('tab-overview')">
                <i class="fas fa-info-circle"></i> Overview
            </button>
            <button class="drawer-tab-btn" data-tab="tab-ownership" onclick="switchDrawerTab('tab-ownership')">
                <i class="fas fa-user-check"></i> Ownership
            </button>
            <button class="drawer-tab-btn" data-tab="tab-spatial" onclick="switchDrawerTab('tab-spatial')">
                <i class="fas fa-vector-square"></i> Spatial
            </button>
            <button class="drawer-tab-btn" data-tab="tab-risk" onclick="switchDrawerTab('tab-risk')">
                <i class="fas fa-shield-halved"></i> Bhu-AI Risk
            </button>
            <button class="drawer-tab-btn" data-tab="tab-actions" onclick="switchDrawerTab('tab-actions')">
                <i class="fas fa-gavel"></i> Actions
            </button>
        </div>

        <!-- Drawer Body Content -->
        <div class="drawer-scroll-body">
            <!-- TAB 1: OVERVIEW & LAND IDENTITY -->
            <div id="tab-overview" class="drawer-tab-content active">
                <div class="drawer-kpi-grid">
                    <div class="drawer-kpi-box">
                        <div class="kpi-label">SURVEY NUMBER</div>
                        <div class="kpi-val" id="drawer-sy-no">Sy. No. 148/24</div>
                    </div>
                    <div class="drawer-kpi-box">
                        <div class="kpi-label">PARCEL / PLOT</div>
                        <div class="kpi-val" id="drawer-plot-no">Plot #2422</div>
                    </div>
                    <div class="drawer-kpi-box">
                        <div class="kpi-label">TOTAL EXTENT</div>
                        <div class="kpi-val" id="drawer-area-val">2,400 Sq.Ft</div>
                    </div>
                    <div class="drawer-kpi-box">
                        <div class="kpi-label">EST. MARKET VALUE</div>
                        <div class="kpi-val" id="drawer-market-val">₹ 1,00,80,000</div>
                    </div>
                </div>

                <div class="drawer-info-table">
                    <div class="drawer-info-row">
                        <span class="info-prop">Revenue Mandal</span>
                        <span class="info-val">Visakhapatnam Urban</span>
                    </div>
                    <div class="drawer-info-row">
                        <span class="info-prop">Revenue Village / Ward</span>
                        <span class="info-val" id="drawer-village-name">Rushikonda (Ward 04)</span>
                    </div>
                    <div class="drawer-info-row">
                        <span class="info-prop">Land Classification</span>
                        <span class="info-val" id="drawer-land-class">Ryotwari Dry (Patta)</span>
                    </div>
                    <div class="drawer-info-row">
                        <span class="info-prop">Registration SRO</span>
                        <span class="info-val">SRO Visakhapatnam Rural</span>
                    </div>
                </div>
            </div>

            <!-- TAB 2: OWNERSHIP & RECORD OF RIGHTS -->
            <div id="tab-ownership" class="drawer-tab-content">
                <div class="drawer-card-box">
                    <div style="font-size:0.75rem; color:#1e3a8a; font-weight:800; text-transform:uppercase; margin-bottom:8px;">
                        <i class="fas fa-address-card"></i> Registered Pattadar
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <h4 id="drawer-owner-name" style="margin:0; font-size:1.0rem; color:#0f172a; font-weight:700;">Sri K. Rama Rao</h4>
                            <p style="margin:2px 0 0 0; font-size:0.75rem; color:#64748b;">S/o Late K. Suryanarayana</p>
                        </div>
                        <span class="badge-verified"><i class="fas fa-check-circle"></i> Aadhaar Seeded</span>
                    </div>
                    <div style="margin-top:12px; font-size:0.76rem; color:#475569; display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                        <div><strong>Khata No:</strong> <span id="drawer-khata-no">KH-2422</span></div>
                        <div><strong>Ownership Share:</strong> <span>100% (Sole)</span></div>
                        <div><strong>Acquisition Mode:</strong> <span>Registered Sale Deed</span></div>
                        <div><strong>Title Passbook:</strong> <span>Form 1-B Issued</span></div>
                    </div>
                </div>
            </div>

            <!-- TAB 3: SPATIAL CADASTRE & GEODESIC METRICS -->
            <div id="tab-spatial" class="drawer-tab-content">
                <div class="drawer-card-box">
                    <div style="font-size:0.75rem; color:#065f46; font-weight:800; text-transform:uppercase; margin-bottom:8px;">
                        <i class="fas fa-compass"></i> Geodetic Coordinates & Extent
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:8px 10px; border-radius:6px; border:1px solid #e2e8f0; margin-bottom:10px;">
                        <div>
                            <div style="font-size:0.70rem; color:#64748b;">Centroid WGS84</div>
                            <code id="drawer-coords-val" style="font-size:0.80rem; font-weight:700; color:#0f172a;">17.783012, 83.381045</code>
                        </div>
                        <button class="btn-copy-mini" onclick="copyDrawerCoords()" title="Copy Coordinates"><i class="fas fa-copy"></i></button>
                    </div>
                    <div class="drawer-info-row">
                        <span class="info-prop">Cadastral Boundary Vertices</span>
                        <span class="info-val" id="drawer-vertices-count">4 Geodesic Points</span>
                    </div>
                    <div class="drawer-info-row">
                        <span class="info-prop">Geodetic Perimeter</span>
                        <span class="info-val" id="drawer-perimeter-val">64.2 meters</span>
                    </div>
                    <div class="drawer-info-row">
                        <span class="info-prop">GIS Spatial Integrity</span>
                        <span class="info-val" style="color:#059669; font-weight:700;">Closed Ring &bull; 0 Self-Intersections</span>
                    </div>
                </div>
            </div>

            <!-- TAB 4: BHU-AI TITLE RISK SCANNER -->
            <div id="tab-risk" class="drawer-tab-content">
                <div class="drawer-card-box">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <span style="font-size:0.75rem; color:#7c2d12; font-weight:800; text-transform:uppercase;">
                            <i class="fas fa-shield-halved"></i> Bhu-AI Title Risk Score
                        </span>
                        <span id="drawer-risk-score" class="badge-risk-low">12 / 100 &bull; Low Risk</span>
                    </div>
                    <div class="risk-factor-row">
                        <span><i class="fas fa-building-columns"></i> Bank Encumbrance / Lien</span>
                        <span class="risk-clean"><i class="fas fa-check"></i> Clear (CERSAI Verified)</span>
                    </div>
                    <div class="risk-factor-row">
                        <span><i class="fas fa-water"></i> Coastal Regulation Zone (CRZ)</span>
                        <span class="risk-clean" id="drawer-crz-risk"><i class="fas fa-check"></i> Outside Buffer</span>
                    </div>
                    <div class="risk-factor-row">
                        <span><i class="fas fa-receipt"></i> GVMC Property Tax Defaults</span>
                        <span class="risk-clean"><i class="fas fa-check"></i> Nil Dues (Current)</span>
                    </div>
                    <div class="risk-factor-row">
                        <span><i class="fas fa-scale-balanced"></i> Civil Court Injunctions</span>
                        <span class="risk-clean"><i class="fas fa-check"></i> No Lis Pendens</span>
                    </div>
                    <p style="font-size:0.70rem; color:#64748b; margin-top:10px; line-height:1.4;">
                        <em>Disclaimer: Bhu-AI provides automated advisory risk indicators. Official legal orders are issued under the quasi-judicial seal of the Tahasildar.</em>
                    </p>
                </div>
            </div>

            <!-- TAB 5: STATUTORY ACTIONS & PROCEDURES -->
            <div id="tab-actions" class="drawer-tab-content">
                <div class="drawer-actions-stack">
                    <button class="btn-drawer-action btn-da-ror" onclick="openRoRFromDrawer()">
                        <i class="fas fa-certificate"></i> View RoR Form 1-B e-Passbook
                    </button>
                    <button class="btn-drawer-action btn-da-tax" onclick="openTaxFromDrawer()">
                        <i class="fas fa-receipt"></i> View GVMC Property Tax Assessment
                    </button>
                    <button class="btn-drawer-action btn-da-mut" onclick="applyMutationFromDrawer()">
                        <i class="fas fa-file-signature"></i> Apply Statutory Mutation (Form 6-A)
                    </button>
                    <button class="btn-drawer-action btn-da-ai" onclick="runBhuAIFromDrawer()">
                        <i class="fas fa-radar"></i> Run Bhu-AI Title Risk Radar
                    </button>
                    <button class="btn-drawer-action btn-da-sro" onclick="openSROFromDrawer()">
                        <i class="fas fa-handshake"></i> SRO Deed Registration Handshake
                    </button>
                    <button class="btn-drawer-action btn-da-sub" onclick="subdivideFromDrawer()">
                        <i class="fas fa-cut"></i> Turf.js Geodesic Subdivision (Pothissing)
                    </button>
                    <button class="btn-drawer-action btn-da-drone" onclick="droneIngestFromDrawer()">
                        <i class="fas fa-drone"></i> Ingest SVAMITVA Drone RTK Boundary
                    </button>
                </div>
            </div>
        </div>
    </div>
'''
    html = html.replace('<div id="map"></div>', '<div id="map"></div>\n' + parcel_drawer_html, 1)

    # 6. Ensure Aliased / Required Modals are Present
    # Check for modal-citizen-vault
    if 'id="modal-citizen-vault"' not in html:
        citizen_vault_html = '''
    <!-- Citizen My Lands Vault Modal (#modal-citizen-vault) -->
    <div id="modal-citizen-vault" class="gis-modal-backdrop" style="display: none;">
        <div class="gis-modal-card" style="max-width: 600px;">
            <div class="modal-header">
                <h3><i class="fas fa-house-user" style="color:#059669;"></i> My Registered Land Holdings</h3>
                <button class="modal-close-btn" onclick="closeModal('modal-citizen-vault')">&times;</button>
            </div>
            <div class="modal-body">
                <p style="font-size:0.80rem; color:#64748b; margin-top:0;">Authenticated Bhu-Aadhaar Portfolio linked to <strong>Sri K. Rama Rao</strong> (Aadhaar: XXXX-XXXX-8921)</p>
                <div class="citizen-lands-list">
                    <div class="citizen-land-card" style="border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:10px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-size:0.85rem; font-weight:700; color:#0f2b5c;">Sy. No. 148/24 &bull; Plot #2422</div>
                            <div style="font-size:0.75rem; color:#475569;">ULPIN: <code>79Q5CNX8ICNOELA</code> &bull; 2,400 Sq.Ft</div>
                            <span class="badge-status badge-ror-active" style="display:inline-block; margin-top:4px;">RoR Form 1-B Active</span>
                        </div>
                        <button class="btn-modal-primary" style="padding:6px 12px; font-size:0.75rem;" onclick="closeModal('modal-citizen-vault'); window.selectAndHighlightParcel(2422, true);">
                            <i class="fas fa-map-marker-alt"></i> Locate on Map
                        </button>
                    </div>
                    <div class="citizen-land-card" style="border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:10px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-size:0.85rem; font-weight:700; color:#0f2b5c;">Sy. No. 148/25 &bull; Plot #2423</div>
                            <div style="font-size:0.75rem; color:#475569;">ULPIN: <code>79Q5RUS004501</code> &bull; 2,400 Sq.Ft</div>
                            <span class="badge-status badge-mut-clear" style="display:inline-block; margin-top:4px;">Stage 3 Statutory Notice</span>
                        </div>
                        <button class="btn-modal-primary" style="padding:6px 12px; font-size:0.75rem;" onclick="closeModal('modal-citizen-vault'); window.selectAndHighlightParcel(2423, true);">
                            <i class="fas fa-map-marker-alt"></i> Locate on Map
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
'''
        html = html.replace('<!-- 1. Draw New Parcel Modal -->', citizen_vault_html + '\n    <!-- 1. Draw New Parcel Modal -->', 1)

    # 7. Add aliased modal attributes or wrappers
    # modal-apply-mutation
    if 'id="modal-apply-mutation"' not in html:
        html = html.replace('id="modal-citizen-mutation"', 'id="modal-citizen-mutation" data-alias="modal-apply-mutation"', 1)
        # also insert transparent alias container so getElementById finds it
        html = html.replace('id="modal-citizen-mutation"', 'id="modal-apply-mutation" data-legacy-id="modal-citizen-mutation"', 1)

    # modal-tahsildar-chambers
    if 'id="modal-tahsildar-chambers"' not in html:
        html = html.replace('id="modal-officer-approvals"', 'id="modal-tahsildar-chambers" data-legacy-id="modal-officer-approvals"', 1)

    # modal-collector-bi
    if 'id="modal-collector-bi"' not in html:
        html = html.replace('id="modal-collector-analytics"', 'id="modal-collector-bi" data-legacy-id="modal-collector-analytics"', 1)

    # modal-inquiry-order
    if 'id="modal-inquiry-order"' not in html:
        inquiry_order_html = '''
    <!-- AI Proceedings Speaking Order Modal (#modal-inquiry-order) -->
    <div id="modal-inquiry-order" class="gis-modal-backdrop" style="display: none;">
        <div class="gis-modal-card" style="max-width: 650px;">
            <div class="modal-header">
                <h3><i class="fas fa-gavel"></i> Quasi-Judicial Speaking Order [Section 5(3)]</h3>
                <button class="modal-close-btn" onclick="closeModal('modal-inquiry-order')">&times;</button>
            </div>
            <div class="modal-body" style="font-family:'Times New Roman',serif; font-size:0.85rem; line-height:1.5;">
                <div style="text-align:center; font-weight:bold; margin-bottom:12px;">
                    BEFORE THE TAHSILDAR & EXECUTIVE MAGISTRATE<br>
                    VISAKHAPATNAM URBAN MANDAL, ANDHRA PRADESH
                </div>
                <p><strong>Proceedings No:</strong> REV-VSKP-MUT-2026-00481/SEC5(3)</p>
                <p><strong>Sub:</strong> Revenue Records &mdash; Title Mutation under AP Rights in Land and Pattadar Passbooks Act, 1971 &mdash; Orders Issued.</p>
                <hr style="border:0.5px solid #ccc;">
                <p><strong>ORDER:</strong> Having scrutinized the Registered Sale Deed (Doc No. 481/2026 of SRO Visakhapatnam), Mandal Surveyor DGPS Cadastral Demarcation Report, and statutory 15-day Public Notice without objection, the undersigned hereby orders mutation of Record of Rights for Sy. No. 148/24 (ULPIN: 79Q5CNX8ICNOEL) in favor of Sri K. Rama Rao.</p>
                <div style="margin-top:20px; text-align:right;">
                    <div id="inquiry-ds-token" style="font-family:monospace; font-size:0.75rem; color:#1e40af; font-weight:bold;">
                        Digitally Signed by MRO Visakhapatnam<br>
                        DSC Token: DS-AP-REV-2026-19072-MRO
                    </div>
                </div>
            </div>
            <div class="modal-footer" style="padding:10px 16px; display:flex; justify-content:flex-end;">
                <button type="button" class="btn-modal-secondary" onclick="closeModal('modal-inquiry-order')">Close Order</button>
            </div>
        </div>
    </div>
'''
        html = html.replace('<!-- MODULE C: OFFICER STATUTORY DOCUMENT SCRUTINY MODAL -->', inquiry_order_html + '\n    <!-- MODULE C: OFFICER STATUTORY DOCUMENT SCRUTINY MODAL -->', 1)

    # 8. Subtle Kiwis Watermark in bottom status bar
    watermark = '<div style="position:fixed; bottom:6px; right:12px; z-index:9999; font-size:0.68rem; color:rgba(255,255,255,0.7); font-family:Inter,sans-serif; pointer-events:none; background:rgba(13,38,33,0.75); padding:2px 8px; border-radius:4px;">Made by <b style="color:rgba(255,255,255,0.7);">Kiwis</b></div>'
    if 'Made by <b style="color:rgba(255,255,255,0.7);">Kiwis</b>' not in html:
        html = html.replace('</body>', watermark + '\n</body>', 1)

    # 9. Drawer Helper Functions in map.html script
    drawer_js = '''
    <script>
    // =========================================================================
    // SLIDING PARCEL INTELLIGENCE DRAWER JAVASCRIPT CONTROLLERS
    // =========================================================================
    window.currentDrawerParcel = null;

    window.openParcelDrawer = function(p, feature) {
        if (!p) return;
        window.currentDrawerParcel = p;
        var drawer = document.getElementById('parcel-drawer-panel');
        if (!drawer) return;

        // Populate header & badges
        var titleEl = document.getElementById('drawer-title');
        if (titleEl) titleEl.textContent = `${p.lot_number || p.parcel_id || 'Parcel #' + p.id} (Sy. No. ${p.survey_number || 'N/A'})`;

        var ulpinEl = document.getElementById('drawer-ulpin-val');
        if (ulpinEl) ulpinEl.textContent = p.ulpin || `79Q5${(p.zone||'VSP').toUpperCase().slice(0,3)}${String(p.id||100).padStart(4,'0')}IND`;

        var syEl = document.getElementById('drawer-sy-no');
        if (syEl) syEl.textContent = p.survey_number ? `Sy. No. ${p.survey_number}` : 'Sy. No. 148/24';

        var plotEl = document.getElementById('drawer-plot-no');
        if (plotEl) plotEl.textContent = p.lot_number || p.parcel_id || `Plot #${p.id}`;

        var areaEl = document.getElementById('drawer-area-val');
        var sqft = Number(p.area_sqft || 2400);
        if (areaEl) areaEl.textContent = `${sqft.toLocaleString('en-IN')} Sq.Ft (${(sqft/9).toFixed(1)} Sq.Yds)`;

        var valEl = document.getElementById('drawer-market-val');
        var marketVal = p.market_value ? Number(p.market_value) : (sqft * 4200);
        if (valEl) valEl.textContent = `₹ ${marketVal.toLocaleString('en-IN')}`;

        var ownerEl = document.getElementById('drawer-owner-name');
        if (ownerEl) ownerEl.textContent = p.owner_name || 'Sri K. Rama Rao';

        var khataEl = document.getElementById('drawer-khata-no');
        if (khataEl) khataEl.textContent = `KH-${String(p.id || 2422).padStart(4,'0')}`;

        // Coordinates
        var coordsEl = document.getElementById('drawer-coords-val');
        if (feature && feature.geometry && feature.geometry.coordinates && feature.geometry.coordinates[0]) {
            var coords = feature.geometry.coordinates[0];
            var clat = coords.reduce((a, c) => a + c[1], 0) / coords.length;
            var clng = coords.reduce((a, c) => a + c[0], 0) / coords.length;
            if (coordsEl) coordsEl.textContent = `${clat.toFixed(6)}, ${clng.toFixed(6)}`;
            var vertEl = document.getElementById('drawer-vertices-count');
            if (vertEl) vertEl.textContent = `${coords.length} Geodesic Points`;
        }

        // Status badges
        var rorBadge = document.getElementById('drawer-ror-badge');
        if (rorBadge) {
            rorBadge.textContent = 'RoR Form 1-B Valid';
            rorBadge.className = 'badge-status badge-ror-active';
        }
        var mutBadge = document.getElementById('drawer-mut-badge');
        if (mutBadge) {
            var mutText = (p.status === 'disputed') ? 'Dispute Notice Active' :
                          (p.status === 'pending_mutation') ? 'Stage 2 In Progress' : 'Clear Title';
            mutBadge.textContent = mutText;
            mutBadge.className = (p.status === 'disputed') ? 'badge-status badge-dispute' : 'badge-status badge-mut-clear';
        }

        // Show drawer with slide-in
        drawer.style.display = 'flex';
        drawer.classList.add('drawer-open');
    };

    window.closeParcelDrawer = function() {
        var drawer = document.getElementById('parcel-drawer-panel');
        if (drawer) {
            drawer.classList.remove('drawer-open');
            setTimeout(() => { drawer.style.display = 'none'; }, 250);
        }
    };

    window.switchDrawerTab = function(tabId) {
        document.querySelectorAll('.drawer-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.drawer-tab-content').forEach(c => c.classList.remove('active'));
        var btn = document.querySelector(`.drawer-tab-btn[data-tab="${tabId}"]`);
        if (btn) btn.classList.add('active');
        var content = document.getElementById(tabId);
        if (content) content.classList.add('active');
    };

    window.copyDrawerULPIN = function() {
        var el = document.getElementById('drawer-ulpin-val');
        if (el) {
            navigator.clipboard.writeText(el.textContent.trim()).then(() => {
                alert('Copied 14-Digit ULPIN: ' + el.textContent.trim());
            });
        }
    };

    window.copyDrawerCoords = function() {
        var el = document.getElementById('drawer-coords-val');
        if (el) {
            navigator.clipboard.writeText(el.textContent.trim()).then(() => {
                alert('Copied Geodetic Coordinates: ' + el.textContent.trim());
            });
        }
    };

    // Action Bridge Handlers
    window.openRoRFromDrawer = function() {
        var id = window.currentDrawerParcel ? window.currentDrawerParcel.id : 2422;
        window.open(`/ror/${id}/`, '_blank');
    };

    window.openTaxFromDrawer = function() {
        var id = window.currentDrawerParcel ? window.currentDrawerParcel.id : 2422;
        window.open(`/tax/${id}/`, '_blank');
    };

    window.applyMutationFromDrawer = function() {
        var id = window.currentDrawerParcel ? window.currentDrawerParcel.id : 2422;
        if (window.openCitizenMutationModal) {
            window.openCitizenMutationModal(id);
        } else if (window.openModal) {
            window.openModal('modal-apply-mutation');
        }
    };

    window.runBhuAIFromDrawer = function() {
        var p = window.currentDrawerParcel;
        window.switchDrawerTab('tab-risk');
        var riskBadge = document.getElementById('drawer-risk-score');
        if (riskBadge) {
            riskBadge.textContent = 'Auditing cadastral encumbrance...';
            setTimeout(() => {
                var score = (p && p.status === 'disputed') ? 78 : (p && p.zone === 'crz') ? 45 : 12;
                var label = score < 30 ? 'Low Risk' : score < 60 ? 'Moderate (CRZ)' : 'High (Dispute)';
                riskBadge.textContent = `${score} / 100 • ${label}`;
                riskBadge.className = score < 30 ? 'badge-risk-low' : score < 60 ? 'badge-risk-med' : 'badge-risk-high';
            }, 500);
        }
    };

    window.openSROFromDrawer = function() {
        var id = window.currentDrawerParcel ? window.currentDrawerParcel.id : 2422;
        if (window.openSRODeedModal) window.openSRODeedModal(id);
    };

    window.subdivideFromDrawer = function() {
        var id = window.currentDrawerParcel ? window.currentDrawerParcel.id : 2422;
        if (window.initiateSubdivisionForParcel) window.initiateSubdivisionForParcel(id);
    };

    window.droneIngestFromDrawer = function() {
        if (window.openModal) window.openModal('modal-drone-dgps');
    };
    </script>
'''
    html = html.replace('</body>', drawer_js + '\n</body>', 1)

    with open('map.html', 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"Updated map.html successfully! Size: {len(html)} bytes")

if __name__ == '__main__':
    update_map()
