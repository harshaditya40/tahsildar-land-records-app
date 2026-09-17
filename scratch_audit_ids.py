import re

def check_html_js_ids(html_file, js_file=None):
    print(f"\n==========================================")
    print(f"AUDITING: {html_file}")
    if js_file:
        print(f"JS: {js_file}")
    print(f"==========================================")
    with open(html_file, 'r', encoding='utf-8') as f:
        html_content = f.read()

    js_sources = []
    if js_file:
        with open(js_file, 'r', encoding='utf-8') as f:
            js_sources.append((js_file, f.read()))
    
    # Also extract inline scripts from html
    inline_scripts = re.findall(r'<script(?:\s+[^>]*)?>(.*?)</script>', html_content, re.DOTALL)
    for idx, s in enumerate(inline_scripts):
        js_sources.append((f"inline-script-{idx+1}", s))

    all_ids_in_html = set(re.findall(r'id=["\']([a-zA-Z0-9_\-]+)["\']', html_content))
    print(f"Found {len(all_ids_in_html)} unique IDs in {html_file}")

    for src_name, js_code in js_sources:
        # Find getElementById calls
        get_elem_ids = re.findall(r'document\.getElementById\(["\']([a-zA-Z0-9_\-]+)["\']\)', js_code)
        unique_get_ids = set(get_elem_ids)
        missing = unique_get_ids - all_ids_in_html
        if missing:
            print(f"  [{src_name}] {len(missing)} referenced IDs missing from HTML:")
            for m in sorted(missing):
                # Check if it has a null guard in the JS
                has_guard = False
                pattern = rf'if\s*\([^)]*{m}[^)]*\)|{m}\s*\?'
                if re.search(pattern, js_code):
                    has_guard = True
                print(f"    - {m} (Guarded: {has_guard})")
        else:
            print(f"  [{src_name}] All {len(unique_get_ids)} getElementById calls exist in HTML!")

check_html_js_ids('index.html')
check_html_js_ids('login.html')
check_html_js_ids('workspace.html')
check_html_js_ids('map.html', 'static/map.js')
