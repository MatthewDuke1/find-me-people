"""Final integrity / readiness check for a Chrome Web Store zip upload."""
import hashlib
import json
import sys
import zipfile

path = sys.argv[1] if len(sys.argv) > 1 else "distro/v1.6.0/find-me-people-chrome-1.6.0.zip"

with open(path, "rb") as f:
    data = f.read()
with zipfile.ZipFile(path) as z:
    files = sorted(z.namelist())
    m = json.loads(z.read("manifest.json"))

print("Chrome package readiness check")
print("=" * 50)
print(f"File:                {path}")
print(f"Size:                {len(data):,} bytes")
print(f"SHA-256:             {hashlib.sha256(data).hexdigest()}")
print()
print(f"Manifest version:    {m['version']}")
print(f"Manifest name:       {m['name']}")
print(f"Description ({len(m['description'])}c): {m['description']}")
print(f"Permissions:         {m['permissions']}")
print(f"Host permissions:    {m['host_permissions']}")
print(f"Background:          {m.get('background')}")
print(f"Content scripts:     {len(m.get('content_scripts', []))} entries")
print()
print("Files in zip:")
for f in files:
    print(f"  - {f}")
print()
backslash = sum(1 for f in files if "\\" in f)
print(f"Backslash paths:     {backslash} (must be 0 for AMO; Chrome is lenient but match anyway)")
