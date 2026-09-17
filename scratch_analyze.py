import re

path = r'C:\Users\Harsha\.gemini\antigravity-ide\brain\64950bb2-7fa4-422d-9afb-6ff82a6b9960\.system_generated\steps\378\content.md'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

print('Length of original map.js:', len(text), 'chars')

# Find fetch calls
fetches = re.findall(r'fetch\s*\(\s*([^\)]+)\)', text)
print('\nFetch calls:')
for fc in set(fetches):
    print(' ', fc.strip()[:100])

# Find API paths
paths = set(re.findall(r'[\'"`](/[a-zA-Z0-9_\-\./]+)[\'"`]', text))
print('\nRelative paths found:')
for p in sorted(paths):
    if any(k in p for k in ['api', 'ror', 'tax', 'parcel', 'mutation', 'officer', 'citizen']):
        print(' ', p)

# Find all functions
funcs = set(re.findall(r'function\s+([a-zA-Z0-9_]+)\s*\(', text))
print('\nFunctions count:', len(funcs))
print('Sample functions:', sorted(list(funcs))[:40])
