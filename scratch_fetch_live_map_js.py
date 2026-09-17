import urllib.request
import re
import os

url = 'https://landstack-sih.vercel.app/static/map.js?v=40.0'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=15) as r:
        js = r.read().decode('utf-8', errors='ignore')
    os.makedirs('scratch', exist_ok=True)
    with open('scratch/live_map.js', 'w', encoding='utf-8') as f:
        f.write(js)
    print('Saved scratch/live_map.js! Size:', len(js))
    
    # Search for fetch calls
    fetch_calls = re.findall(r'fetch\([\'"`]([^\'"`]+)[\'"`]', js)
    print('\nFetch calls in live_map.js:')
    for fc in sorted(set(fetch_calls)):
        print(' -', fc)

    # Search for all strings matching URLs or APIs
    apis = re.findall(r'[\'"`](/[a-zA-Z0-9_\-\/\.\?]+)[\'"`]', js)
    apis = [a for a in apis if '/api/' in a or '.geojson' in a or 'parcels' in a or 'json' in a]
    print('\nAPIs and data in live_map.js:')
    for a in sorted(set(apis)):
        print(' -', a)

    # Search for tile layers
    tiles = re.findall(r'tileLayer\([\'"`]([^\'"`]+)[\'"`]', js)
    print('\nTile layers in live_map.js:')
    for t in tiles:
        print(' -', t)

    # Search for parcel layer initialization or GeoJSON loading
    geojson_loads = [line.strip() for line in js.splitlines() if 'geoJSON' in line or 'geojson' in line.lower() or 'parcels' in line.lower()][:15]
    print('\nGeoJSON / Parcels lines in live_map.js (first 15):')
    for gl in geojson_loads:
        print(' >', gl[:120])

except Exception as e:
    print('Error:', e)
