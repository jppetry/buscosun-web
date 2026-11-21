# Phase BS — Messtabellen (erzeugt)

> Erzeugt von `audit/seewetter-binnenseen/make-tables.mjs` aus `spike/lake-probe.json` (gemessen 2026-11-21T09:09:40.613Z), dem gebauten Katalog (2026-11-21T09:15:09.291Z) und `fusion-lake-stations.json`. Keine Zahl ist von Hand getippt.

## 1. Seen

| See | Länder | Umriss | Fläche Umriss / Quelle km² | Seespiegel m | mittlere Tiefe m | DWD-Warnzellen | WSV-Pegel (Reihen) | BAFU-Pegel | Alplakes-Becken |
|---|---|---|---|---|---|---|---|---|---|
| Genfersee | CH, FR | euhydro | 575,1 / 581,3 | 372,0 | 153 | – | – | Chillon; Genève, Sécheron; St-Prex | geneva |
| Bodensee | DE, AT, CH | euhydro | 529,6 / 536,0 | 395,2 | 90 | Bodensee - Mitte (208438000), Bodensee - West (208439000), Bodensee - Ost (208440000) | Konstanz (W), 0,00 km vom See | Romanshorn; Berlingen | upperconstance, lowerconstance |
| Neusiedler See | AT, HU | euhydro | 141,1 / 320,0 | 115,0 | 1 | – | – | – | – |
| Neuenburgersee | CH | swisstopo | 213,4 / 217,9 | 429,1 | 64,2 | – | – | Grandson; Neuchâtel, Nid-du-Crô | neuchatel |
| Lago Maggiore | CH, IT | euhydro | 212,3 / 212,3 | 193,0 | 177,4 | – | – | Brissago; Locarno | maggiore |
| Müritz | DE | dlm250 | 105,6 / 112,6 | 62,1 | 6,5 | Müritz (213010000) | Waren (W, LT, WT), 0,00 km vom See | – | – |
| Vierwaldstättersee | CH | swisstopo | 113,2 / 113,6 | 433,0 | 104 | – | – | Brunnen; Luzern | lucernekreuztrichterandvitznauerbecken, lucernegersauerandtreibbecken, lucerneurnersee |
| Zürichsee | CH | swisstopo | 87,4 / 90,1 | 406,0 | 51,7 | – | – | Schmerikon; Zürich | lowerzurich |
| Chiemsee | DE | dlm250 | 75,8 / 79,9 | 518,2 | 25,63 | Chiemsee (209913000) | – | – | chiemsee |
| Schweriner See | DE | dlm250 | 60,1 / 61,5 | 37,8 | 12,8 | – | Schwerin Werderbrücke (W, LT, WT), 0,94 km vom See | – | – |
| Starnberger See | DE | dlm250 | 55,4 / 56,4 | 584,0 | 53,2 | Starnberger See (209904000) | – | – | starnberger |
| Luganersee | CH, IT | euhydro | 48,9 / 48,7 | 271,0 | 134 | – | – | Melide, Ferrera; Ponte Tresa | upperlugano, lowerlugano |
| Thunersee | CH | swisstopo | 47,4 / 48,4 | 558,0 | 136 | – | – | Spiez | thun |
| Ammersee | DE | dlm250 | 45,7 / 46,6 | 532,9 | 37,5 | Ammersee (209905000) | – | – | ammersee |
| Attersee | AT | euhydro | 46,4 / 46,2 | 469,0 | 85 | – | – | – | attersee |
| Bielersee | CH | swisstopo | 39,2 / 39,8 | 429,3 | 29 | – | – | Ligerz, Klein Twann | biel |
| Plauer See | DE | dlm250 | 37,7 / 38,4 | 62,0 | 6,8 | – | Plau (Oberpegel) (Q, W, LT, WT), 0,97 km vom See | – | – |
| Zugersee | CH | swisstopo | 38,2 / 38,3 | 413,0 | 83,2 | – | – | Zug | zug |
| Kummerower See | DE | dlm250 | 32,0 / 32,6 | 0,2 | 8,1 | – | Aalbude (W), 0,07 km vom See | – | – |
| Brienzersee | CH | swisstopo | 29,5 / 29,8 | 564,0 | 173 | – | – | Ringgenberg | brienz |
| Steinhuder Meer | DE | dlm250 | 27,4 / 29,1 | 37,9 | 1,35 | Steinhuder Meer (203259000) | – | – | – |
| Großer Plöner See | DE | dlm250 | 28,4 / 28,4 | 21,0 | 13,54 | Ostholsteinische Seen (201068000) | – | – | – |
| Traunsee | AT | euhydro | 25,1 / 24,4 | 422,0 | 95 | – | – | – | traunsee |
| Walensee | CH | swisstopo | 23,9 / 24,1 | 419,0 | 105 | – | – | Murg | walensee |
| Schaalsee | DE | dlm250 | 22,0 / 23,5 | 34,8 | 17 | – | – | – | – |
| Murtensee | CH | swisstopo | 22,5 / 23,0 | 429,3 | 24 | – | – | Murten | murten |
| Selenter See | DE | dlm250 | 20,8 / 21,4 | 37,2 | 13,76 | Ostholsteinische Seen (201068000) | – | – | – |
| Kölpinsee | DE | dlm250 | 19,7 / 20,3 | 62,1 | 3,5 | – | – | – | – |

## 2. Spots — Lage, Cube, Station

