"""Fail if the packaged zip is missing any file its manifest references.

This is the guard against the class of bug where build.sh's hand-maintained
FILES list drifts from manifest.json: a new content script, background script,
declarativeNetRequest ruleset, popup, or icon gets wired into the manifest but
never added to the package, so the built zip references files that aren't in
it. Chrome loads such a package broken; Firefox AMO rejects it outright ("file
named in manifest not found in archive").

Reads manifest.json out of the zip, resolves every path the manifest points
at, and exits non-zero (listing what's missing) if any of them are absent from
the archive. Run it on each built zip before upload -- build.sh does this
automatically, so a bad package can't be produced.

Usage:
    python scripts/check_manifest_files.py <package.zip>
"""
import json
import sys
import zipfile


def referenced_files(manifest):
    """Every in-package file path the manifest points at."""
    refs = set()

    # Content scripts: each entry's js[] (and css[], if ever used).
    for cs in manifest.get("content_scripts", []):
        refs.update(cs.get("js", []))
        refs.update(cs.get("css", []))

    # Background: MV3 service_worker and/or the Firefox scripts[] fallback.
    bg = manifest.get("background", {})
    if bg.get("service_worker"):
        refs.add(bg["service_worker"])
    refs.update(bg.get("scripts", []))

    # declarativeNetRequest static rulesets.
    dnr = manifest.get("declarative_net_request", {})
    for rr in dnr.get("rule_resources", []):
        if rr.get("path"):
            refs.add(rr["path"])

    # Action popup + its icons.
    action = manifest.get("action", {})
    if action.get("default_popup"):
        refs.add(action["default_popup"])
    refs.update(action.get("default_icon", {}).values())

    # Top-level icons.
    refs.update(manifest.get("icons", {}).values())

    # web_accessible_resources (MV3: list of objects with resources[]).
    for war in manifest.get("web_accessible_resources", []):
        if isinstance(war, dict):
            refs.update(war.get("resources", []))
        elif isinstance(war, str):
            refs.add(war)

    refs.discard(None)
    refs.discard("")
    return refs


def main():
    if len(sys.argv) != 2:
        print("usage: python scripts/check_manifest_files.py <package.zip>")
        sys.exit(2)

    zip_path = sys.argv[1]
    try:
        with zipfile.ZipFile(zip_path) as z:
            names = set(z.namelist())
            if "manifest.json" not in names:
                print(f"FAIL: {zip_path} has no manifest.json")
                sys.exit(1)
            manifest = json.loads(z.read("manifest.json"))
    except (OSError, zipfile.BadZipFile, ValueError) as e:
        print(f"FAIL: could not read {zip_path}: {e}")
        sys.exit(1)

    refs = referenced_files(manifest)
    missing = sorted(r for r in refs if r not in names)

    version = manifest.get("version", "?")
    if missing:
        print(f"FAIL: {zip_path} (v{version}) references {len(refs)} files; "
              f"{len(missing)} MISSING from the package:")
        for m in missing:
            print(f"  - {m}")
        print("\nAdd the missing file(s) to build.sh's FILES list.")
        sys.exit(1)

    print(f"OK: {zip_path} (v{version}) -- all {len(refs)} "
          f"manifest-referenced files are present.")
    sys.exit(0)


if __name__ == "__main__":
    main()
