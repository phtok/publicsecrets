#!/usr/bin/env python3
import json
import mimetypes
import pathlib
import shutil
import urllib.error
import urllib.parse
import urllib.request


ROOT = pathlib.Path(__file__).resolve().parents[1]
PEOPLE_FILE = ROOT / "data" / "people.json"
UPLOADS_PROFILE_DIR = ROOT / "data" / "uploads" / "profile"
PORTRAITS_DIR = ROOT / "assets" / "portraits"


def guess_ext(url: str, content_type: str) -> str:
    content_type = (content_type or "").split(";")[0].strip().lower()
    if content_type:
        ext = mimetypes.guess_extension(content_type)
        if ext:
            return ext.replace(".jpe", ".jpg")
    parsed = urllib.parse.urlparse(url)
    suffix = pathlib.Path(parsed.path).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"}:
        return ".jpg" if suffix == ".jpeg" else suffix
    return ".jpg"


def read_bytes(source: str):
    if source.startswith("http://") or source.startswith("https://"):
        req = urllib.request.Request(
            source,
            headers={
                "User-Agent": "Mozilla/5.0 (Public-Secrets-Portrait-Localizer)"
            },
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            data = response.read()
            content_type = response.headers.get("Content-Type", "")
        return data, content_type
    if source.startswith("/uploads/"):
        local = ROOT / "data" / source.lstrip("/")
        if local.exists():
            return local.read_bytes(), ""
    if source.startswith("/assets/"):
        local = ROOT / source.lstrip("/")
        if local.exists():
            return local.read_bytes(), ""
    return None, ""


def main():
    people = json.loads(PEOPLE_FILE.read_text(encoding="utf-8"))
    PORTRAITS_DIR.mkdir(parents=True, exist_ok=True)

    ok = 0
    skipped = 0
    failed = []

    for row in people:
        row.pop("bioShort", None)
        slug = str(row.get("slug") or "").strip()
        if not slug:
            skipped += 1
            continue
        source = str(row.get("portraitUrl") or "").strip()
        if not source:
            skipped += 1
            continue
        if source.startswith("/assets/portraits/"):
            skipped += 1
            continue

        try:
            data, content_type = read_bytes(source)
            if not data:
                raise RuntimeError("Quelle nicht lesbar")
            ext = guess_ext(source, content_type)
            out_rel = f"/assets/portraits/{slug}{ext}"
            out_path = ROOT / out_rel.lstrip("/")
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(data)
            row["portraitUrl"] = out_rel
            ok += 1
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, RuntimeError) as err:
            failed.append((slug, source, str(err)))
        except Exception as err:  # noqa: BLE001
            failed.append((slug, source, f"Unerwarteter Fehler: {err}"))

    # Extra safety: ensure Ua image exists from local upload.
    ua_upload = UPLOADS_PROFILE_DIR / "ua-sigrun.png"
    ua_asset = PORTRAITS_DIR / "ua.png"
    if ua_upload.exists() and not ua_asset.exists():
        shutil.copyfile(ua_upload, ua_asset)
    for row in people:
        if str(row.get("slug") or "") == "ua":
            if ua_asset.exists():
                row["portraitUrl"] = "/assets/portraits/ua.png"
            break

    PEOPLE_FILE.write_text(json.dumps(people, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"localized: {ok}")
    print(f"skipped: {skipped}")
    print(f"failed: {len(failed)}")
    for slug, source, reason in failed:
        print(f"- {slug}: {source} ({reason})")


if __name__ == "__main__":
    main()
