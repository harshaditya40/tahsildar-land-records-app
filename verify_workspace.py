with open('workspace.html', 'r', encoding='utf-8') as f:
    content = f.read()

checks = [
    'view-dashboard',
    'view-my-lands',
    'view-map',
    'view-records',
    'view-mutation',
    'view-applications',
    'view-notifications',
    'view-officer-dashboard',
    'modal-apply-mutation',
    'modal-tahsildar-chambers',
    'modal-pitchdeck',
    'workspace-parcel-drawer',
    'map-search-input',
    'workspace-map'
]

print('=== DOM ELEMENTS AUDIT ===')
all_ok = True
for c in checks:
    present = (f'id="{c}"' in content) or (f"id='{c}'" in content)
    status = "PASS" if present else "FAIL"
    if not present:
        all_ok = False
    print(f'[{status}] Element #{c}')

assert all_ok, "Some DOM elements missing"
print(f'ALL {len(checks)} CRITICAL WORKSPACE DOM ELEMENTS PRESENT! (Length: {len(content)} bytes)')
