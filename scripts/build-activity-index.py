#!/usr/bin/env python3
"""Build the lesson list (index.json) from the lesson files in a folder.

Run automatically when the site is published, so adding a lesson only means adding
its file to app/activities/. Run it by hand to refresh the list for local testing:

    python3 scripts/build-activity-index.py                 # app/activities
    python3 scripts/build-activity-index.py _site/activities

A file that cannot be read as a lesson is left out of the list with a warning, so one
bad upload cannot take the other lessons down. Lessons are ordered by their "order"
number (lower first), then by title.
"""
import json
import pathlib
import re
import sys

folder = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent.parent / 'app' / 'activities'
entries, skipped = [], []
for f in sorted(folder.glob('*.json')):
    if f.name == 'index.json':
        continue
    try:
        if not re.fullmatch(r'[a-z0-9-]{1,60}', f.stem):
            raise ValueError('file name must use only lowercase letters, numbers and hyphens')
        d = json.loads(f.read_text(encoding='utf-8'))
        if not isinstance(d, dict) or not str(d.get('title', '')).strip():
            raise ValueError('no title')
        if not isinstance(d.get('stops'), list) or not d['stops']:
            raise ValueError('no stops')
        order = d.get('order', 100)
        entries.append((order if isinstance(order, (int, float)) else 100, str(d['title']).strip(), {
            'id': f.stem, 'title': str(d['title']).strip(),
            'minutes': d.get('minutes') if isinstance(d.get('minutes'), (int, float)) else None,
            'summary': str(d.get('summary', '')).strip(),
        }))
    except Exception as e:                                   # noqa: BLE001 - report and carry on
        skipped.append((f.name, str(e)))

entries.sort(key=lambda t: (t[0], t[1].lower()))
(folder / 'index.json').write_text(json.dumps({'activities': [e[2] for e in entries]}, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(f'Lesson list: {len(entries)} lesson(s) -> {folder / "index.json"}')
for name, why in skipped:
    print(f'::warning file=app/activities/{name}::Lesson left out of the list: {why}')
