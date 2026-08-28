#!/usr/bin/env python3
"""Dependency-free integrity checks for the static PWA."""

from html.parser import HTMLParser
from pathlib import Path
import json
import re


ROOT = Path(__file__).resolve().parents[1]


class IndexParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.references = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get("id"):
            self.ids.append(values["id"])
        for attribute in ("src", "href"):
            if values.get(attribute):
                self.references.append((attribute, values[attribute]))


def local_path(reference):
    if reference.startswith(("http:", "https:", "tel:", "sms:", "#")):
        return None
    clean = reference.split("#", 1)[0].split("?", 1)[0]
    return clean or None


def main():
    parser = IndexParser()
    parser.feed((ROOT / "index.html").read_text(encoding="utf-8"))

    duplicate_ids = sorted({item for item in parser.ids if parser.ids.count(item) > 1})
    assert not duplicate_ids, f"Powtórzone identyfikatory HTML: {duplicate_ids}"

    app_source = (ROOT / "app.js").read_text(encoding="utf-8")
    used_ids = set(re.findall(r"\$\('([^']+)'\)", app_source))
    missing_ids = sorted(used_ids - set(parser.ids))
    assert not missing_ids, f"Brak elementów HTML używanych w JS: {missing_ids}"

    for attribute, reference in parser.references:
        path = local_path(reference)
        if path:
            assert (ROOT / path).is_file(), f"Brak zasobu {attribute}={reference}"

    manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))
    assert manifest.get("display") == "standalone"
    assert manifest.get("start_url")
    assert manifest.get("scope") == "./"
    for icon in manifest.get("icons", []):
        assert (ROOT / icon["src"]).is_file(), f"Brak ikony {icon['src']}"

    service_worker = (ROOT / "sw.js").read_text(encoding="utf-8")
    cached_paths = re.findall(r"'((?:\./)[^']+)'", service_worker)
    for reference in cached_paths:
        relative = reference[2:]
        if relative:
            assert (ROOT / relative).exists(), f"Service worker odwołuje się do brakującego pliku: {reference}"

    assert "WSTAW_TUTAJ" not in "\n".join(
        path.read_text(encoding="utf-8", errors="ignore")
        for path in ROOT.glob("*.js")
    )

    print(
        "Walidacja PWA: OK "
        f"({len(parser.ids)} identyfikatory, {len(used_ids)} używane przez JS, "
        f"{len(cached_paths)} wpisów cache)"
    )


if __name__ == "__main__":
    main()
