import os
import re

print("=== SCANNING ALL FETCH CALLS IN PROJECT ===")
results = {}

for root, dirs, files in os.walk('.'):
    if any(x in root for x in ['node_modules', '.git', '.gemini', 'scratch']):
        continue
    for f in files:
        if f.endswith(('.html', '.js')):
            p = os.path.join(root, f)
            with open(p, 'r', encoding='utf-8', errors='ignore') as fl:
                content = fl.read()
            # Match fetch('url' or fetch("url" or fetch(`url
            matches = re.findall(r'fetch\([\'"`]([^\'"`]+)[\'"`]', content)
            if matches:
                results[p] = sorted(set(matches))

for fpath, urls in results.items():
    print(f"\n{fpath} ({len(urls)} URLs):")
    for u in urls:
        print(f"  -> {u}")
