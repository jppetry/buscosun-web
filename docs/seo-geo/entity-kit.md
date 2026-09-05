# entity-kit.md — vorbereitete Texte für Einträge außerhalb der eigenen Seite

Stand: 2026-09-05. Erstellt am Ende der SEO/GEO-Linie (E10c), als klar wurde, dass der Engpass nicht
mehr die Seite ist, sondern das Fehlen jeder Erwähnung außerhalb der eigenen Domain.

**Grundregel für alles hier:** Einreichen unter dem eigenen Namen, Urheberschaft offenlegen, Plattform-
regeln lesen. Kein Beitrag unter fremdem Namen, keine gekauften Links, kein Streuen in Foren ohne
Offenlegung. Bei einer kleinen, jungen Domain fällt so etwas auf und kostet mehr, als es bringt.

---

## 1 · Kurzbeschreibungen (verschiedene Längen, alle faktisch geprüft)

**40 Zeichen**
`Wetterkarte für DACH, ohne Tracker`

**90 Zeichen**
`Kostenlose Wetterplattform für DE, AT und CH — amtliche Quellen, höhenkorrigiert, ohne Konto`

**160 Zeichen (Meta-/Verzeichnislänge)**
`buscosun zeigt Wetter für Deutschland, Österreich und die Schweiz aus amtlichen Quellen:
höhenkorrigierte Karte, Radar, Brandradar, Tourenwetter — kostenlos und ohne Tracker.`

**Absatz (Verzeichnisse, Profiltexte)**
> buscosun ist eine kostenlose Wetter-Web-App für Deutschland, Österreich und die Schweiz. Sie holt
> ihre Daten ausschließlich aus amtlichen Quellen (Deutscher Wetterdienst, GeoSphere Austria,
> MeteoSchweiz) und rechnet die Temperatur über ein digitales Geländemodell auf die tatsächliche Höhe
> um, statt den geglätteten Modellwert zu zeigen. Neben der Karte mit 18 Layern gibt es ein Regenradar
> aus den drei Landesradaren, ein Brandradar auf Satellitenbasis, Wetter entlang einer hochgeladenen
> GPX-Route und eine Bewertung der kommenden sieben Tage für ein konkretes Vorhaben. Die Anwendung
> läuft vollständig im Browser, ohne Konto, ohne Werbung und ohne Tracker; Unsicherheiten und
> Datenlücken werden ausgewiesen statt verschwiegen.

**Was buscosun ausdrücklich nicht ist** (gehört in jede ehrliche Vorstellung dazu)
> Kein amtliches Warnsystem: Warnungen stammen von den Wetterdiensten und werden nur wörtlich zitiert.
> Kein Lawinenlagebericht, kein Einsatzsystem für Behörden, keine Push-Benachrichtigungen bei
> geschlossener App. Für Österreich zeigt buscosun keine amtlichen Warnflächen, weil es dafür keine
> offene Quelle gibt.

---

## 2 · Wikidata-Entwurf

**Erst anlegen, wenn mindestens zwei unabhängige Belege existieren.** Ohne Quellen greift die
Relevanzregel (`Wikidata:Notability`), und ein selbst angelegter Eintrag über das eigene Produkt wird
zusätzlich als Interessenkonflikt gewertet. Wer ihn trotzdem anlegt, riskiert die Löschung und einen
Vermerk am Konto.

| Eigenschaft | Wert |
|---|---|
| Label (de) | buscosun |
| Beschreibung (de) | Wetter-Webanwendung für Deutschland, Österreich und die Schweiz |
| Beschreibung (en) | weather web application for Germany, Austria and Switzerland |
| ist ein (P31) | Webanwendung (Q193424) |
| offizielle Website (P856) | https://buscosun.com |
| Betreiber (P137) | *Betreiberangabe aus dem Impressum, sobald gefüllt* |
| Land (P17) | Deutschland (Q183) |
| Sprache (P407) | Deutsch (Q188) |
| Thema (P921) | Wettervorhersage (Q131207) |
| Software-Lizenz / Preis | kostenlos nutzbar; keine Lizenzangabe, solange das Repo nicht offen ist |
| Belege (P248/P854) | die zwei bis drei unabhängigen Erwähnungen aus Schritt 1 |

Nicht eintragen: Nutzerzahlen, Auszeichnungen, Superlative. Alles, was nicht belegt ist, fliegt raus.

---

## 3 · Verzeichnisse mit realistischer Aufnahmechance

| Ort | Was einreichen | Hinweis |
|---|---|---|
| AlternativeTo | Eintrag als Alternative zu Windy, Ventusky, meteoblue | Kategorie Wetter; Urheberschaft im Profil offenlegen |
| GitHub „awesome"-Listen zu offenen Wetterdaten | Link + Einzeiler | nur, wenn die Liste Web-Apps aufnimmt; Pull Request mit Offenlegung |
| Open-Data-Nutzerlisten (DWD, GeoSphere, MeteoSchweiz) | Kurzbeschreibung + Link | prüfen, ob die Stelle so etwas führt; die Lizenzhinweise sind bereits korrekt umgesetzt |
| Verzeichnisse für tracker-freie Software | Absatztext oben | Datenschutzaussagen sind über `/ohne-tracker/` belegbar |

---

## 4 · Themen, die einen eigenen Fachbeitrag tragen

Das sind die Stellen, an denen buscosun etwas kann, das andere nicht haben. Ein Beitrag darüber ist ein
ehrlicher Anlass für eine Erwähnung, im Gegensatz zu „schaut mal, meine neue Wetterseite".

1. **Höhenkorrektur je Bildpunkt im Shader.** Warum Wetter-Apps im Gebirge danebenliegen und was ein
   Geländemodell mit 30 m Auflösung daran ändert. Beleg: `/methodik/hoehenkorrektur/`.
2. **39 Prozent aller Satelliten-Feuerdetektionen im DACH-Raum sind keine Brände.** Stahlwerke,
   Zementöfen, Raffinerien — und wie man sie über eine Persistenzregel aus sechs Jahren Archiv trennt.
   Beleg: `/waldbrand/thermalanomalien` und `/wissen/thermalanomalien-firms/`.
3. **Ein Regenradar, das am Horizont ehrlich aufhört.** Warum das Bild in Deutschland zwei, in
   Österreich drei Stunden reicht und in der Schweiz bei jetzt endet, statt in eine Modellverlängerung
   überzugehen. Beleg: `/methodik/regenradar-nowcast/` und `/validierung`.
4. **Unsicherheit als Fläche.** Was ein Konfidenz-Schleier zeigt, den sonst niemand zeichnet, und wie
   die Trefferquote dazu gemessen wird. Beleg: `/validierung`.

Jeder dieser Beiträge hat auf der Seite bereits eine belegte Entsprechung — es muss nichts erfunden
werden, und jede Zahl ist im Quellcode nachvollziehbar.
