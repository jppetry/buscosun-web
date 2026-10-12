"""Test of the entity rule `glims_inv.group_entities` against the SGI2016 entities (the GLAMOS file is the ORACLE here, never an input of the build).

  C:/dev/buscosun-glacier-cache/.venv/Scripts/python.exe -I audit/gletscher/glims-entities.py [--nameM 1500] [--unnamedM 60]
"""
import argparse, collections, os, sys, warnings
warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "glacier", "py"))
import inv, glims_inv
from shapely.strtree import STRtree

ap = argparse.ArgumentParser(); ap.add_argument("--nameM", type=float, default=glims_inv.NAME_LINK_M); ap.add_argument("--unnamedM", type=float, default=glims_inv.UNNAMED_LINK_M)
a = ap.parse_args()
parts = glims_inv.parts_of("sgi2016")
truth = inv.ch_current()                     # oracle: SGI2016 entities
tree = STRtree([t["geom"] for t in truth])
owner = []
for p in parts:
    best, bi = 0, None
    for i in tree.query(p["geom"]):
        v = p["geom"].intersection(truth[i]["geom"]).area
        if v > best: best, bi = v, i
    owner.append(bi)
groups = glims_inv.group_entities(parts, a.nameM, a.unnamedM)
truth_sets = collections.defaultdict(set)
for k, o in enumerate(owner): truth_sets[o].add(k)
pred_sets = {frozenset(g) for g in groups}
exact = sum(1 for s in truth_sets.values() if frozenset(s) in pred_sets)
merged = sum(1 for g in groups if len({owner[k] for k in g}) > 1)            # a predicted glacier that mixes two true entities
split = sum(1 for s in truth_sets.values() if len({gi for gi, g in enumerate(groups) if set(g) & s}) > 1)  # a true entity cut into several
area_ok = abs(sum(p["geom"].area for p in parts) / 1e6 - sum(t["area_km2"] for t in truth)) / sum(t["area_km2"] for t in truth)
print(f"nameM={a.nameM} unnamedM={a.unnamedM}: predicted {len(groups)} entities, truth {len(truth_sets)}; exact {exact} ({exact/len(truth_sets):.1%}); merged-wrong {merged}; split-wrong {split}; area differs {area_ok:.4%}")