`Ufer` = Abstand der Handlage zur Uferlinie des Umrisses. `Ort` = Abstand des Uferpunkts zur Koordinate des Wikipedia-Artikels des Orts. `Cube` = Zelle des t1-Gitters, Höhe, die der Geländeleser am Wasserpunkt findet, minus Seespiegel. `Richtung` = Stunden mit Windrichtung von 80 Stunden mit Wind.

| Spot | See | Ufer m | zeigt ° | Ort km | Cube-Zelle iy/ix | Leserhöhe − Seespiegel m | Richtung h | Windstation (Netz) | km | Δh m | DWD-Zelle |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Genf (`genfersee-genf`) | Genfersee | 85 | 113 | 1,2 | 14/13 | -1 | 45 | Genève / Cointrin (nime) | 4,5 | 39 | – |
| Nyon (`genfersee-nyon`) | Genfersee | 9 | 129 | 0,3 | 18/15 | -1 | 58 | Nyon / Changins (smn) | 2,5 | 86 | – |
| Lausanne (`genfersee-lausanne`) | Genfersee | 64 | 193 | 1,6 | 20/23 | -1 | 49 | Pully (smn) | 3,2 | 84 | – |
| Vevey / Montreux (`genfersee-vevey-montreux`) | Genfersee | 23 | 196 | 0,2 | 19/27 | -1 | 19 | Vevey / Corseaux (smn) | 2,7 | 33 | – |
| Le Bouveret (`genfersee-le-bouveret`) | Genfersee | 205 | 318 | 0,5 | 18/27 | -1 | 36 | Bouveret (smn) | 0,7 | 2 | – |
| Konstanz (`bodensee-konstanz`) | Bodensee | 59 | 95 | 0,4 | 43/74 | -5 | 21 | Konstanz (dwd10) | 5,3 | 33 | Bodensee - Mitte |
| Radolfzell (`bodensee-radolfzell`) | Bodensee | 13 | 199 | 0,5 | 45/69 | -6 | 10 | Steckborn (smn) | 7,4 | 2 | Bodensee - West |
| Überlingen (`bodensee-ueberlingen`) | Bodensee | 58 | 209 | 0,2 | 45/73 | -5 | 39 | Konstanz (dwd10) | 8,1 | 33 | Bodensee - West |
| Friedrichshafen (`bodensee-friedrichshafen`) | Bodensee | 102 | 178 | 0,6 | 43/80 | -5 | 75 | Friedrichshafen (dwd10) | 0,4 | -1 | Bodensee - Mitte |
| Lindau (`bodensee-lindau`) | Bodensee | 77 | 163 | 0,1 | 41/84 | -5 | 52 | Lindau (SWN) (dwd10) | 0,6 | 2 | Bodensee - Ost |
| Bregenz (`bodensee-bregenz`) | Bodensee | 72 | 339 | 0,4 | 40/85 | 0 | 16 | BREGENZ (tawes) | 0,6 | 29 | Bodensee - Ost |
| Romanshorn (`bodensee-romanshorn`) | Bodensee | 83 | 74 | 0,2 | 41/78 | -5 | 25 | Güttingen (smn) | 8,7 | 45 | Bodensee - Mitte |
| Kreuzlingen (`bodensee-kreuzlingen`) | Bodensee | 114 | 32 | 1,0 | 43/74 | -5 | 20 | Konstanz (dwd10) | 6,8 | 33 | Bodensee - Mitte |
| Neusiedl am See (`neusiedler-see-neusiedl`) | Neusiedler See | 112 | 223 | 2,3 | 49/227 | 1 | 80 | NEUSIEDL AM SEE (tawes) | 2,3 | 2 | – |
| Podersdorf (`neusiedler-see-podersdorf`) | Neusiedler See | 66 | 303 | 0,6 | 47/226 | 1 | 80 | PODERSDORF (tawes) | 1,2 | 1 | – |
| Rust (`neusiedler-see-rust`) | Neusiedler See | 163 | 111 | 1,5 | 46/224 | 1 | 68 | PODERSDORF (tawes) | 12,6 | 1 | – |
| Mörbisch (`neusiedler-see-moerbisch`) | Neusiedler See | 194 | 327 | 2,5 | 45/224 | 1 | 46 | PODERSDORF (tawes) | 16,0 | 1 | – |
| Neuchâtel (`neuenburgersee-neuchatel`) | Neuenburgersee | 17 | 143 | 0,3 | 30/29 | -4 | 65 | Neuchâtel (nime) | 1,9 | 56 | – |
| Yverdon-les-Bains (`neuenburgersee-yverdon`) | Neuenburgersee | 182 | 52 | 1,0 | 26/23 | -4 | 38 | Mathod (smn) | 8,1 | 6 | – |
| Estavayer-le-Lac (`neuenburgersee-estavayer`) | Neuenburgersee | 25 | 305 | 0,5 | 27/27 | -4 | 43 | Payerne (smn) | 8,9 | 61 | – |
| Locarno (`lago-maggiore-locarno`) | Lago Maggiore | 187 | 64 | 0,7 | 13/66 | -3 | 2 | Magadino / Cadenazzo (smn) | 10,1 | 10 | – |
| Ascona (`lago-maggiore-ascona`) | Lago Maggiore | 2 | 230 | 0,3 | 13/65 | -3 | 1 | Magadino / Cadenazzo (smn) | 12,6 | 10 | – |
| Waren (`mueritz-waren`) | Müritz | 148 | 226 | 0,7 | 160/144 | -4 | 77 | Waren (Müritz) (dwd10) | 1,7 | 11 | Müritz |
| Röbel (`mueritz-roebel`) | Müritz | 102 | 55 | 0,8 | 158/142 | -4 | 80 | Rechlin (dwd10) | 8,9 | 0 | Müritz |
| Klink (`mueritz-klink`) | Müritz | 91 | 129 | 0,7 | 160/143 | -4 | 77 | Waren (Müritz) (dwd10) | 5,3 | 11 | Müritz |
| Luzern (`vierwaldstaettersee-luzern`) | Vierwaldstättersee | 25 | 35 | 0,6 | 31/56 | -3 | 7 | Luzern (nime) | 1,8 | 21 | – |
| Küssnacht (`vierwaldstaettersee-kuessnacht`) | Vierwaldstättersee | 142 | 189 | 0,4 | 32/59 | -3 | 4 | Luzern (nime) | 11,4 | 21 | – |
| Buochs (`vierwaldstaettersee-buochs`) | Vierwaldstättersee | 176 | 36 | 0,4 | 30/58 | -3 | 6 | Gersau (smn) | 8,1 | 88 | – |
| Flüelen (`vierwaldstaettersee-flueelen`) | Vierwaldstättersee | 7 | 309 | 0,2 | 28/62 | -3 | 20 | Altdorf (nime) | 1,7 | 5 | – |
| Zürich (`zuerichsee-zuerich`) | Zürichsee | 315 | 259 | 1,5 | 37/61 | -6 | 12 | Zürich / Affoltern (smn) | 8,0 | 38 | – |
| Wädenswil (`zuerichsee-waedenswil`) | Zürichsee | 164 | 40 | 0,1 | 35/64 | -6 | 11 | Wädenswil (smn) | 1,2 | 79 | – |
| Rapperswil (`zuerichsee-rapperswil`) | Zürichsee | 22 | 261 | 0,4 | 34/66 | -6 | 6 | Schmerikon (smn) | 9,6 | 2 | – |
| Prien (`chiemsee-prien`) | Chiemsee | 163 | 84 | 1,8 | 47/137 | -3 | 50 | Frasdorf-Greimelberg (dwd10) | 7,0 | 138 | Chiemsee |
| Seebruck (`chiemsee-seebruck`) | Chiemsee | 179 | 135 | 0,3 | 49/140 | -3 | 58 | Chieming (dwd10) | 7,0 | 33 | Chiemsee |
| Chieming (`chiemsee-chieming`) | Chiemsee | 108 | 250 | 0,5 | 48/141 | -3 | 60 | Chieming (dwd10) | 0,9 | 33 | Chiemsee |
| Schwerin (Zippendorf) (`schweriner-see-schwerin`) | Schweriner See | 513 | 359 | – | 162/119 | -2 | 79 | Schwerin (dwd10) | 6,3 | 21 | – |
| Bad Kleinen (`schweriner-see-bad-kleinen`) | Schweriner See | 356 | 141 | 0,8 | 165/120 | -2 | 79 | Schwerin (dwd10) | 15,3 | 21 | – |
| Starnberg (`starnberger-see-starnberg`) | Starnberger See | 10 | 156 | 0,5 | 50/117 | -1 | 34 | Wielenbach (Demollstr.) (dwd10) | 18,9 | -33 | Starnberger See |
| Tutzing (`starnberger-see-tutzing`) | Starnberger See | 195 | 115 | 0,2 | 48/116 | -1 | 33 | Wielenbach (Demollstr.) (dwd10) | 9,8 | -33 | Starnberger See |
| Seeshaupt (`starnberger-see-seeshaupt`) | Starnberger See | 13 | 30 | 0,3 | 47/116 | -1 | 25 | Wielenbach (Demollstr.) (dwd10) | 12,7 | -33 | Starnberger See |
| Lugano (`luganersee-lugano`) | Luganersee | 242 | 130 | 0,7 | 10/69 | -1 | 19 | Lugano (nime) | 0,8 | 2 | – |
| Morcote (`luganersee-morcote`) | Luganersee | 163 | 165 | 0,3 | 8/68 | -1 | 13 | Stabio (smn) | 8,9 | 80 | – |
| Thun (`thunersee-thun`) | Thunersee | 97 | 80 | 2,1 | 25/43 | -1 | 3 | Thun (smn) | 3,9 | 12 | – |
| Spiez (`thunersee-spiez`) | Thunersee | 11 | 87 | 1,8 | 24/44 | -1 | 13 | Thun (smn) | 10,3 | 12 | – |
| Herrsching (`ammersee-herrsching`) | Ammersee | 103 | 285 | 1,2 | 50/113 | -2 | 20 | Wielenbach (Demollstr.) (dwd10) | 12,9 | 18 | Ammersee |
| Dießen (`ammersee-diessen`) | Ammersee | 31 | 50 | 0,7 | 49/112 | -2 | 35 | Wielenbach (Demollstr.) (dwd10) | 8,3 | 18 | Ammersee |
| Stegen (`ammersee-stegen`) | Ammersee | 55 | 186 | 0,2 | 51/113 | -2 | 39 | Wielenbach (Demollstr.) (dwd10) | 21,6 | 18 | Ammersee |
| Seewalchen (`attersee-seewalchen`) | Attersee | 43 | 185 | 0,3 | 49/162 | 0 | 36 | VOECKLABRUCK (tawes) | 7,6 | -37 | – |
| Attersee am Attersee (`attersee-attersee`) | Attersee | 62 | 121 | 0,1 | 48/161 | 0 | 35 | VOECKLABRUCK (tawes) | 12,8 | -37 | – |
| Weißenbach (`attersee-weissenbach`) | Attersee | 298 | 4 | 3,6 | 46/161 | 0 | 20 | ST.WOLFGANG (tawes) | 9,9 | 75 | – |
| Biel (`bielersee-biel`) | Bielersee | 63 | 290 | 1,3 | 33/35 | -5 | 34 | Grenchen (nime) | 14,8 | -1 | – |
| Erlach (`bielersee-erlach`) | Bielersee | 54 | 73 | 0,3 | 31/32 | -5 | 61 | Cressier (smn) | 3,2 | 1 | – |
| Plau am See (`plauer-see-plau`) | Plauer See | 60 | 78 | 1,2 | 159/136 | -3 | 80 | Goldberg (dwd10) | 20,5 | -3 | – |
| Alt Schwerin (`plauer-see-alt-schwerin`) | Plauer See | 223 | 164 | 1,5 | 160/137 | -3 | 80 | Waren (Müritz) (dwd10) | 20,1 | 11 | – |
| Zug (`zugersee-zug`) | Zugersee | 20 | 232 | 0,5 | 33/60 | -4 | 8 | Cham (smn) | 4,2 | 30 | – |
| Arth (`zugersee-arth`) | Zugersee | 106 | 301 | 0,1 | 31/60 | -4 | 3 | Gersau (smn) | 7,7 | 108 | – |
| Kummerow (`kummerower-see-kummerow`) | Kummerower See | 420 | 350 | 0,4 | 165/147 | 0 | 80 | Sukow-Levitzow (dwd10) | 17,0 | 12 | – |
| Brienz (`brienzersee-brienz`) | Brienzersee | 22 | 185 | 0,3 | 25/51 | -4 | 16 | Brienz (smn) | 2,6 | 3 | – |
| Bönigen (`brienzersee-boenigen`) | Brienzersee | 104 | 60 | 0,5 | 24/48 | -4 | 26 | Interlaken (smn) | 2,8 | 14 | – |
| Steinhude (`steinhuder-meer-steinhude`) | Steinhuder Meer | 160 | 315 | 0,4 | 139/77 | -3 | 69 | Hannover (dwd10) | 21,9 | 17 | Steinhuder Meer |
| Mardorf (`steinhuder-meer-mardorf`) | Steinhuder Meer | 427 | 132 | 1,1 | 140/76 | -3 | 70 | keine | – | – | Steinhuder Meer |
| Plön (`grosser-ploener-see-ploen`) | Großer Plöner See | 227 | 145 | 0,2 | 173/98 | -3 | 67 | Dörnick (dwd10) | 4,5 | 6 | Ostholsteinische Seen |
| Gmunden (`traunsee-gmunden`) | Traunsee | 230 | 162 | 0,2 | 48/166 | 0 | 56 | ALTMUENSTER (tawes) | 4,6 | 16 | – |
| Ebensee (`traunsee-ebensee`) | Traunsee | 251 | 52 | 0,5 | 46/166 | 1 | 47 | ALTMUENSTER (tawes) | 7,5 | 16 | – |
| Weesen (`walensee-weesen`) | Walensee | 119 | 87 | 0,1 | 33/72 | -4 | 24 | Quinten (smn) | 8,9 | 0 | – |
| Walenstadt (`walensee-walenstadt`) | Walensee | 535 | 267 | 1,3 | 32/76 | -3 | 17 | Quinten (smn) | 6,5 | 0 | – |
| Zarrentin (`schaalsee-zarrentin`) | Schaalsee | 26 | 79 | 0,2 | 161/108 | -2 | 79 | Boizenburg (dwd10) | 23,4 | 10 | – |
| Murten (`murtensee-murten`) | Murtensee | 18 | 315 | 0,2 | 29/32 | 0 | 35 | Mühleberg (smn) | 13,3 | 51 | – |
| Selent (`selenter-see-selent`) | Selenter See | 279 | 26 | 0,7 | 176/99 | -3 | 80 | Dörnick (dwd10) | 15,3 | -10 | Ostholsteinische Seen |
| Kölpinsee Ostufer (`koelpinsee-klink`) | Kölpinsee | 199 | 350 | 1,0 | 160/142 | -4 | 77 | Waren (Müritz) (dwd10) | 5,9 | 11 | – |

