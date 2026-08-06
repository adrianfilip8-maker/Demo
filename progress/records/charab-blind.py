#!/usr/bin/env python3
"""
charab-blind.py — build the blind side-by-side pairs for the character A/B critic round.

  build <seed>   randomise side assignment, write pairs + blind-key.json
  reveal         print the key (ONLY after the critic's verdicts are written)

PREREG-charab §2 requires the key to exist BEFORE the critic runs, so it cannot be retro-fitted.
This writes `blind-key.json` at build time and refuses to overwrite an existing key for the same
seed — if a round has already been built, re-building it silently would let a second attempt be
passed off as the first.

The composites carry NO model names, no filenames, and no ordering cue: sides are labelled only
"A" and "B", assignment is per-shot (so a critic cannot learn "left is always the new one" from
the first pair), and the assignment comes from a seeded PRNG recorded in the key.
"""
import hashlib
import json
import os
import random
import sys

DIR = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(DIR, 'charab')
OUT = os.path.join(DIR, 'charab', 'blind')
KEY = os.path.join(DIR, 'charab', 'blind-key.json')
SHOTS = ['sly-closeup', 'sly-profile', 'sly-perch', 'traversal']
ARMS = ['base', 'model3']


def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()[:16]


def build(seed):
    from PIL import Image, ImageDraw
    if os.path.exists(KEY):
        prev = json.load(open(KEY))
        if prev.get('seed') == seed:
            sys.exit(f'REFUSING: a key for seed {seed} already exists at {KEY}.\n'
                     '  A round that has been built once must not be silently rebuilt — use a new seed.')
    os.makedirs(OUT, exist_ok=True)
    rng = random.Random(seed)
    key = {'seed': seed, 'pairs': {}}
    for shot in SHOTS:
        paths = {a: os.path.join(SRC, f'{shot}.{a}.png') for a in ARMS}
        missing = [a for a, p in paths.items() if not os.path.exists(p)]
        if missing:
            print(f'  skip {shot}: missing arms {missing}')
            continue
        left_arm = rng.choice(ARMS)                       # per-shot, so side is not learnable
        right_arm = [a for a in ARMS if a != left_arm][0]
        L, R = Image.open(paths[left_arm]).convert('RGB'), Image.open(paths[right_arm]).convert('RGB')
        h = max(L.height, R.height)
        gap = 16
        cv = Image.new('RGB', (L.width + R.width + gap, h + 34), (24, 24, 26))
        cv.paste(L, (0, 34)); cv.paste(R, (L.width + gap, 34))
        d = ImageDraw.Draw(cv)
        d.text((L.width // 2 - 4, 10), 'A', fill=(235, 235, 235))
        d.text((L.width + gap + R.width // 2 - 4, 10), 'B', fill=(235, 235, 235))
        out = os.path.join(OUT, f'{shot}.pair.png')
        cv.save(out)
        key['pairs'][shot] = {
            'A': left_arm, 'B': right_arm,
            'A_sha': sha(paths[left_arm]), 'B_sha': sha(paths[right_arm]),
            'pair': os.path.relpath(out, DIR),
        }
        print(f'  {shot}: A={left_arm:7s} B={right_arm:7s} -> {os.path.relpath(out, DIR)}')
    json.dump(key, open(KEY, 'w'), indent=1)
    print(f'\nkey written: {KEY}  ({len(key["pairs"])} pairs)')
    print('The critic must NOT read this file. Give it only progress/records/charab/blind/ and the reference images.')


def reveal():
    if not os.path.exists(KEY):
        sys.exit('no key — nothing has been built')
    k = json.load(open(KEY))
    print(f'seed {k["seed"]}')
    for shot, v in k['pairs'].items():
        print(f'  {shot:14s} A={v["A"]:7s} ({v["A_sha"]})   B={v["B"]:7s} ({v["B_sha"]})')


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'reveal'
    if cmd == 'build':
        build(int(sys.argv[2]) if len(sys.argv) > 2 else 1)
    elif cmd == 'reveal':
        reveal()
    else:
        sys.exit('usage: charab-blind.py build <seed> | reveal')
