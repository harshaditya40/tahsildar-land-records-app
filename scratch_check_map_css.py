import re

with open('scratch/live_landstack_map.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Find link rel="stylesheet"
css_links = re.findall(r'<link[^>]*rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)["\']', html)
print('CSS Links in live map HTML:')
for c in css_links:
    print(' -', c)

# Check inline styles length
inline_styles = re.findall(r'<style[^>]*>(.*?)</style>', html, re.DOTALL)
print(f'\nTotal <style> blocks: {len(inline_styles)}')
for i, s in enumerate(inline_styles):
    print(f' Style block {i+1}: {len(s)} chars')
