"""Build a Firefox/Chrome extension zip with strict forward-slash paths.

Windows PowerShell's Compress-Archive writes Windows-style backslash paths
into the zip's central directory. Chrome Web Store is lenient about this;
Mozilla AMO is strict and rejects the upload with "Invalid file name in
archive: icons\\icon128.png". Python's zipfile module writes proper
forward-slash POSIX paths per APPNOTE.TXT 4.4.17.1.

Usage:
    python scripts/build_zip.py <output.zip> file1 file2 dir1 ...
"""
import os
import sys
import zipfile


def add_path(zf, path):
    if os.path.isdir(path):
        for root, _, files in os.walk(path):
            for f in sorted(files):
                full = os.path.join(root, f)
                arcname = full.replace(os.sep, "/")
                zf.write(full, arcname)
                print(f"  + {arcname}")
    else:
        arcname = path.replace(os.sep, "/")
        zf.write(path, arcname)
        print(f"  + {arcname}")


def main():
    out = sys.argv[1]
    inputs = sys.argv[2:]
    print(f"Building {out}")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in inputs:
            add_path(zf, p)
    size = os.path.getsize(out)
    print(f"Wrote {out} ({size} bytes)")


if __name__ == "__main__":
    main()
