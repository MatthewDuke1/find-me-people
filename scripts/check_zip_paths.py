"""Inspect raw byte content of a zip to detect Windows-style backslash paths."""
import sys, re

path = sys.argv[1]
with open(path, "rb") as f:
    data = f.read()

icon_matches = set(re.findall(rb"icons[\\/]icon\d+\.png", data))
print("Unique icon path byte patterns found:")
for m in sorted(icon_matches):
    print(" ", repr(m))

backslash_count = data.count(b"\\")
print(f"Total backslash bytes in zip: {backslash_count}")
