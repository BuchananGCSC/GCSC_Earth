#!/usr/bin/env python3
"""Snapshot the Smithsonian GVP Holocene volcano list into a static GeoJSON file.

The GVP web service sends no CORS headers, so a static site cannot fetch it from
the browser. The list changes rarely; re-run this script a few times a year.

    python3 scripts/snapshot-volcanoes.py

Source: Global Volcanism Program, Smithsonian Institution (Volcanoes of the World).
Check https://volcano.si.edu for current terms of use and citation format.
"""
import json
import pathlib
import subprocess
from datetime import date

URL = ('https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=1.0.0'
       '&request=GetFeature&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes'
       '&outputFormat=application/json')
ROOT = pathlib.Path(__file__).resolve().parent.parent
# The app's copy is the one students see; the Phase 0 benchmark page keeps its own copy.
OUTS = [ROOT / 'app' / 'data' / 'gvp-holocene-volcanoes.geojson',
        ROOT / 'phase0' / 'data' / 'gvp-holocene-volcanoes.geojson']

# Fields an intro-level student layer needs. The long text summaries and photo
# links are left out to keep the file small; link to volcano.si.edu by number instead.
KEEP = {
    'Volcano_Number': 'number', 'Volcano_Name': 'name', 'Primary_Volcano_Type': 'type',
    'Volcanic_Landform': 'landform', 'Elevation': 'elevation_m', 'Last_Eruption_Year': 'last_eruption',
    'Tectonic_Setting': 'tectonic_setting', 'Major_Rock_Type': 'rock_type', 'Country': 'country',
    'Region': 'region',
}


def main():
    # curl uses the macOS keychain, so it works behind school TLS-inspection proxies
    # where Python's own certificate bundle does not.
    raw = subprocess.run(['curl', '-sSfL', '--max-time', '120', URL], check=True, capture_output=True).stdout
    src = json.loads(raw)
    feats = []
    for f in src['features']:
        p = f['properties']
        lon, lat = f['geometry']['coordinates'][:2]
        feats.append({
            'type': 'Feature',
            'geometry': {'type': 'Point', 'coordinates': [round(lon, 4), round(lat, 4)]},
            'properties': {new: p.get(old) for old, new in KEEP.items()},
        })
    out = {
        'type': 'FeatureCollection',
        'metadata': {
            'source': 'Global Volcanism Program, Smithsonian Institution — Volcanoes of the World (Holocene)',
            'url': 'https://volcano.si.edu',
            'retrieved': date.today().isoformat(),
            'count': len(feats),
        },
        'features': feats,
    }
    text = json.dumps(out, separators=(',', ':'), ensure_ascii=False)
    for path in OUTS:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        print(f'Wrote {len(feats)} volcanoes, {path.stat().st_size // 1024} KB -> {path}')


if __name__ == '__main__':
    main()