## 3. Nächste liefernde Station je Netz

Regel der Messung: Station liefert Wind UND Böe, jünger als 90 min; „am See“ heißt höchstens 25 km entfernt und höchstens 150 m über oder unter dem Seespiegel. Stand obs/v1: 2026-11-21T09:02:06.562Z, 699 von 724 Windstationen liefern.

| Spot | DWD km (Δh m) | TAWES km (Δh m) | SwissMetNet km (Δh m) |
|---|---|---|---|
| Genf | – | – | Genève / Cointrin 4,5 (39) |
| Nyon | – | – | Nyon / Changins 2,5 (86) |
| Lausanne | – | – | Pully 3,2 (84) |
| Vevey / Montreux | Kandern-Gupf 149,2 (-10) | – | Vevey / Corseaux 2,7 (33) |
| Le Bouveret | – | – | Bouveret 0,7 (2) |
| Konstanz | Konstanz 5,3 (33) | ROHRSPITZ 38,4 (0) | Güttingen 10,0 (45) |
| Radolfzell | Konstanz 12,9 (33) | ROHRSPITZ 56,1 (0) | Steckborn 7,4 (2) |
| Überlingen | Sipplingen (SWN) 6,3 (308) | ROHRSPITZ 46,1 (0) | Salen-Reutenen 16,3 (324) |
| Friedrichshafen | Friedrichshafen 0,4 (-1) | ROHRSPITZ 20,3 (0) | Güttingen 15,9 (45) |
| Lindau | Lindau (SWN) 0,6 (2) | ROHRSPITZ 6,6 (0) | Altenrhein 11,1 (3) |
| Bregenz | Lindau (SWN) 5,9 (2) | BREGENZ 0,6 (29) | Altenrhein 13,5 (3) |
| Romanshorn | Friedrichshafen 11,5 (-1) | ROHRSPITZ 20,0 (0) | Güttingen 8,7 (45) |
| Kreuzlingen | Konstanz 6,8 (33) | ROHRSPITZ 37,1 (0) | Güttingen 8,5 (45) |
| Neusiedl am See | – | NEUSIEDL AM SEE 2,3 (2) | – |
| Podersdorf | – | PODERSDORF 1,2 (1) | – |
| Rust | – | PODERSDORF 12,6 (1) | – |
| Mörbisch | – | PODERSDORF 16,0 (1) | – |
| Neuchâtel | Kandern-Gupf 93,2 (-67) | – | Neuchâtel 1,9 (56) |
| Yverdon-les-Bains | Kandern-Gupf 124,0 (-67) | – | Bullet / La Frétaz 7,9 (776) |
| Estavayer-le-Lac | Kandern-Gupf 109,6 (-67) | – | Payerne 8,9 (61) |
| Locarno | – | BRAND 126,2 (836) | Locarno / Monti 1,3 (174) |
| Ascona | – | BRAND 128,9 (836) | Locarno / Monti 2,5 (174) |
| Waren | Waren (Müritz) 1,7 (11) | – | – |
| Röbel | Rechlin 8,9 (0) | – | – |
| Klink | Waren (Müritz) 5,3 (11) | – | – |
| Luzern | Dogern 62,3 (-124) | FELDKIRCH 101,1 (5) | Luzern 1,8 (21) |
| Küssnacht | Dogern 61,3 (-124) | FELDKIRCH 91,2 (5) | Luzern 11,4 (21) |
| Buochs | Dogern 71,8 (-124) | FELDKIRCH 95,7 (5) | Gersau 8,1 (88) |
| Flüelen | Dogern 85,1 (-124) | FELDKIRCH 85,2 (5) | Altdorf 1,7 (5) |
| Zürich | Dogern 39,2 (-97) | FELDKIRCH 80,7 (32) | Zürich / Fluntern 2,9 (198) |
| Wädenswil | Gailingen 52,5 (43) | FELDKIRCH 70,8 (32) | Wädenswil 1,2 (79) |
| Rapperswil | Gailingen 53,4 (43) | FELDKIRCH 60,3 (32) | Schmerikon 9,6 (2) |
| Prien | Frasdorf-Greimelberg 7,0 (138) | KOESSEN 22,0 (70) | – |
| Seebruck | Chieming 7,0 (33) | OSTERMIETHING 29,4 (-106) | – |
| Chieming | Chieming 0,9 (33) | KOESSEN 27,2 (70) | – |
| Schwerin (Zippendorf) | Schwerin 6,3 (21) | – | – |
| Bad Kleinen | Schwerin 15,3 (21) | – | – |
| Starnberg | Wielenbach (Demollstr.) 18,9 (-33) | ACHENKIRCH CAMPINGPLATZ 61,4 (347) | Altenrhein 144,8 (-186) |
| Tutzing | Wielenbach (Demollstr.) 9,8 (-33) | ACHENKIRCH CAMPINGPLATZ 55,4 (347) | Altenrhein 136,9 (-186) |
| Seeshaupt | Wielenbach (Demollstr.) 12,7 (-33) | ACHENKIRCH CAMPINGPLATZ 47,1 (347) | Altenrhein 135,6 (-186) |
| Lugano | – | BRAND 136,4 (758) | Lugano 0,8 (2) |
| Morcote | – | GASCHURN 145,4 (714) | Monte Generoso 7,9 (1329) |
| Thun | Dogern 104,1 (-249) | – | Thun 3,9 (12) |
| Spiez | Dogern 107,8 (-249) | – | Thun 10,3 (12) |
| Herrsching | Wielenbach (Demollstr.) 12,9 (18) | REUTTE 65,5 (308) | Altenrhein 132,7 (-135) |
| Dießen | Wielenbach (Demollstr.) 8,3 (18) | REUTTE 58,6 (308) | Altenrhein 126,5 (-135) |
| Stegen | Wielenbach (Demollstr.) 21,6 (18) | REUTTE 71,8 (308) | Altenrhein 134,2 (-135) |
| Seewalchen | Rotthalmünster (Landwirtschaftsamt) 54,2 (-81) | VOECKLABRUCK 7,6 (-37) | – |
| Attersee am Attersee | Schönau am Königssee 53,6 (156) | VOECKLABRUCK 12,8 (-37) | – |
| Weißenbach | Schönau am Königssee 46,6 (156) | ST.WOLFGANG 9,9 (75) | – |
| Biel | Kandern-Gupf 68,9 (-67) | – | Courtelary 12,3 (266) |
| Erlach | Kandern-Gupf 81,7 (-67) | – | Cressier 3,2 (1) |
| Plau am See | Goldberg 20,5 (-3) | – | – |
| Alt Schwerin | Waren (Müritz) 20,1 (11) | – | – |
| Zug | Dogern 54,6 (-104) | FELDKIRCH 83,6 (25) | Cham 4,2 (30) |
| Arth | Dogern 65,4 (-104) | FELDKIRCH 85,3 (25) | Gersau 7,7 (108) |
| Kummerow | Sukow-Levitzow 17,0 (12) | – | – |
| Brienz | Dogern 94,9 (-255) | FELDKIRCH 132,6 (-126) | Brienz 2,6 (3) |
| Bönigen | Dogern 103,6 (-255) | FELDKIRCH 145,1 (-126) | Interlaken 2,8 (14) |
| Steinhude | Hannover 21,9 (17) | – | – |
| Mardorf | Hannover 25,4 (17) | – | – |
| Plön | Dörnick 4,5 (6) | – | – |
| Gmunden | Rotthalmünster (Landwirtschaftsamt) 66,8 (-34) | ALTMUENSTER 4,6 (16) | – |
| Ebensee | Schönau am Königssee 63,7 (203) | FEUERKOGEL 4,7 (1196) | – |
| Weesen | Konstanz 62,5 (9) | FELDKIRCH 41,5 (19) | Quinten 8,9 (0) |
| Walenstadt | Lindau (SWN) 55,1 (-22) | FELDKIRCH 28,9 (19) | Quinten 6,5 (0) |
| Zarrentin | Boizenburg 23,4 (10) | – | – |
| Murten | Kandern-Gupf 92,8 (-67) | – | Mühleberg 13,3 (51) |
| Selent | Dörnick 15,3 (-10) | – | – |
| Kölpinsee Ostufer | Waren (Müritz) 5,9 (11) | – | – |

