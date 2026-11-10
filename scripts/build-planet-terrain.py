#!/usr/bin/env python3
"""Build 3D-terrain tiles for the Moon and Mars from NASA elevation grids.

Earth's terrain comes from a public tile service. Nothing equivalent exists for the
Moon and Mars, so this script turns NASA's global elevation grids into small image
tiles that are stored with the site (app/data/terrain/<world>/<z>/<x>/<y>.png).

    python3 scripts/build-planet-terrain.py            # both worlds
    python3 scripts/build-planet-terrain.py mars       # one world

Needs numpy and Pillow. The raw grids (33 MB each) are downloaded with curl into
.cache/dem/ the first time and reused after that.

Tile layout: plain latitude/longitude grid, 2 x 1 tiles at level 0, doubling each
level; y = 0 is the north edge. Each tile is 180 x 180 pixels. Height is packed
into the colors the same way as the Earth tiles ("Terrarium" encoding):
    height in metres = red * 256 + green + blue / 256 - 32768

Sources (16 pixels per degree, about 3.7 km on Mars and 1.9 km on the Moon):
  Mars: MGS MOLA Mission Experiment Gridded Data Record, megt90n000eb.img.
        Height above the Mars areoid (its "sea level"). NASA PDS Geosciences Node.
  Moon: LRO LOLA Gridded Data Record, ldem_16.img.
        Height above a sphere of radius 1737.4 km. NASA PDS Geosciences Node.
Both are public domain; credit NASA and the instrument teams.
"""
import pathlib
import subprocess
import sys

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / '.cache' / 'dem'
OUT = ROOT / 'app' / 'data' / 'terrain'

MAX_LEVEL = 4        # deepest tile level: 32 x 16 tiles
TILE = 180           # pixels per tile; 32 x 180 = 5760, exactly the source grid, so nothing is resampled
STEP_M = 8           # heights are rounded to this many metres so the files compress well

WORLDS = {
    'mars': {
        'url': 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.img',
        'dtype': '>i2', 'scale': 1.0,
        'checks': [('Olympus Mons summit', 18.65, -133.8), ('Hellas basin floor', -42.5, 70.0), ('Valles Marineris floor', -13.9, -59.2)],
    },
    'moon': {
        'url': 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_16.img',
        'dtype': '<i2', 'scale': 0.5,
        'checks': [('Tycho floor', -43.3, -11.4), ('Mare Imbrium', 35.0, -15.0), ('South Pole-Aitken floor', -53.0, -169.0)],
    },
}
SRC_W, SRC_H = 5760, 2880      # 16 pixels per degree, longitude 0..360 east, north at the top


def load(world):
    spec = WORLDS[world]
    CACHE.mkdir(parents=True, exist_ok=True)
    raw = CACHE / spec['url'].rsplit('/', 1)[1]
    if not raw.exists() or raw.stat().st_size != SRC_W * SRC_H * 2:
        print(f'Downloading {spec["url"]}')
        # curl uses the macOS keychain, so it works behind school TLS-inspection proxies.
        subprocess.run(['curl', '-sSfL', '--max-time', '600', '-o', str(raw), spec['url']], check=True)
    h = np.fromfile(raw, dtype=spec['dtype']).reshape(SRC_H, SRC_W).astype(np.float32) * spec['scale']
    return np.roll(h, SRC_W // 2, axis=1)        # 0..360 east  ->  -180..180


def encode(h):
    """Heights in metres -> Terrarium RGB."""
    v = np.round(h / STEP_M) * STEP_M + 32768.0
    v = np.clip(v, 0, 65535).astype(np.uint16)
    rgb = np.zeros(h.shape + (3,), dtype=np.uint8)
    rgb[..., 0] = v >> 8
    rgb[..., 1] = v & 255
    return rgb


def build(world):
    h = load(world)
    spec = WORLDS[world]
    print(f'{world}: lowest {h.min():.0f} m, highest {h.max():.0f} m')
    for name, lat, lon in spec['checks']:
        r, c = int((90 - lat) * 16), int((lon + 180) * 16)
        print(f'  {name}: {h[r, c]:.0f} m')

    w = TILE * 2 ** (MAX_LEVEL + 1)
    grid = h if w == SRC_W else np.asarray(Image.fromarray(h).resize((w, w // 2), Image.BILINEAR))
    total = 0
    for z in range(MAX_LEVEL, -1, -1):
        nx, ny = 2 ** (z + 1), 2 ** z
        for x in range(nx):
            d = OUT / world / str(z) / str(x)
            d.mkdir(parents=True, exist_ok=True)
            for y in range(ny):
                tile = grid[y * TILE:(y + 1) * TILE, x * TILE:(x + 1) * TILE]
                f = d / f'{y}.png'
                Image.fromarray(encode(tile)).save(f, optimize=True)
                total += f.stat().st_size
        if z:                                      # halve the grid for the next level up
            grid = grid.reshape(grid.shape[0] // 2, 2, grid.shape[1] // 2, 2).mean(axis=(1, 3))
    print(f'  wrote levels 0-{MAX_LEVEL} to {OUT / world}: {total / 1e6:.1f} MB')


if __name__ == '__main__':
    for name in (sys.argv[1:] or list(WORLDS)):
        if name not in WORLDS:
            sys.exit(f'Unknown world "{name}". Choose from: {", ".join(WORLDS)}')
        build(name)
