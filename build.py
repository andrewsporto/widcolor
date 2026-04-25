"""
Build script - Cria o ZIP do widget WidColor para Kommo
"""
import zipfile
import os
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ZIP_NAME = 'widcolor.zip'

files_to_include = [
    ('manifest.json', 'manifest.json'),
    ('script.js', 'script.js'),
    ('style.css', 'style.css'),
    ('images/logo.png', 'images/logo.png'),
    ('images/logo.svg', 'images/logo.svg'),
    ('i18n/en.json', 'i18n/en.json'),
    ('i18n/pt.json', 'i18n/pt.json'),
    ('templates/settings.html', 'templates/settings.html'),
]

zip_path = os.path.join(BASE_DIR, ZIP_NAME)
if os.path.exists(zip_path):
    os.remove(zip_path)

print('Creating ZIP...')

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for src, arcname in files_to_include:
        full_path = os.path.join(BASE_DIR, src)
        if not os.path.exists(full_path):
            print(f'  ERROR: {src} not found!')
            continue
        zf.write(full_path, arcname)
        info = zf.getinfo(arcname)
        print(f'  Added: {arcname} ({info.file_size} bytes)')

print(f'\nZIP created: {zip_path} ({os.path.getsize(zip_path)} bytes)')

# Validate manifest
with open(os.path.join(BASE_DIR, 'manifest.json'), 'r', encoding='utf-8') as f:
    manifest = json.load(f)

print(f'\nManifest validation:')
print(f'  code: {manifest["widget"]["code"]}')
print(f'  version: {manifest["widget"]["version"]}')
print(f'  locations: {manifest["locations"]}')
print(f'  icon: {manifest["widget"]["icon"]}')
print(f'  settings_page: {manifest["widget"]["settings_page"]}')
print(f'  settings: {list(manifest.get("settings", {}).keys())}')
print('\nDone!')