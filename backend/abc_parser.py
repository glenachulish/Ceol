"""
Parser for ABC notation files (e.g. The Craic database).

Splits the file into individual tune records, extracts header fields,
and normalises the K: (key) field into separate `key` and `mode` columns.
"""

import re
from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Key / mode normalisation
# ---------------------------------------------------------------------------

# Maps ABC key suffixes to canonical mode names
_MODE_MAP = {
    "maj":   "major",
    "m":     "minor",
    "min":   "minor",
    "dor":   "dorian",
    "mix":   "mixolydian",
    "aeo":   "aeolian",
    "loc":   "locrian",
    "lyd":   "lydian",
    "phr":   "phrygian",
    # shorthand used in The Craic
    "ador":  "dorian",   # A dorian  (Ador)
    "dmaj":  "major",
    "gmaj":  "major",
    "amaj":  "major",
    "emaj":  "major",
    "bmaj":  "major",
    "fmaj":  "major",
    "cmaj":  "major",
    "gdor":  "dorian",
    "bdor":  "dorian",
    "edor":  "dorian",
    "gmix":  "mixolydian",
    "dmix":  "mixolydian",
    "amix":  "mixolydian",
    "emin":  "minor",
    "bmin":  "minor",
    "dmin":  "minor",
    "amin":  "minor",
}

# Maps note names (with optional sharp/flat) to canonical form
_NOTE_RE = re.compile(
    r"^([A-Ga-g](?:#|b|♭|♯)?)(.*)$"
)

# Full suffix patterns to mode (longest match first)
_SUFFIX_PATTERNS = [
    (re.compile(r"^major$",     re.I), "major"),
    (re.compile(r"^minor$",     re.I), "minor"),
    (re.compile(r"^min$",       re.I), "minor"),
    (re.compile(r"^m$"),                "minor"),
    (re.compile(r"^dorian$",    re.I), "dorian"),
    (re.compile(r"^dor$",       re.I), "dorian"),
    (re.compile(r"^mixolydian$",re.I), "mixolydian"),
    (re.compile(r"^mix$",       re.I), "mixolydian"),
    (re.compile(r"^aeolian$",   re.I), "aeolian"),
    (re.compile(r"^aeo$",       re.I), "aeolian"),
    (re.compile(r"^locrian$",   re.I), "locrian"),
    (re.compile(r"^loc$",       re.I), "locrian"),
    (re.compile(r"^lydian$",    re.I), "lydian"),
    (re.compile(r"^lyd$",       re.I), "lydian"),
    (re.compile(r"^phrygian$",  re.I), "phrygian"),
    (re.compile(r"^phr$",       re.I), "phrygian"),
    (re.compile(r"^maj$",       re.I), "major"),
    (re.compile(r"^$"),                 "major"),   # bare note = major
]


def normalise_key(raw_key: str) -> tuple[str, str]:
    """
    Parse an ABC K: field value into (key, mode).

    Examples:
        "Dmaj"   -> ("D", "major")
        "Ador"   -> ("A", "dorian")
        "G"      -> ("G", "major")
        "Bm"     -> ("B", "minor")
        "F#mix"  -> ("F#", "mixolydian")
        "Hp"     -> ("HP", "major")   # highland pipes
    """
    raw = raw_key.strip()

    # Special ABC keys
    if raw.lower() in ("hp", "hpipe"):
        return ("HP", "major")
    if raw.lower() == "none":
        return ("none", "")

    m = _NOTE_RE.match(raw)
    if not m:
        return (raw, "major")

    note = m.group(1).capitalize()
    suffix = m.group(2).strip().lower()

    mode = "major"
    for pattern, mode_name in _SUFFIX_PATTERNS:
        if pattern.match(suffix):
            mode = mode_name
            break

    key_label = f"{note} {mode}" if mode else note
    return (key_label, mode)


# ---------------------------------------------------------------------------
# Tune data class
# ---------------------------------------------------------------------------

@dataclass
class Tune:
    craic_id: Optional[str] = None
    title: str = ""
    type: Optional[str] = None      # reel, jig, hornpipe, …
    key: Optional[str] = None       # e.g. "D major"
    mode: Optional[str] = None      # e.g. "major"
    abc: str = ""
    aliases: list[str] = field(default_factory=list)
    source_url: Optional[str] = None   # %%thecraic:sourceurl or TheSession URL
    on_hitlist: int = 0                # %%thecraic:isfavorite
    collection: Optional[str] = None   # %%thecraic:collectionstart name


# ---------------------------------------------------------------------------
# Type normalisation
# ---------------------------------------------------------------------------

