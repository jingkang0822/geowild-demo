#!/usr/bin/env python3
"""Generate the portfolio bank and package its already sourced local photographs.

Canonical records own attribution and ranges. Existing photographs are validated
and never overwritten. Downloads are sequential and fail immediately on errors.
The macOS --check command is offline; CI separately decodes all photos in Chromium.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/animals.json'
RUNTIME = ROOT / 'site/js/animals.js'
USER_AGENT = 'GeoWild/1.1 educational animal geography game (Wikimedia source attribution)'


def request(url):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()


def dimensions(path):
    result = subprocess.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', str(path)], check=True, text=True, capture_output=True)
    width = re.search(r'pixelWidth: (\d+)', result.stdout)
    height = re.search(r'pixelHeight: (\d+)', result.stdout)
    if not width or not height:
        raise ValueError(f'Image decode failed: {path}')
    return int(width[1]), int(height[1])


def validate_image(path):
    data = path.read_bytes()
    width, height = dimensions(path)
    if not data.startswith(b'\xff\xd8\xff') or not data.endswith(b'\xff\xd9'):
        raise ValueError(f'Invalid JPEG: {path}')
    if min(width, height) < 200 or not 400 <= max(width, height) <= 1000 or len(data) > 400_000:
        raise ValueError(f'Unusable photo dimensions/size: {path}: {width}x{height}, {len(data)} bytes')
    return {'id': path.stem, 'width': width, 'height': height, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def download(animal):
    relative = animal['image']
    if relative != f"assets/animals/{animal['id']}.jpg":
        raise ValueError(f'Unsafe asset path: {relative}')
    path = ROOT / 'site' / relative
    if not path.exists():
        print(f"Downloading {animal['id']}", flush=True)
        with tempfile.TemporaryDirectory(prefix='geowild-photo-') as temporary:
            candidate = Path(temporary) / 'source'
            candidate.write_bytes(request(animal['photo'].get('downloadUrl', animal['photo']['url'])))
            output = Path(temporary) / 'photo.jpg'
            subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '75', '-Z', '800', str(candidate), '--out', str(output)], check=True, capture_output=True)
            validate_image(output)
            with path.open('xb') as destination:
                destination.write(output.read_bytes())
    return validate_image(path)


def runtime_text(animals):
    return '// Generated from data/animals.json by scripts/build-animal-bank.py.\nwindow.ANIMALS = ' + json.dumps(animals, ensure_ascii=False, indent=2) + ';\n'


def validate_records(animals):
    world = json.loads((ROOT / 'site/js/world.js').read_text().removeprefix('window.WORLD_DATA = ').rstrip().removesuffix(';'))
    codes = {feature['properties']['code'] for feature in world['features']}
    for field in ('id', 'scientificName'):
        if len({a[field] for a in animals}) != len(animals):
            raise ValueError(f'Duplicate animal {field}')
    for animal in animals:
        if not re.fullmatch(r'[a-z0-9-]+', animal['id']):
            raise ValueError(f"Invalid id: {animal['id']}")
        for field in ('name', 'scientificName', 'nativeLabel', 'fact'):
            if not animal.get(field):
                raise ValueError(f"Missing {field}: {animal['id']}")
        if animal.get('tier') not in ('familiar', 'discovery'):
            raise ValueError(f"Missing familiarity tier: {animal['id']}")
        if not animal['nativeCountries'] or not set(animal['nativeCountries']) <= codes:
            raise ValueError(f"Missing country geometry: {animal['id']}: {animal['nativeCountries']}")
        if not animal.get('sources') or any(not source.get('label') or not source['url'].startswith('https://') for source in animal['sources']):
            raise ValueError(f"Missing range authority: {animal['id']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--download', action='store_true', help='Download missing photos and generate the runtime bank')
    mode.add_argument('--check', action='store_true', help='Verify canonical/runtime equality and all photos offline on macOS')
    args = parser.parse_args()
    animals = json.loads(SOURCE.read_text())
    validate_records(animals)
    evidence = [validate_image(ROOT / 'site' / animal['image']) if args.check else download(animal) for animal in animals]
    if args.check:
        if RUNTIME.read_text() != runtime_text(animals):
            raise ValueError('Runtime bank differs from canonical data; build before publishing')
    else:
        RUNTIME.write_text(runtime_text(animals))
        (ROOT / 'docs/animal-assets.json').write_text(json.dumps(evidence, indent=2) + '\n')
    print(f'PASS: {len(animals)} species, {sum(e["bytes"] for e in evidence):,} photo bytes; canonical/runtime verified', flush=True)


if __name__ == '__main__':
    main()
