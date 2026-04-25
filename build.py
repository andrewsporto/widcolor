"""
Build script - Cria o ZIP do widget WidColor para Kommo
manifest.json DEVE estar na raiz do ZIP (sem subpasta)
"""
import zipfile
import os
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ZIP_NAME = 'widcolor.zip'

files_to_include = [
    'manifest.json',
    'script.js',
    'style.css',
    'images/logo.png',
    'images/logo.svg',
    'i18n/en.json',
    'i18n/pt.json',
    'templates/settings.html',
]

zip_path = os.path.join(BASE_DIR, ZIP_NAME)
if os.path.exists(zip_path):
    os.remove(zip_path)

print('Creating ZIP (flat structure, no folder)...')

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for src in files_to_include:
        full_path = os.path.join(BASE_DIR, src)
        if not os.path.exists(full_path):
            print(f'  ERROR: {src} not found!')
            continue
        zf.write(full_path, src)  # NO folder prefix
        info = zf.getinfo(src)
        print(f'  {src} ({info.file_size} bytes)')

print(f'\nZIP: {zip_path} ({os.path.getsize(zip_path)} bytes)')

# Validate
with open(os.path.join(BASE_DIR, 'manifest.json'), 'r', encoding='utf-8') as f:
    manifest = json.load(f)
print(f'Manifest OK: code={manifest["widget"]["code"]}, v{manifest["widget"]["version"]}')

# Verify root structure
with zipfile.ZipFile(zip_path, 'r') as zf:
    names = zf.namelist()
    has_root_manifest = 'manifest.json' in names
    print(f'manifest.json at root: {has_root_manifest}')
    if not has_root_manifest:
        print('ERROR: manifest.json not found at root!')
    else:
        print('ZIP structure OK!')

print('\nDone!')