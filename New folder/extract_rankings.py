"""
AITA Ranking PDF Extractor
Extracts player data from 8 AITA ranking PDFs using pdfplumber.
"""

import pdfplumber
import json
import re
from datetime import datetime
from pathlib import Path

BASE_DIR = Path("C:/tennis-tracker-react/tennis-tracker-react/New folder")

PDF_FILES = [
    ("2026-07-06_BU-12.pdf", "M", "U12"),
    ("2026-07-06_BU-14.pdf", "M", "U14"),
    ("2026-07-06_BU-16.pdf", "M", "U16"),
    ("2026-07-06_BU-18.pdf", "M", "U18"),
    ("2026-07-06_GU-12.pdf", "F", "U12"),
    ("2026-07-06_GU-14.pdf", "F", "U14"),
    ("2026-07-06_GU-16.pdf", "F", "U16"),
    ("2026-07-06_GU-18.pdf", "F", "U18"),
]

# Regex patterns
REG_NO_RE = re.compile(r'^\d{5,7}$')
DOB_RE = re.compile(r'^\d{1,2}-[A-Za-z]{3}-\d{2,4}$')
STATE_RE = re.compile(r'^\(([A-Z]{2})\)$')
RANK_RE = re.compile(r'^\d+$')
FLOAT_RE = re.compile(r'^\d+(\.\d+)?$')


def parse_dob(dob_str: str) -> str:
    """Convert dd-Mon-yy or dd-Mon-yyyy to YYYY-MM-DD."""
    for fmt in ("%d-%b-%y", "%d-%b-%Y"):
        try:
            dt = datetime.strptime(dob_str, fmt)
            # strptime maps 2-digit years 00-68 -> 2000-2068, 69-99 -> 1969-1999.
            # All AITA junior players born post-2000; fix years that landed in 1900s.
            if dt.year < 1970:
                dt = dt.replace(year=dt.year + 100)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return dob_str  # fallback, return as-is


def group_words_by_row(words, y_tolerance=3.0):
    """Group words into rows based on their vertical position."""
    if not words:
        return []
    rows = []
    current_row = [words[0]]
    current_top = words[0]['top']

    for w in words[1:]:
        if abs(w['top'] - current_top) <= y_tolerance:
            current_row.append(w)
        else:
            rows.append(sorted(current_row, key=lambda x: x['x0']))
            current_row = [w]
            current_top = w['top']
    rows.append(sorted(current_row, key=lambda x: x['x0']))
    return rows


def detect_name_style(words):
    """
    Scan all words across all pages to determine name style.
    Returns 'split' if Given Name / Family Name columns exist,
    otherwise 'single' (NAME OF PLAYER in one block).
    """
    for w in words:
        t = w['text'].upper()
        if t in ('GIVEN', 'FAMILY'):
            return 'split'
    return 'single'