_TYPE_MAP = {
    # single-letter / shorthand shorthands
    "r":           "reel",
    "j":           "jig",
    "sj":          "slip jig",
    "hj":          "hop jig",
    "h":           "hornpipe",
    "p":           "polka",
    "w":           "waltz",
    "m":           "march",
    "sl":          "slide",
    "sg":          "strathspey",
    "a":           "air",
    # full names (TheSession & common sources)
    "reel":        "reel",
    "jig":         "jig",
    "slip jig":    "slip jig",
    "slip-jig":    "slip jig",
    "hop jig":     "hop jig",
    "hornpipe":    "hornpipe",
    "horn pipe":   "hornpipe",
    "polka":       "polka",
    "waltz":       "waltz",
    "march":       "march",
    "slide":       "slide",
    "strathspey":  "strathspey",
    "air":         "air",
    "slow air":    "slow air",
    "mazurka":     "mazurka",
    "barndance":   "barndance",
    "barn dance":  "barndance",
    "schottische": "schottische",
    "highland":    "highland",
    "highlands":   "highland",
    "set dance":   "set dance",
}

# Meter → most likely type when R: is absent.
# 4/4 defaults to reel (overwhelmingly most common in trad sessions).
_METER_TYPE_MAP = {
    "6/8":  "jig",
    "9/8":  "slip jig",
    "12/8": "slide",
    "2/4":  "polka",
    "3/4":  "waltz",
    "3/8":  "mazurka",
    "4/4":  "reel",
    "c":    "reel",   # ABC common-time symbol
    "c|":   "reel",   # ABC cut-time symbol (often used for reels)
}

# Title keywords searched in priority order (most specific first).
_TITLE_KEYWORDS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bhornpipe\b",    re.I), "hornpipe"),
    (re.compile(r"\bslip[\s-]?jig\b", re.I), "slip jig"),
    (re.compile(r"\bhop[\s-]?jig\b",  re.I), "hop jig"),
    (re.compile(r"\bstrathspey\b",  re.I), "strathspey"),
    (re.compile(r"\bschottische\b", re.I), "schottische"),
    (re.compile(r"\bmazurka\b",     re.I), "mazurka"),
    (re.compile(r"\bbarndance\b|\bbarn\s+dance\b", re.I), "barndance"),
    (re.compile(r"\bpolka\b",       re.I), "polka"),
    (re.compile(r"\bwaltz\b",       re.I), "waltz"),
    (re.compile(r"\bslide\b",       re.I), "slide"),
    (re.compile(r"\bmarch\b",       re.I), "march"),
    (re.compile(r"\bhighland\b",    re.I), "highland"),
    (re.compile(r"\bslow\s+air\b",  re.I), "slow air"),
    (re.compile(r"\bair\b",         re.I), "air"),
    (re.compile(r"\bjig\b",         re.I), "jig"),
    (re.compile(r"\breel\b",        re.I), "reel"),
]


def normalise_type(raw: str) -> str:
    return _TYPE_MAP.get(raw.strip().lower(), raw.strip().lower())


def classify_type(abc: Optional[str], title: Optional[str] = None) -> Optional[str]:
    """
    Infer the tune type from ABC headers and/or title.

    Priority:
      1. R: (Rhythm) field in the ABC — most authoritative.
      2. Title keyword match (e.g. "The Kerry Polka", "Tommy's Hornpipe").
      3. M: (Meter) field — gives a good default for unambiguous meters
         (6/8 → jig, 9/8 → slip jig, 12/8 → slide, 2/4 → polka, 3/4 → waltz,
          4/4/C/C| → reel as the most common trad default).

    Returns a canonical type string, or None if nothing can be inferred.
    """
    # 1. R: field
    if abc:
        for line in abc.splitlines():
            if line.upper().startswith("R:"):
                val = line[2:].strip()
                if val:
                    return normalise_type(val)

    # 2. Title keywords
    if title:
        for pattern, ttype in _TITLE_KEYWORDS:
            if pattern.search(title):
                return ttype

    # 3. M: field
    if abc:
        for line in abc.splitlines():
            if line.upper().startswith("M:"):
                meter = line[2:].strip().lower()
                inferred = _METER_TYPE_MAP.get(meter)
                if inferred:
                    return inferred

    return None


# ---------------------------------------------------------------------------
# ABC file parsing
# ---------------------------------------------------------------------------

# Header field pattern: single uppercase letter (or W, w) followed by colon
_HEADER_RE = re.compile(r"^([A-Za-z]):\s*(.*)")


def _parse_tune_block(block: str) -> Tune:
    """Convert a single ABC tune block (from X: to blank line) into a Tune."""
    tune = Tune(abc=block.strip())
    aliases: list[str] = []
    primary_title_set = False

    for line in block.splitlines():
        m = _HEADER_RE.match(line)
        if not m:
            continue
        tag, value = m.group(1).upper(), m.group(2).strip()

        if tag == "X":
            tune.craic_id = value
        elif tag == "T":
            if not primary_title_set:
                tune.title = value
                primary_title_set = True
            else:
                aliases.append(value)
        elif tag == "R":
            tune.type = normalise_type(value)
        elif tag == "K":
            # K: must be the last header field; strip inline comments
            key_raw = value.split("%")[0].strip()
            key_raw = key_raw.split()[0] if key_raw else key_raw
            tune.key, tune.mode = normalise_key(key_raw)

    tune.aliases = aliases
    return tune


