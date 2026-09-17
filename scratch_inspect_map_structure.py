import re

with open('scratch/live_landstack_map.html', 'r', encoding='utf-8') as f:
    html = f.read()

print('=== LIVE LANDSTACK MAP HTML STRUCTURE ===')
title_match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE)
print('Title:', title_match.group(1) if title_match else 'None')

# Check IDs
ids = re.findall(r'id=["\']([^"\']+)["\']', html)
print(f'\nTotal IDs found: {len(ids)}')
for i in sorted(set(ids))[:50]:
    print(' - #', i)

# Check drawer and panels
print('\nDrawers & Panels:')
drawers = re.findall(r'<div[^>]*class=["\'][^"\']*(?:drawer|panel|overlay|sidebar)[^"\']*["\'][^>]*>', html, re.IGNORECASE)
for d in drawers[:20]:
    print(' >', d[:120])

# Check scripts
scripts = re.findall(r'<script[^>]*src=["\']([^"\']+)["\']', html)
print('\nScripts:')
for s in scripts:
    print(' *', s)
