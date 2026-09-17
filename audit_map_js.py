import re

with open('static/map.js', 'r', encoding='utf-8') as f:
    code = f.read()

print('=== AUDITING static/map.js ===')
print('File length:', len(code), 'bytes, lines:', len(code.splitlines()))

# Check for unclosed brackets/braces
open_braces = code.count('{')
close_braces = code.count('}')
open_parens = code.count('(')
close_parens = code.count(')')
open_brackets = code.count('[')
close_brackets = code.count(']')

print(f'Braces: {open_braces} / {close_braces} (Diff: {open_braces - close_braces})')
print(f'Parens: {open_parens} / {close_parens} (Diff: {open_parens - close_parens})')
print(f'Brackets: {open_brackets} / {close_brackets} (Diff: {open_brackets - close_brackets})')

# Check all fetch calls and API URLs in static/map.js
fetch_urls = re.findall(r'fetch\([\'"`]([^\'"`\)\$]+)[\'"`]', code)
print(f'\nUnique static fetch URLs ({len(set(fetch_urls))}):')
for u in sorted(set(fetch_urls)):
    print('  ->', u)

# Check all document.getElementById calls to verify they exist in map.html
elem_ids = re.findall(r'document\.getElementById\([\'"]([^\'"]+)[\'"]\)', code)
print(f'\nTotal getElementById calls: {len(elem_ids)} ({len(set(elem_ids))} unique)')

with open('map.html', 'r', encoding='utf-8') as f:
    map_html = f.read()

missing_ids = []
for eid in set(elem_ids):
    if f'id="{eid}"' not in map_html and f"id='{eid}'" not in map_html:
        missing_ids.append(eid)

print(f'Missing element IDs in map.html ({len(missing_ids)}):')
for mid in missing_ids[:20]:
    print('  [WARN ID NOT IN HTML]:', mid)