def parse_abc_string(content: str) -> list["Tune"]:
    """Parse ABC notation from a string and return a list of Tune objects."""
    # Normalise line endings (Windows CRLF, old Mac CR) so blank-line
    # splitting works regardless of how the server delivered the file.
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    raw_blocks = re.split(r"\n{2,}", content)
    tunes: list[Tune] = []
    for block in raw_blocks:
        block = block.strip()
        if block and re.search(r"^X:", block, re.MULTILINE):
            tunes.append(_parse_tune_block(block))
    return tunes


def parse_abc_file(path: str) -> list["Tune"]:
    """
    Read an ABC file and return a list of Tune objects.

    Tunes are separated by blank lines; each tune starts with X:.
    """
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        content = fh.read()

    # Split on one-or-more blank lines
    raw_blocks = re.split(r"\n{2,}", content)

    tunes: list[Tune] = []
    for block in raw_blocks:
        block = block.strip()
        if not block:
            continue
        # Only process blocks that look like a tune (contain X: header)
        if re.search(r"^X:", block, re.MULTILINE):
            tunes.append(_parse_tune_block(block))

    return tunes


# ---------------------------------------------------------------------------
# TheCraic export parser
# ---------------------------------------------------------------------------

_THECRAIC_META_RE = re.compile(r"^%%thecraic:(\w+)(?:=(.*))?$")
_LOCAL_PATH_RE = re.compile(r"^/private/|^/var/|^/tmp/|^[A-Za-z]:\\")


def _is_web_url(url: Optional[str]) -> bool:
    return bool(url and (url.startswith("http://") or url.startswith("https://")))


_COLLECTION_NAME_RE = re.compile(r'^%%thecraic:collection(?:start|end)="(.*?)\s*"$')


def parse_thecraic_export(content: str) -> list["Tune"]:
    """
    Parse a TheCraic iOS .abc export file.

    Each tune block looks like:
        %%thecraic:starttunemetadata
        %%thecraic:sourceurl=<url>
        %%thecraic:isfavorite=0|1
        %%thecraic:endtunemetadata
        X: <id>
        T: <title>
        ...
    The metadata block and tune ABC are separated by no blank line, so they
    arrive in the same blank-line-delimited chunk.

    Collections are delimited by:
        %%thecraic:collectionstart="Name "
        ...tunes...
        %%thecraic:collectionend="Name "
    """
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    raw_blocks = re.split(r"\n{2,}", content)
    tunes: list[Tune] = []
    current_collection: Optional[str] = None

    for block in raw_blocks:
        block = block.strip()
        if not block:
            continue

        # Check for collection start/end markers (blocks without X:)
        for line in block.splitlines():
            stripped = line.strip()
            m = _COLLECTION_NAME_RE.match(stripped)
            if m:
                if "collectionstart" in stripped:
                    current_collection = m.group(1).strip()
                elif "collectionend" in stripped:
                    current_collection = None

        # Must contain X: to be a tune
        if not re.search(r"^X:", block, re.MULTILINE):
            continue

        source_url: Optional[str] = None
        on_hitlist = 0
        abc_lines: list[str] = []
        in_meta = False

        for line in block.splitlines():
            stripped = line.strip()
            if stripped == "%%thecraic:starttunemetadata":
                in_meta = True
                continue
            if stripped == "%%thecraic:endtunemetadata":
                in_meta = False
                continue
            if in_meta:
                m = _THECRAIC_META_RE.match(stripped)
                if m:
                    key, val = m.group(1), (m.group(2) or "").strip()
                    if key == "sourceurl":
                        source_url = val or None
                    elif key == "isfavorite":
                        on_hitlist = 1 if val == "1" else 0
                continue
            abc_lines.append(line)

        abc_text = "\n".join(abc_lines).strip()
        if not abc_text:
            continue

        tune = _parse_tune_block(abc_text)
        # Discard device-local paths — they're meaningless outside the device
        tune.source_url = source_url if _is_web_url(source_url) else None
        tune.on_hitlist = on_hitlist
        tune.collection = current_collection
        tunes.append(tune)

    return tunes


def build_thecraic_block(
    abc: str,
    source_url: Optional[str] = None,
    on_hitlist: int = 0,
) -> str:
    """Wrap an ABC tune with %%thecraic: metadata for export back to TheCraic."""
    url_line = f"%%thecraic:sourceurl={source_url}" if source_url else "%%thecraic:sourceurl="
    fav_line = f"%%thecraic:isfavorite={1 if on_hitlist else 0}"
    return (
        "%%thecraic:starttunemetadata\n"
        f"{url_line}\n"
        f"{fav_line}\n"
        "%%thecraic:endtunemetadata\n"
        f"{abc}"
    )


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python abc_parser.py <file.abc>")
        sys.exit(1)
    tunes = parse_abc_file(sys.argv[1])
    print(f"Parsed {len(tunes)} tunes")
    for t in tunes[:5]:
        print(f"  [{t.craic_id}] {t.title!r}  type={t.type}  key={t.key}  mode={t.mode}")
