#!/usr/bin/env python3
"""Snapshot tectonic plate boundaries into a small static GeoJSON file.

Keeping a copy in the site means the layer does not depend on a third-party
host that a school filter might block. The data do not change.

    python3 scripts/snapshot-plates.py

Source: Peter Bird (2003), "An updated digital model of plate boundaries",
Geochemistry Geophysics Geosystems 4(3), 1027, doi:10.1029/2001GC000252.
GeoJSON conversion by Hugo Ahlenius, Nordpil (github.com/fraxen/tectonicplates),
Open Data Commons Attribution License 1.0. Credit both.
"""
import json
import pathlib
import subprocess
from datetime import date

URL = 'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json'
OUT = pathlib.Path(__file__).resolve().parent.parent / 'app' / 'data' / 'plate-boundaries.geojson'


def main():
    # curl uses the macOS keychain, so it works behind school TLS-inspection proxies.
    raw = subprocess.run(['curl', '-sSfL', '--max-time', '120', URL], check=True, capture_output=True).stdout
    src = json.loads(raw)
    feats = []
    for f in src['features']:
        g = f['geometry']
        lines = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
        for line in lines:
            feats.append({
                'type': 'Feature',
                'geometry': {'type': 'LineString',
                             'coordinates': [[round(float(x), 3), round(float(y), 3)] for x, y, *_ in line]},
                'properties': {'name': str(f['properties'].get('Name', ''))[:20]},
            })
    out = {
        'type': 'FeatureCollection',
        'metadata': {
            'source': 'Peter Bird (2003) plate boundary model PB2002; GeoJSON by Hugo Ahlenius, Nordpil',
            'url': 'https://github.com/fraxen/tectonicplates',
            'license': 'Open Data Commons Attribution License 1.0',
            'retrieved': date.today().isoformat(),
            'count': len(feats),
        },
        'features': feats,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(',', ':')))
    print(f'Wrote {len(feats)} boundary lines, {OUT.stat().st_size // 1024} KB -> {OUT}')


if __name__ == '__main__':
    main()
