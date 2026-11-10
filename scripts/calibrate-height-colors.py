#!/usr/bin/env python3
"""Work out which color means which height on NASA's "heights in color" maps.

NASA Trek publishes the colored elevation maps for the Moon and Mars without a key.
This script downloads the color map at a coarse level, lines it up with the elevation
grid used for 3D terrain, and prints the typical color at each height. The printed
stops are pasted into app/config.js as the layer's `scale`.

    python3 scripts/calibrate-height-colors.py

Needs numpy and Pillow, and the elevation grids fetched by build-planet-terrain.py.
"""
import importlib.util
import io
import pathlib
import subprocess

import numpy as np
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('terrain', HERE / 'build-planet-terrain.py')
terrain = importlib.util.module_from_spec(spec)
spec.loader.exec_module(terrain)

LEVEL = 3            # 16 x 8 tiles of 256 px
MAPS = {
    'mars': ('https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg', 2),
    'moon': ('https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrShade_Global_128ppd_v04/1.0.0/default/default028mm/{z}/{y}/{x}.png', 1),
}


def mosaic(url):
    nx, ny = 2 ** (LEVEL + 1), 2 ** LEVEL
    out = Image.new('RGB', (nx * 256, ny * 256))
    for y in range(ny):
        for x in range(nx):
            raw = subprocess.run(['curl', '-sSfL', '--max-time', '60', url.format(z=LEVEL, x=x, y=y)], check=True, capture_output=True).stdout
            out.paste(Image.open(io.BytesIO(raw)).convert('RGB'), (x * 256, y * 256))
    return np.asarray(out).astype(np.float32)


for world, (url, step_km) in MAPS.items():
    rgb = mosaic(url)
    h = terrain.load(world)
    h = np.asarray(Image.fromarray(h).resize((rgb.shape[1], rgb.shape[0]), Image.BILINEAR)) / 1000.0
    # Skip the polar rows, where the flat map is badly stretched.
    rows = slice(rgb.shape[0] // 9, rgb.shape[0] * 8 // 9)
    h, rgb = h[rows], rgb[rows]
    print(f'{world}: color by height (km), from {h.min():.1f} to {h.max():.1f}')
    lo, hi = int(np.floor(h.min() / step_km)) * step_km, int(np.ceil(h.max() / step_km)) * step_km
    for k in range(lo, hi + 1, step_km):
        m = np.abs(h - k) < step_km / 4
        if m.sum() < 40:
            continue
        px = rgb[m]
        # Hill shading darkens slopes; keep the brighter half of the pixels, then take the middle color.
        lum = px.sum(axis=1)
        px = px[lum >= np.median(lum)]
        r, g, b = (int(v) for v in np.median(px, axis=0))
        print(f"  [{k}, '#{r:02x}{g:02x}{b:02x}'],   // {int(m.sum())} pixels")