## 4. buscosun Fusion gegen Seestationen

Regel vor dem Lauf festgelegt (Kopf von `fusion-lake-stations.mjs`): Konserve `fusion-12x`, 38 Ausgaben 2026-09-14 … 2026-10-21, Rastervorläufe 1–48 h, Wahrheit W1; Stationen des Prüfnetzes höchstens 10 km von einem Seespot und höchstens 150 m über/unter dem Seespiegel (26 Kandidaten), die zehn nächsten.

| Station | Land | See | km zum Spot | Δh m |
|---|---|---|---|---|
| BREGENZ | AT | Bodensee | 0,6 | 29 |
| Lugano | CH | Luganersee | 0,8 | 2 |
| CHIEMING | DE | Chiemsee | 1,1 | 31 |
| Wädenswil | CH | Zürichsee | 1,2 | 79 |
| WAREN | DE | Müritz | 1,5 | 8 |
| Altdorf | CH | Vierwaldstättersee | 1,7 | 5 |
| Luzern | CH | Vierwaldstättersee | 1,8 | 21 |
| Neuchâtel | CH | Neuenburgersee | 1,9 | 56 |
| KONSTANZ | DE | Bodensee | 2,3 | 48 |
| NEUSIEDL AM SEE | AT | Neusiedler See | 2,3 | 2 |