def parse_row(texts, name_style, errors_list, row_label):
    """
    Parse a single data row (list of text tokens).
    Returns a dict of extracted fields or None if invalid.
    """
    if not texts or not RANK_RE.match(texts[0]):
        return None

    # Find REG NO, DOB, STATE anchor positions
    reg_idx = dob_idx = state_idx = None
    for i, t in enumerate(texts):
        if reg_idx is None and REG_NO_RE.match(t):
            reg_idx = i
        if dob_idx is None and DOB_RE.match(t):
            dob_idx = i
        if state_idx is None and STATE_RE.match(t):
            state_idx = i

    # All three anchors must be present for a valid player row
    if reg_idx is None or dob_idx is None or state_idx is None:
        return None

    rank = int(texts[0])
    reg_no = texts[reg_idx]
    dob_raw = texts[dob_idx]
    state_match = STATE_RE.match(texts[state_idx])
    state = state_match.group(1)

    # Name tokens are between index 1 and reg_idx
    name_tokens = texts[1:reg_idx]

    if name_style == 'split':
        # Columns: Given Name | Family Name
        if len(name_tokens) >= 2:
            first_name = name_tokens[0].title()
            family_name = ' '.join(name_tokens[1:]).title()
        elif len(name_tokens) == 1:
            # Only one name token present — treat as family name
            first_name = ''
            family_name = name_tokens[0].title()
        else:
            errors_list.append(f"{row_label}: no name tokens in row: {texts}")
            return None
    else:
        # 'single' style: NAME OF PLAYER block
        if len(name_tokens) == 0:
            errors_list.append(f"{row_label}: no name tokens in row: {texts}")
            return None
        elif len(name_tokens) == 1:
            # Single token — could be fused or just a one-part name
            first_name = ''
            family_name = name_tokens[0].title()
        elif len(name_tokens) == 2:
            first_name = name_tokens[0].title()
            family_name = name_tokens[1].title()
        else:
            # 3+ tokens: first = firstName, rest = familyName
            first_name = name_tokens[0].title()
            family_name = ' '.join(name_tokens[1:]).title()

    # All numeric tokens after state = points columns; last one is TTL Final
    numeric_after_state = []
    for t in texts[state_idx + 1:]:
        if FLOAT_RE.match(t):
            numeric_after_state.append(float(t))

    if not numeric_after_state:
        errors_list.append(f"{row_label}: no ranking pts in row: {texts}")
        return None

    ranking_pts = numeric_after_state[-1]
    dob_formatted = parse_dob(dob_raw)

    return {
        "aitaReg": reg_no,
        "familyName": family_name,
        "firstName": first_name,
        "dob": dob_formatted,
        "state": state,
        "rankingPts": ranking_pts,
        "rank": rank,
    }


def parse_pdf(pdf_path: Path, gender: str, age_group: str):
    """Parse one PDF and return list of player dicts."""
    players = []
    errors = []

    with pdfplumber.open(str(pdf_path)) as pdf:
        # First pass: gather all words to determine name style once
        all_first_page_words = pdf.pages[0].extract_words() if pdf.pages else []
        name_style = detect_name_style(all_first_page_words)

        # Second pass: process every page
        for page_num, page in enumerate(pdf.pages, 1):
            words = page.extract_words()
            if not words:
                continue

            rows = group_words_by_row(words, y_tolerance=3.0)

            # On page 1, skip header rows (rows where first word is non-numeric
            # and appears above the first data row).
            # On all pages, process rows whose first token is a rank integer.
            for row in rows:
                texts = [w['text'] for w in row]
                row_label = f"Page {page_num}"

                result = parse_row(texts, name_style, errors, row_label)
                if result is not None:
                    result['ageGroup'] = age_group
                    result['gender'] = gender
                    players.append(result)

    return players, errors


def main():
    all_players = []
    summary = {}

    for filename, gender, age_group in PDF_FILES:
        pdf_path = BASE_DIR / filename
        print(f"\nProcessing: {filename}")

        if not pdf_path.exists():
            print(f"  ERROR: File not found: {pdf_path}")
            continue

        players, errors = parse_pdf(pdf_path, gender, age_group)

        if errors:
            unique_errors = list(dict.fromkeys(errors))  # dedupe while preserving order
            print(f"  Parsing notices ({len(unique_errors)} unique):")
            for e in unique_errors[:5]:
                print(f"    - {e}")
            if len(unique_errors) > 5:
                print(f"    ... and {len(unique_errors) - 5} more")

        print(f"  Extracted: {len(players)} players")
        summary[filename] = len(players)

        if players:
            print(f"  First 3 records:")
            for p in players[:3]:
                print(f"    Rank {p['rank']}: {p['firstName']} {p['familyName']} | "
                      f"Reg={p['aitaReg']} | DOB={p['dob']} | "
                      f"State={p['state']} | Pts={p['rankingPts']}")

        all_players.extend(players)

    # Write output JSON
    output_path = BASE_DIR / "aita_players.json"
    with open(str(output_path), "w", encoding="utf-8") as f:
        json.dump(all_players, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    total = 0
    for filename, count in summary.items():
        print(f"  {filename}: {count} players")
        total += count
    print(f"  TOTAL: {total} players")
    print(f"\nOutput written to: {output_path}")


if __name__ == "__main__":
    main()
