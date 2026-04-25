"""
Build script - Cria o ZIP do widget WidColor para Kommo
O ZIP deve conter uma pasta com o nome do codigo do widget (widcolor/)
com manifest.json dentro dessa pasta.
"""
import zipfile
import os
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ZIP_NAME = 'widcolor.zip'
WIDGET_CODE = 'widcolor'

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

print('Creating ZIP with widget folder structure...')

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for src in files_to_include:
        full_path = os.path.join(BASE_DIR, src)
        arcname = WIDGET_CODE + '/' + src
        if not os.path.exists(full_path):
            print(f'  ERROR: {src} not found!')
            continue
        zf.write(full_path, arcname)
        info = zf.getinfo(arcname)
        print(f'  {arcname} ({info.file_size} bytes)')

print(f'\nZIP: {zip_path} ({os.path.getsize(zip_path)} bytes)')

# Validate
with open(os.path.join(BASE_DIR, 'manifest.json'), 'r', encoding='utf-8') as f:
    manifest = json.load(f)
print(f'\nManifest OK: code={manifest["widget"]["code"]}, v{manifest["widget"]["version"]}')
print('\nDone!')