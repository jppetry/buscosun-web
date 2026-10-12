"""Official numbers quoted VERBATIM (plan §6 `official.json`): authority, date, key sentence, link. Each quote is checked by the
builder against a snapshot of the source page text in the cache (`spike/official-<key>.txt`; whitespace-normalised, the
superscript of "km²" that text extraction drops is normalised on both sides). No quote is shortened, reworded, sharpened or softened.
Dates are the dates the authority published (page header / press release), checked 11.10.2026.
"""

# (snapshot key, item) — `quote` parts are joined by " … " when two sentences are not adjacent in the source.
ITEMS = [
    ("unifr", {
        "id": "ch-glamos-2026-volume", "scope": "CH", "kind": "report", "date": "2026-10-01", "period": "2026 (Messperiode)",
        "title": "Schweizer Gletscher 2026: Eisverlust",
        "quote": "Das Abschmelzen der Schweizer Gletscher war 2026 wiederum extrem. Über 5 Prozent des Eises sind verschwunden.",
        "source": "Schweizerisches Gletschermessnetz (GLAMOS) und Schweizerische Kommission für Kryosphärenbeobachtung (SCNAT), Meldung der Universität Freiburg vom 01.10.2026",
        "url": "https://www.unifr.ch/unicom/de/news-events/news/35266/die-schweizer-gletscher-verlieren-weitere-funf-prozent-ihres-volumens",
        "values": [{"key": "volumeLossOverPct", "value": 5, "unit": "%", "label": "des Eises verschwunden (mehr als)"}],
    }),
    ("unifr", {
        "id": "ch-glamos-2026-freezing", "scope": "CH", "kind": "report", "date": "2026-10-01", "period": "Mai–September 2026",
        "title": "Nullgradgrenze über 4 000 m",
        "quote": "Die Nullgradgrenze lag während dieser Monate an 76 Tagen über 4000 Metern. Dies ist mehr als doppelt so viel wie im Mittel und damit ein Rekordwert.",
        "source": "GLAMOS / SCNAT, Meldung der Universität Freiburg vom 01.10.2026",
        "url": "https://www.unifr.ch/unicom/de/news-events/news/35266/die-schweizer-gletscher-verlieren-weitere-funf-prozent-ihres-volumens",
        "values": [{"key": "daysAbove4000", "value": 76, "unit": "Tage", "label": "Tage mit Nullgradgrenze über 4 000 m"}],
    }),
    ("unifr", {
        "id": "ch-glamos-2026-vanished", "scope": "CH", "kind": "status", "date": "2026-10-01", "period": "2026 (Messperiode)",
        "title": "Verschwundene Gletscher laut GLAMOS",
        "quote": "Das äussert sich im Verschwinden vieler kleiner Gletscher, wie zum Beispiel dem Bella-Tola-Gletscher (VS) und dem Griessfiren/Plattalvafirn (GL).",
        "criterion": "Aussage des Messnetzes GLAMOS/SCNAT; die Meldung nennt keine Zahlenschwelle (englische Fassung der ETH: „disappeared completely and permanently“)",
        "source": "GLAMOS / SCNAT, Meldung der Universität Freiburg vom 01.10.2026",
        "url": "https://www.unifr.ch/unicom/de/news-events/news/35266/die-schweizer-gletscher-verlieren-weitere-funf-prozent-ihres-volumens",
    }),
    ("oav", {
        "id": "at-oeav-2024-25-length", "scope": "AT", "kind": "report", "date": "2026-03-13", "period": "2024/25",
        "title": "Gletscherbericht 2024/25: Längenänderung",
        "quote": "Im Gletscherhaushaltsjahr 2024/25 zogen sich die 79 sowohl 2024 als auch 2025 vermessenen Gletscher im Mittel um 20,3 Meter zurück. Bei insgesamt 96 Gletschern wurde von den ehrenamtlichen Gletschermesser:innen die Änderungstendenz erhoben: 94 von ihnen haben sich weiter verkleinert, nur zwei blieben nahezu unverändert.",
        "source": "Österreichischer Alpenverein, Gletschermessdienst, Gletscherbericht 2024/25 (Pressemitteilung Innsbruck/Wien, 13.3.2026)",
        "url": "https://www.alpenverein.at/portal/news/2026/2026_03_13_gletscherbericht-24-25.php",
        "values": [{"key": "meanLengthChange", "value": -20.3, "unit": "m", "label": "mittlerer Rückzug (79 Gletscher)"},
                   {"key": "retreating", "value": 94, "unit": "Gletscher", "label": "von 96 beobachteten ziehen sich zurück"}],
    }),
    ("oav", {
        "id": "at-oeav-2024-25-rank", "scope": "AT", "kind": "report", "date": "2026-03-13", "period": "2024/25",
        "title": "Gletscherbericht 2024/25: Rang in der Messreihe",
        "quote": "Damit liegt der aktuelle Wert zwar unter den beiden Vorjahren, zählt aber – an achter Stelle – noch immer zu den höchsten der 135-jährigen Messreihe.",
        "source": "Österreichischer Alpenverein, Gletschermessdienst, Gletscherbericht 2024/25 (13.3.2026)",
        "url": "https://www.alpenverein.at/portal/news/2026/2026_03_13_gletscherbericht-24-25.php",
        "values": [{"key": "rank", "value": 8, "unit": "Rang", "label": "in der 135-jährigen Messreihe"}],
    }),
    ("oav", {
        "id": "at-oeav-2024-25-pasterze", "scope": "AT", "kind": "report", "date": "2026-03-13", "period": "2024/25", "glacier": "Pasterze",
        "title": "Pasterze 2024/25",
        "quote": "An der Pasterze am Großglockner (Glocknergruppe/Kärnten) wurde an der Hauptzunge ein Rückzug von 54 Metern gemessen.",
        "source": "Österreichischer Alpenverein, Gletschermessdienst, Gletscherbericht 2024/25 (13.3.2026)",
        "url": "https://www.alpenverein.at/portal/news/2026/2026_03_13_gletscherbericht-24-25.php",
        "values": [{"key": "tongueRetreat", "value": -54, "unit": "m", "label": "Rückzug der Hauptzunge"}],
    }),
    ("tc", {
        "id": "at-agi5-area", "scope": "AT", "kind": "report", "date": "2026-09-14", "period": "2021–2023",
        "title": "Austrian Glacier Inventory 5: Fläche",
        "quote": "The updated inventory (AGI5) contains 799 glaciers covering a total area of 285 ± 12 km².",
        "source": "Hartl, L. et al. (2026): On thin glacial ice: New Austrian Glacier Inventory shows accelerating glacier shrinkage and 31 % area loss within two decades. The Cryosphere 20(9), 5157–5180",
        "url": "https://doi.org/10.5194/tc-20-5157-2026",
        "values": [{"key": "areaKm2", "value": 285, "unit": "km²", "label": "Gesamtfläche AGI 5 (± 12 km²)"}, {"key": "glaciers", "value": 799, "unit": "Gletscher", "label": "Gletscher in AGI 5"}],
    }),
    ("agi5", {
        "id": "at-agi5-vanished", "scope": "AT", "kind": "status", "date": "2026-09-14", "period": "2021–2023",
        "title": "Verschwundene Gletscher laut AGI 5",
        "quote": "Vanished means no more evidence of ice, resulting in a exclusion from the inventory.",
        "criterion": "AGI 5: „Vanished means no more evidence of ice, resulting in a exclusion from the inventory.“ („vanishing“ = möglicherweise noch Eis, aber nicht kartierbar)",
        "source": "Hartig, A. et al. (2026): The Austrian Glacier Inventory GI 5, 2021-2023, as vector files, PANGAEA",
        "url": "https://doi.org/10.1594/PANGAEA.991106",
    }),
    ("badw", {
        "id": "de-badw-2026-area", "scope": "DE", "kind": "report", "date": "2026-03-19", "period": "Herbst 2025",
        "title": "Bayerische Gletscher: Fläche 2023 → 2025",
        "quote": "Insgesamt verloren die bayerischen Gletscher zwischen 2023 und 2025 mehr als ein Viertel ihrer Fläche.",
        "source": "Bayerische Akademie der Wissenschaften (BAdW) und Hochschule München, Pressemitteilung vom 19.03.2026",
        "url": "https://badw.de/presse/news-pressemitteilungen/artikel/neue-vermessung-zeigt-beschleunigten-gletscherschwund",
        "values": [{"key": "ha2023", "value": 36.0, "unit": "ha", "label": "Summe der vier Gletscher 2023"},
                   {"key": "ha2025", "value": 26.2, "unit": "ha", "label": "Summe der vier Gletscher 2025"},
                   {"key": "changePct", "value": -27.2, "unit": "%", "label": "Änderung 2023 → 2025"}],
    }),
]


def norm(s):
    import re
    s = s.replace("km²", "km 2").replace(" ", " ")
    s = re.sub(r"\s+", " ", s)
    return re.sub(r"\s+([.,;:])", r"\1", s).strip()


def verify_against_snapshots(snap_dir):
    """Returns (checked, problems) — every quote part must occur verbatim in the snapshot of its source page."""
    problems, checked = [], 0
    for key, it in ITEMS:
        try:
            t = norm(open(f"{snap_dir}/official-{key}.txt", encoding="utf-8").read())
        except OSError:
            problems.append(f"{it['id']}: snapshot official-{key}.txt missing")
            continue
        for part in it["quote"].split(" … "):
            checked += 1
            if norm(part) not in t:
                problems.append(f"{it['id']}: quote not verbatim in the source: {part[:60]}…")
    return checked, problems
