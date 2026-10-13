#!/usr/bin/env python3
"""Debug-mode project order (dev-mode.js).

While debug mode is on, tools/dev-server.py stores the order arranged in the
browser as a draft in .dev-order.json ({"work.html": [card keys, ...]}).

    python3 tools/dev_order.py status    # show the draft and the flag
    python3 tools/dev_order.py apply     # write the draft into the HTML, turn debug mode off
    python3 tools/dev_order.py discard   # drop the draft, turn debug mode off
    python3 tools/dev_order.py on|off    # set DEV_MODE in dev-mode.js
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DRAFT = ROOT / ".dev-order.json"
FLAG_FILE = ROOT / "dev-mode.js"
FLAG = re.compile(r"^const DEV_MODE = (true|false);", re.M)

GRID = re.compile(r"<div\b[^>]*\bdata-project-grid\b[^>]*>")
TOKEN = re.compile(r"<!--[\s\S]*?-->|<div\b[^>]*>|</div\s*>")
CARD = re.compile(r'\bclass="[^"]*\bcard\b')


def read_text(path):
    with open(path, encoding="utf-8", newline="") as handle:
        return handle.read()


def write_text(path, text):
    with open(path, "w", encoding="utf-8", newline="") as handle:
        handle.write(text)


def read_draft():
    try:
        drafts = json.loads(read_text(DRAFT))
    except (OSError, ValueError):
        return {}
    return drafts if isinstance(drafts, dict) else {}


def write_draft(drafts):
    if drafts:
        write_text(DRAFT, json.dumps(drafts, indent=2) + "\n")
    else:
        DRAFT.unlink(missing_ok=True)


def set_page_order(page, order):
    drafts = read_draft()
    if order:
        drafts[page] = order
    else:
        drafts.pop(page, None)
    write_draft(drafts)


def set_dev_mode(on):
    source = read_text(FLAG_FILE)
    updated, count = FLAG.subn(f"const DEV_MODE = {'true' if on else 'false'};", source, count=1)
    if not count:
        raise SystemExit("DEV_MODE flag not found in dev-mode.js")
    if updated != source:
        write_text(FLAG_FILE, updated)


def card_key(tag):
    """Same identity as keyOf() in dev-mode.js: collection + sorted card-* classes."""
    collection = re.search(r'\bdata-collection="([^"]*)"', tag)
    classes = re.search(r'\bclass="([^"]*)"', tag)
    names = sorted(name for name in (classes.group(1).split() if classes else []) if name.startswith("card-"))
    return " ".join([collection.group(1) if collection else "", *names])


def card_blocks(html):
    """(start, end, key) for each top-level card in the project grid, with indentation."""
    grid = GRID.search(html)
    if not grid:
        raise ValueError("project grid not found")
    blocks, depth, start, key = [], 1, -1, None
    for match in TOKEN.finditer(html, grid.end()):
        tag = match.group(0)
        if tag.startswith("<!--"):
            continue
        if tag.startswith("</"):
            depth -= 1
            if depth == 1 and start >= 0:
                blocks.append((start, match.end(), key))
                start = -1
            if depth == 0:
                return blocks
            continue
        if depth == 1 and CARD.search(tag):
            line_start = html.rfind("\n", 0, match.start()) + 1
            start = line_start if not html[line_start:match.start()].strip() else match.start()
            key = card_key(tag)
        depth += 1
    raise ValueError("unbalanced project grid")


def reorder(html, order):
    blocks = card_blocks(html)
    keys = [key for _, _, key in blocks]
    if len(set(keys)) != len(keys):
        raise ValueError("cards share a key; give each card a unique card-* class")
    rank = {key: index for index, key in enumerate(dict.fromkeys(order))}
    # Listed cards fill their own slots in draft order; unlisted cards stay put.
    listed = sorted((b for b in blocks if b[2] in rank), key=lambda b: rank[b[2]])
    placed = iter(listed)
    result = [next(placed) if block[2] in rank else block for block in blocks]
    out = [html[:blocks[0][0]]]
    for index, (start, end, _) in enumerate(result):
        out.append(html[start:end])
        if index < len(blocks) - 1:
            out.append(html[blocks[index][1]:blocks[index + 1][0]])
    out.append(html[blocks[-1][1]:])
    return "".join(out)


def apply():
    for page, order in read_draft().items():
        path = (ROOT / page).resolve()
        if path.parent != ROOT or path.suffix != ".html" or not path.is_file():
            print(f"skipped {page}: not a page in the site root")
            continue
        html = read_text(path)
        updated = reorder(html, order)
        if updated != html:
            write_text(path, updated)
        print(f"applied order to {page}")
    write_draft({})
    set_dev_mode(False)
    print("debug mode off")


def discard():
    write_draft({})
    set_dev_mode(False)
    print("draft discarded, debug mode off")


def status():
    print(f"DEV_MODE = {FLAG.search(read_text(FLAG_FILE)).group(1)}")
    print(json.dumps(read_draft(), indent=2) if DRAFT.exists() else "no draft order")


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "status"
    actions = {"apply": apply, "discard": discard, "status": status,
               "on": lambda: set_dev_mode(True), "off": lambda: set_dev_mode(False)}
    if command not in actions:
        raise SystemExit(__doc__)
    actions[command]()


if __name__ == "__main__":
    main()