| See | Größe | Vorlauf | Fälle | Messung kn | Bias kn | MAE kn | in q10–q90 | Breite kn |
|---|---|---|---|---|---|---|---|---|
| Bodensee | Wind | 1–6 h | 444 | 2,5 | +0,1 | 0,9 | 93,2 % | 4,3 |
| Bodensee | Wind | 7–24 h | 1.316 | 3,3 | +0,1 | 1,3 | 89,3 % | 5,0 |
| Bodensee | Wind | 25–48 h | 1.712 | 3,1 | +0,2 | 1,2 | 89,2 % | 5,0 |
| Bodensee | Wind | 1–48 h | 3.472 | 3,1 | +0,1 | 1,2 | 89,7 % | 4,9 |
| Bodensee | Böe | 1–6 h | 444 | 5,8 | +0,2 | 1,6 | 87,8 % | 6,6 |
| Bodensee | Böe | 7–24 h | 1.316 | 7,2 | +0,7 | 2,3 | 83,0 % | 7,8 |
| Bodensee | Böe | 25–48 h | 1.712 | 6,9 | +0,9 | 2,5 | 83,9 % | 8,3 |
| Bodensee | Böe | 1–48 h | 3.472 | 6,9 | +0,7 | 2,3 | 84,0 % | 7,9 |
| Luganersee | Wind | 1–6 h | 212 | 2,3 | +0,2 | 0,9 | 96,7 % | 4,4 |
| Luganersee | Wind | 7–24 h | 624 | 2,7 | +0,7 | 1,2 | 92,0 % | 5,7 |
| Luganersee | Wind | 25–48 h | 720 | 2,6 | +0,9 | 1,3 | 90,6 % | 5,4 |
| Luganersee | Wind | 1–48 h | 1.556 | 2,6 | +0,7 | 1,2 | 92,0 % | 5,4 |
| Luganersee | Böe | 1–6 h | 212 | 5,1 | +0,3 | 1,6 | 93,9 % | 8,1 |
| Luganersee | Böe | 7–24 h | 624 | 6,2 | +0,9 | 2,0 | 92,6 % | 9,2 |
| Luganersee | Böe | 25–48 h | 720 | 5,8 | +1,5 | 2,2 | 91,9 % | 9,8 |
| Luganersee | Böe | 1–48 h | 1.556 | 5,9 | +1,1 | 2,0 | 92,5 % | 9,3 |
| Chiemsee | Wind | 1–6 h | 224 | 4,3 | -0,9 | 1,5 | 79,9 % | 4,3 |
| Chiemsee | Wind | 7–24 h | 660 | 4,6 | -0,7 | 1,4 | 91,1 % | 6,0 |
| Chiemsee | Wind | 25–48 h | 764 | 4,6 | -0,7 | 1,5 | 87,0 % | 5,6 |
| Chiemsee | Wind | 1–48 h | 1.648 | 4,6 | -0,7 | 1,5 | 87,7 % | 5,6 |
| Chiemsee | Böe | 1–6 h | 224 | 7,6 | -2,0 | 2,3 | 68,8 % | 5,3 |
| Chiemsee | Böe | 7–24 h | 660 | 8,4 | -1,2 | 2,2 | 81,4 % | 7,3 |
| Chiemsee | Böe | 25–48 h | 764 | 8,3 | -1,0 | 2,4 | 80,9 % | 8,1 |
| Chiemsee | Böe | 1–48 h | 1.648 | 8,3 | -1,2 | 2,3 | 79,4 % | 7,4 |
| Zürichsee | Wind | 1–6 h | 212 | 2,4 | +0,8 | 1,6 | 79,2 % | 5,4 |
| Zürichsee | Wind | 7–24 h | 624 | 3,1 | +0,7 | 1,6 | 86,7 % | 6,1 |
| Zürichsee | Wind | 25–48 h | 720 | 2,9 | +0,9 | 1,7 | 83,2 % | 5,8 |
| Zürichsee | Wind | 1–48 h | 1.556 | 2,9 | +0,8 | 1,7 | 84,1 % | 5,9 |
| Zürichsee | Böe | 1–6 h | 212 | 5,5 | +2,4 | 2,9 | 78,3 % | 8,5 |
| Zürichsee | Böe | 7–24 h | 624 | 6,5 | +2,9 | 3,4 | 71,8 % | 9,5 |
| Zürichsee | Böe | 25–48 h | 720 | 6,1 | +3,2 | 3,6 | 71,5 % | 9,8 |
| Zürichsee | Böe | 1–48 h | 1.556 | 6,2 | +3,0 | 3,4 | 72,6 % | 9,5 |
| Müritz | Wind | 1–6 h | 228 | 5,1 | -0,2 | 1,0 | 86,8 % | 3,9 |
| Müritz | Wind | 7–24 h | 676 | 5,9 | 0,0 | 1,1 | 90,1 % | 4,6 |
| Müritz | Wind | 25–48 h | 880 | 5,7 | 0,0 | 1,2 | 87,5 % | 4,7 |
| Müritz | Wind | 1–48 h | 1.784 | 5,7 | 0,0 | 1,2 | 88,4 % | 4,6 |
| Müritz | Böe | 1–6 h | 228 | 10,0 | -0,4 | 1,5 | 86,0 % | 5,6 |
| Müritz | Böe | 7–24 h | 676 | 11,9 | +0,3 | 1,8 | 86,5 % | 6,5 |
| Müritz | Böe | 25–48 h | 880 | 11,5 | +0,1 | 2,0 | 82,2 % | 6,7 |
| Müritz | Böe | 1–48 h | 1.784 | 11,5 | +0,1 | 1,8 | 84,3 % | 6,5 |
| Vierwaldstättersee | Wind | 1–6 h | 432 | 1,8 | +0,2 | 0,9 | 91,7 % | 3,8 |
| Vierwaldstättersee | Wind | 7–24 h | 1.280 | 3,2 | -0,1 | 1,4 | 86,2 % | 4,8 |
| Vierwaldstättersee | Wind | 25–48 h | 1.664 | 2,9 | -0,1 | 1,3 | 88,2 % | 4,6 |
| Vierwaldstättersee | Wind | 1–48 h | 3.376 | 2,9 | -0,1 | 1,3 | 87,9 % | 4,6 |
| Vierwaldstättersee | Böe | 1–6 h | 432 | 4,4 | 0,0 | 1,2 | 91,0 % | 5,8 |
| Vierwaldstättersee | Böe | 7–24 h | 1.280 | 7,1 | -0,2 | 2,3 | 82,9 % | 7,5 |
| Vierwaldstättersee | Böe | 25–48 h | 1.664 | 6,5 | -0,2 | 2,2 | 84,6 % | 7,7 |
| Vierwaldstättersee | Böe | 1–48 h | 3.376 | 6,5 | -0,2 | 2,1 | 84,7 % | 7,4 |
| Neuenburgersee | Wind | 1–6 h | 216 | 2,6 | 0,0 | 1,0 | 90,7 % | 3,7 |
| Neuenburgersee | Wind | 7–24 h | 640 | 3,6 | +0,1 | 1,3 | 86,9 % | 4,8 |
| Neuenburgersee | Wind | 25–48 h | 832 | 3,4 | +0,2 | 1,3 | 86,2 % | 4,7 |
| Neuenburgersee | Wind | 1–48 h | 1.688 | 3,4 | +0,1 | 1,3 | 87,0 % | 4,6 |
| Neuenburgersee | Böe | 1–6 h | 216 | 6,1 | 0,0 | 1,5 | 83,8 % | 5,7 |
| Neuenburgersee | Böe | 7–24 h | 640 | 8,1 | +0,4 | 2,3 | 82,2 % | 7,5 |
| Neuenburgersee | Böe | 25–48 h | 832 | 7,6 | +0,3 | 2,3 | 82,6 % | 7,6 |
| Neuenburgersee | Böe | 1–48 h | 1.688 | 7,6 | +0,3 | 2,2 | 82,6 % | 7,3 |
| Neusiedler See | Wind | 1–6 h | 216 | 3,2 | +0,6 | 1,4 | 84,3 % | 4,8 |
| Neusiedler See | Wind | 7–24 h | 639 | 3,9 | +2,1 | 2,5 | 67,6 % | 5,8 |
| Neusiedler See | Wind | 25–48 h | 831 | 3,7 | +2,0 | 2,5 | 68,6 % | 5,8 |
| Neusiedler See | Wind | 1–48 h | 1.686 | 3,7 | +1,8 | 2,4 | 70,2 % | 5,7 |
| Neusiedler See | Böe | 1–6 h | 216 | 8,4 | -0,5 | 1,9 | 87,0 % | 7,5 |
| Neusiedler See | Böe | 7–24 h | 639 | 10,3 | +0,7 | 2,7 | 82,9 % | 9,1 |
| Neusiedler See | Böe | 25–48 h | 831 | 9,9 | +1,3 | 3,1 | 81,3 % | 9,9 |
| Neusiedler See | Böe | 1–48 h | 1.686 | 9,9 | +0,8 | 2,8 | 82,7 % | 9,3 |
| **alle zehn** | Wind | 1–6 h | 2.184 | 2,9 | +0,1 | 1,1 | 88,7 % | 4,3 |
| **alle zehn** | Wind | 7–24 h | 6.459 | 3,7 | +0,3 | 1,5 | 86,6 % | 5,2 |
| **alle zehn** | Wind | 25–48 h | 8.123 | 3,5 | +0,3 | 1,5 | 85,8 % | 5,1 |
| **alle zehn** | Wind | 1–48 h | 16.766 | 3,5 | +0,3 | 1,4 | 86,5 % | 5,1 |
| **alle zehn** | Böe | 1–6 h | 2.184 | 6,4 | 0,0 | 1,7 | 85,5 % | 6,5 |
| **alle zehn** | Böe | 7–24 h | 6.459 | 8,0 | +0,5 | 2,4 | 82,9 % | 8,0 |
| **alle zehn** | Böe | 25–48 h | 8.123 | 7,7 | +0,6 | 2,5 | 82,8 % | 8,3 |
| **alle zehn** | Böe | 1–48 h | 16.766 | 7,6 | +0,5 | 2,3 | 83,2 % | 8,0 |

