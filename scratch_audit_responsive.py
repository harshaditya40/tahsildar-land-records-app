import re

pages = ['index.html', 'login.html', 'workspace.html', 'map.html', 'templates/ror_passbook.html', 'templates/tax_assessment.html']
for p in pages:
    with open(p, 'r', encoding='utf-8') as f:
        c = f.read()
    has_viewport = bool(re.search(r'<meta[^>]+name=[\'"]viewport[\'"]', c, re.I))
    # Check for media queries
    mq_matches = re.findall(r'@media[^{]+{', c)
    print(f"{p}: Viewport Meta: {has_viewport} | Inline Media Queries: {len(mq_matches)}")

css_files = ['css/tahsildar.css', 'static/style.css']
for cs in css_files:
    with open(cs, 'r', encoding='utf-8') as f:
        c = f.read()
    mq_matches = re.findall(r'@media[^{]+{', c)
    print(f"{cs}: Media Queries: {len(mq_matches)}")
