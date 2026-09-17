import re

with open('scratch/live_landstack_map.html', 'r', encoding='utf-8') as f:
    html = f.read()

external_links = re.findall(r'href=[\'"](https?://[^\'"]+)[\'"]', html)
print('External links in live map HTML:')
for el in sorted(set(external_links)):
    print(' -', el)

internal_links = re.findall(r'href=[\'"](/[^\'"]*)[\'"]', html)
print('\nInternal links in live map HTML:')
for il in sorted(set(internal_links)):
    print(' -', il)
