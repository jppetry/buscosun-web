"""Identity check: are the Swiss inventories in the GLIMS Glacier Database the same outlines as the inventories of GLAMOS?

Used to IDENTIFY the right GLIMS submissions (their labels say only "University of Zurich" etc.) and to document that the GLIMS copies
are the same geometry. The GLAMOS files are read for this comparison only — nothing of them goes into the build.

  C:/dev/buscosun-glacier-cache/.venv/Scripts/python.exe -I audit/gletscher/glims-identity.py > audit/gletscher/glims-identity.md
"""
import json, os, sys, warnings
warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "glacier", "py"))
import inv
from shapely.geometry import shape
from shapely.ops import transform, unary_union
from pyproj import Transformer

G = "C:/dev/buscosun-glacier-cache/raw/glims/"
t = Transformer.from_crs(4326, 2056, always_xy=True)
def glims(name):
    d = json.load(open(G + name + ".json", encoding="utf-8"))
    return [inv._valid(transform(lambda x, y, z=None: t.transform(x, y), shape(f["geometry"]))) for f in d["features"]], d
def union_area(gs):
    u = unary_union(gs); return u, u.area / 1e6
def compare(a, b):
    i = a.intersection(b).area; u = a.union(b).area
    return i / u, (u - i) / 1e6

print("| GLIMS-Satz (Einreichung) | Merkmale | Fläche km² | gegen GLAMOS-Datei | Fläche GLAMOS km² | IoU der Vereinigungen | Differenzfläche km² |")
print("| --- | --- | --- | --- | --- | --- | --- |")
# 2016
sgi = unary_union([g["geom"] for g in inv.ch_current()])
rows = []
def row(name, subm, gl, ref_name, ref):
    ug, ag = union_area(gl)
    iou, diff = compare(ug, ref)
    print(f"| {name} ({subm}) | {len(gl)} | {ag:.1f} | {ref_name} | {ref.area/1e6:.1f} | {iou:.4f} | {diff:.1f} |")
g16, _ = glims("sgi2016"); row("sgi2016", 869, g16, "SGI 2016", sgi)
for ep, sets in ((1850, [["sgi1850-a"], ["sgi1850-b"], ["sgi1850-a", "sgi1850-b"]]), (1931, [["sgi1931"]]), (1973, [["sgi1973"]]), (2010, [["sgi2010-a"], ["sgi2010-b"]])):
    polys = inv.ch_epoch(ep)
    # the epoch files come in their own CRS (SGI1931 in LV03): bring them to LV95 before comparing
    ref = unary_union([inv._valid(inv.from_ll(inv.to_ll(p["geom"], p["crs"]), 2056)) for p in polys])
    for s in sets:
        gl = []; subm = []
        for n in s:
            g, d = glims(n); gl += g; subm.append(d["subm"])
        row("+".join(s), "+".join(map(str, subm)), gl, f"SGI {ep}", ref)
