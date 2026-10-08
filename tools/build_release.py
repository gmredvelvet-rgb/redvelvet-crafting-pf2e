"""Build only the Foundry runtime, assets and player-facing documentation."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "module.json").read_text(encoding="utf-8"))
OUT = ROOT / "dist"
OUT.mkdir(exist_ok=True)
files = [ROOT / name for name in ["module.json", "index.js", "README.md", "CHANGELOG.md", "LICENSE"]]
for folder in ["scripts", "styles", "assets", "lang", "docs"]:
    files.extend(file for file in (ROOT / folder).rglob("*") if file.is_file())
archive = OUT / f"{manifest['id']}.zip"
with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=9) as package:
    for file in sorted(files):
        relative = file.relative_to(ROOT).as_posix()
        entry = ZipInfo(relative, date_time=(2026, 10, 7, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        payload = file.read_bytes()
        if file.suffix in [".js", ".json", ".css", ".svg", ".md"] or file.name == "LICENSE":
            payload = payload.replace(b"\r\n", b"\n")
        package.writestr(entry, payload, compresslevel=9)
shutil.copyfile(ROOT / "module.json", OUT / "module.json")
with ZipFile(archive) as package:
    assert package.testzip() is None
    assert json.loads(package.read("module.json"))["version"] == manifest["version"]
    assert not any(name.startswith(("node_modules/", "tests/", "tools/", ".git/")) for name in package.namelist())
checksums = [f"{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}" for file in [archive, OUT / "module.json"]]
(OUT / "SHA256SUMS.txt").write_text("\n".join(checksums) + "\n", encoding="utf-8")
print(f"Release {manifest['version']}: {len(files)} files, {archive.stat().st_size:,} bytes. ZIP verified; SHA-256 written.")
