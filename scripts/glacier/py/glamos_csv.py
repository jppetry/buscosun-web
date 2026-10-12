"""Reader for the GLAMOS CSV downloads (mass balance, length change, volume change, glacier list).

The files start with free text (licence/citation), then a header line starting with the first column name, then two
descriptor lines (explanation / units) and the data. Rows can be ragged (names with commas are quoted, an unnamed
trailing observer column exists), so rows are parsed with `csv` and cut to the header width.
"""
import csv
import io


def read_glamos_csv(path, first_col="glacier name", descriptor_rows=2):
    text = open(path, encoding="utf-8", errors="replace").read()
    lines = text.splitlines()
    hi = next(i for i, l in enumerate(lines) if l.lower().startswith(first_col.lower()))
    rows = list(csv.reader(io.StringIO("\n".join(lines[hi:]))))
    header = [h.strip() for h in rows[0]]
    descr = rows[1:1 + descriptor_rows]
    data = []
    for r in rows[1 + descriptor_rows:]:
        if not r or not any(c.strip() for c in r):
            continue
        r = (r + [""] * len(header))[:len(header)]
        data.append(dict(zip(header, [c.strip() for c in r])))
    return {"header": header, "descriptors": descr, "rows": data, "licenceNote": "\n".join(lines[:hi]).strip()}


def num(x):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if v == v and v > -9990 else None
