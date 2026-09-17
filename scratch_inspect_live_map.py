import urllib.request
import re
import os

url = 'https://landstack-sih.vercel.app/map/'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=15) as r:
        html = r.read().decode('utf-8', errors='ignore')

    os.makedirs('scratch', exist_ok=True)
    with open('scratch/live_landstack_map.html', 'w', encoding='utf-8') as f:
        f.write(html)

    print('Saved scratch/live_landstack_map.html! Size:', len(html))

    # Find all fetch calls
    fetch_calls = re.findall(r'fetch\([\'"]([^\'"]+)[\'"]', html)
    print('\n--- FETCH CALLS ---')
    for fc in sorted(set(fetch_calls)):
        print('FETCH:', fc)

    # Find all script tags
    scripts = re.findall(r'<script[^>]*src=[\'"]([^\'"]+)[\'"]', html)
    print('\n--- SCRIPTS ---')
    for s in scripts:
        print('SCRIPT:', s)

    # Find all API mentions
    apis = re.findall(r'/api/[a-zA-Z0-9_\-\/]+', html)
    print('\n--- API ENDPOINTS MENTIONED ---')
    for a in sorted(set(apis)):
        print('API:', a)

    # Check for L.tileLayer or Map providers
    tile_layers = re.findall(r'tileLayer\([\'"]([^\'"]+)[\'"]', html)
    print('\n--- TILE LAYERS ---')
    for tl in tile_layers:
        print('TILE LAYER:', tl)

except Exception as e:
    print('Error:', e)