Nicht genommen (Rang 11 ff.): Nyon / Changins (Genfersee, 2,5 km), Interlaken (Brienzersee, 2,8 km), Cressier (Bielersee, 3,2 km), Pully (Genfersee, 3,2 km), Cham (Zugersee, 4,2 km), Genève / Cointrin (Genfersee, 4,5 km), DOERNICK (Großer Plöner See, 4,8 km), SCHWERIN (Schweriner See, 5,8 km), Quinten (Walensee, 6,5 km), Zürich / Affoltern (Zürichsee, 8,0 km), Güttingen (Bodensee, 8,5 km), Aigle (Genfersee, 8,5 km), Payerne (Neuenburgersee, 8,9 km), Stabio (Luganersee, 8,9 km), Schmerikon (Zürichsee, 9,6 km), ST.WOLFGANG (Attersee, 9,9 km).

## 5. Quellen

```json
{
 "obs": {
  "builtAt": "2026-11-21T09:02:06.562Z",
  "stations": 3120,
  "withWind": 724,
  "delivering": 699
 },
 "alplakes": {
  "status": 200,
  "rate": {},
  "lakes": 139,
  "point": {
   "status": 200,
   "bytes": 1524,
   "ms": 108,
   "keys": [
    "time",
    "depth",
    "resample",
    "variables"
   ]
  },
  "cors": {
   "status": 400,
   "allowOrigin": null,
   "body": "Disallowed CORS origin"
  },
  "licence": "CC BY 4.0",
  "userAgentAsked": true,
  "throttleDocumented": true,
  "attribution": "Data: Alplakes, Eawag (CC BY 4.0)"
 },
 "bafu": {
  "status": 200,
  "bytes": 30394,
  "cors": "https://buscosun.com",
  "stations": 34,
  "withLevel": 34,
  "withTemp": 0,
  "newest": "2026-11-21T09:50:00+01:00"
 },
 "gkd": {
  "status": 200,
  "noApi": "keine Public-API für eine maschinenlesbare Bereitstellung der Daten in den Formaten JSON, CSV und XML.",
  "licence": "CC BY 4.0"
 },
 "links": {
  "https://www.dwd.de/DE/wetter/warnungen/warnWetter_node.html": {
   "status": 200,
   "bytes": 70215
  },
  "https://www.meteoschweiz.admin.ch/wetter/gefahren.html": {
   "status": 200,
   "bytes": 439353
  },
  "https://warnungen.zamg.at/": {
   "status": 200,
   "bytes": 3459
  }
 }
}
```
