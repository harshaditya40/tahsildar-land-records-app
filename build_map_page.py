with open('scratch/live_landstack_map.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Update Title
html = html.replace(
    '<title>LAND STACK  GIS Land Governance & Cadastral Portal | SIH26014</title>',
    '<title>TAHSILDAR — GIS Land Governance & Cadastral Portal | SIH26014</title>'
)
html = html.replace(
    'LAND STACK ',
    'TAHSILDAR'
)

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

# 5. Write to map.html
with open('map.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('Successfully written map.html! Size:', len(html))
