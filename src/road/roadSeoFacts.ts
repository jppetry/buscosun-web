/**
 * ERZEUGT von scripts/seo/build-road-seo-facts.mjs — NICHT VON HAND ÄNDERN.
 *
 * Zahlen hinter den Autobahn-Seiten /autobahnwetter/<slug> (audit/seo-autobahnwetter.md). Jede Zahl ist eine Zählung aus dem
 * Daten-Repo buscosun-data:
 *   km, parts      road/v1/static/corridors.json (BKG DLM250, ohne Stichäste), Stand 2026-10-11
 *   segments, bridgeKm, forestPct, lowland, exposed
 *                  road/v1/static/segments.json (OSM-Anschlussstellen und -Brücken, ESA WorldCover, Terrarium), Stand 2026-10-14
 *   stations, byState, noSeries, highest
 *                  road/v1/static/stations.json (DWD-Stationsliste der Glättemeldeanlagen), abgerufen 2026-11-01;
 *                  „highest" nur, wenn das Höhenmodell am Messpunkt höchstens 60 m von der Listenhöhe abweicht
 *   meets          Nachbarn: Achsen der 20 Autobahnen nähern sich auf ≤ 1.5 km (corridors.json)
 *   noSeries       Anlagen in Ländern, aus denen der DWD derzeit keine Reihen liefert (BW, V-AW-20)
 *
 * Nur die Text-Chunks lesen diese Datei (subRouteTexts.ts, generate-seo.mjs) — nie das Start-Bundle.
 */

export interface RoadSeoFacts {
  road: string;
  /** Länge der Teilstrecken in Deutschland (km, Achse BKG DLM250, ohne Stichäste). */
  km: number;
  /** Teilstrecken (Korridore der Seite), längste zuerst; `gap` = Teilstück ohne Messstelle. */
  parts: ReadonlyArray<{ id: string; from: string; to: string; km: number; gap?: true }>;
  /** Abschnitte Anschlussstelle zu Anschlussstelle (wie in der Gefahren-Leiste). */
  segments: number;
  /** Glättemeldeanlagen dieser Autobahn in der DWD-Stationsliste. */
  stations: number;
  /** Anlagen je Bundesland (Kürzel, Anzahl), meiste zuerst. */
  byState: ReadonlyArray<readonly [state: string, n: number]>;
  /** davon in Ländern ohne ausgelieferte Reihen. */
  noSeries: number;
  /** Höchstgelegene Anlagen (Höhe laut Stationsliste, mit dem Höhenmodell gegengeprüft). */
  highest: ReadonlyArray<{ name: string; state: string; h: number }>;
  /** Nur gefüllt, wenn alle unter `highest` ohne Reihen sind: die zwei höchsten MIT Messreihe. */
  highestWithSeries: ReadonlyArray<{ name: string; state: string; h: number }>;
  /** Brückenlänge entlang der Achse (km, OSM). */
  bridgeKm: number;
  /** Waldanteil neben der Fahrbahn (%, ESA WorldCover, 50-m-Band). */
  forestPct: number;
  /** Bis zu drei Abschnitte in Niederungen (Kaltluft, Nebel), längste zuerst. */
  lowland: readonly string[];
  /** Bis zu drei Abschnitte in freier Lage (Seitenwind), längste zuerst. */
  exposed: readonly string[];
  /** Andere der 20 Autobahnen, deren Achse sich auf höchstens 1.5 km nähert (Kreuz, Dreieck). */
  meets: readonly string[];
}

export const ROAD_SEO_STATE_NAME: Readonly<Record<string, string>> = {"BW":"Baden-Württemberg","BY":"Bayern","BE":"Berlin","BB":"Brandenburg","HB":"Bremen","HH":"Hamburg","HE":"Hessen","MV":"Mecklenburg-Vorpommern","NI":"Niedersachsen","NW":"Nordrhein-Westfalen","RP":"Rheinland-Pfalz","SL":"Saarland","SN":"Sachsen","ST":"Sachsen-Anhalt","SH":"Schleswig-Holstein","TH":"Thüringen"};

/** Alle Autobahnen zusammen: Anlagen in der Stationsliste (davon ohne Reihen), Teilstrecken, Abschnitte, km. */
export const ROAD_SEO_TOTALS = {"stations":970,"noSeries":77,"corridors":212,"segments":1731,"km":13718} as const;

/** Stand der Eingänge (ISO-Datum). */
export const ROAD_SEO_FACTS_STAND = {"corridors":"2026-10-11","segments":"2026-10-14","stationList":"2026-11-01"} as const;

export const ROAD_SEO_FACTS: Readonly<Record<string, RoadSeoFacts>> = {
  "a1": {
    "road": "A1",
    "km": 779,
    "parts": [
      {
        "id": "a1",
        "from": "Heiligenhafen",
        "to": "Blankenheim",
        "km": 619
      },
      {
        "id": "a1-2",
        "from": "Daun",
        "to": "Riegelsberg",
        "km": 137
      },
      {
        "id": "a1-3",
        "from": "Barsbüttel",
        "to": "Oststeinbek",
        "km": 12
      },
      {
        "id": "a1-4",
        "from": "Buchholz in der Nordheide",
        "to": "Buchholz in der Nordheide",
        "km": 7
      },
      {
        "id": "a1-5",
        "from": "Riegelsberg",
        "to": "Riegelsberg",
        "km": 4,
        "gap": true
      }
    ],
    "segments": 105,
    "stations": 66,
    "byState": [
      [
        "NW",
        23
      ],
      [
        "NI",
        15
      ],
      [
        "RP",
        10
      ],
      [
        "SH",
        9
      ],
      [
        "SL",
        5
      ],
      [
        "HH",
        3
      ],
      [
        "HB",
        1
      ]
    ],
    "noSeries": 0,
    "highest": [
      {
        "name": "Kelberg",
        "state": "RP",
        "h": 589
      },
      {
        "name": "Hinzert/Beuren",
        "state": "RP",
        "h": 560
      },
      {
        "name": "Blankenheim",
        "state": "NW",
        "h": 550
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 28,
    "forestPct": 37,
    "lowland": [
      "Nonnweiler-Bierfeld – Nonnweiler-Primstal",
      "Raststätte Ehrenberg – Remscheid-Lennep",
      "Föhren – Dreieck Moseltal"
    ],
    "exposed": [
      "Rastplatz Oberste Heide – Euskirchen"
    ],
    "meets": [
      "a7",
      "a8",
      "a3",
      "a4",
      "a44",
      "a45",
      "a61",
      "a20",
      "a46"
    ]
  },
  "a7": {
    "road": "A7",
    "km": 974,
    "parts": [
      {
        "id": "a7",
        "from": "Schwarmstedt",
        "to": "Füssen",
        "km": 704
      },
      {
        "id": "a7-2",
        "from": "Einfeld",
        "to": "Bad Fallingbostel",
        "km": 181
      },
      {
        "id": "a7-3",
        "from": "Harrislee",
        "to": "Bordesholm",
        "km": 84
      },
      {
        "id": "a7-4",
        "from": "Bad Fallingbostel",
        "to": "Schwarmstedt",
        "km": 5,
        "gap": true
      }
    ],
    "segments": 119,
    "stations": 61,
    "byState": [
      [
        "BY",
        21
      ],
      [
        "NI",
        19
      ],
      [
        "BW",
        8
      ],
      [
        "SH",
        6
      ],
      [
        "HE",
        5
      ],
      [
        "HH",
        2
      ]
    ],
    "noSeries": 8,
    "highest": [
      {
        "name": "Brücke im Rottachtal",
        "state": "BY",
        "h": 900
      },
      {
        "name": "Hopferau",
        "state": "BY",
        "h": 795
      },
      {
        "name": "Füssen",
        "state": "BY",
        "h": 784
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 40,
    "forestPct": 32,
    "lowland": [
      "Nesselwang – Füssen",
      "Raststätte Hasselberg West – Rastplatz Fuchsrain",
      "Melsungen – Raststätte Hasselberg West"
    ],
    "exposed": [
      "Dreieck Hannover-Süd – Hildesheim-Drispenstedt",
      "Wörnitz – Feuchtwangen-West",
      "Memmingen-Süd – Rastplatz Darastfeld"
    ],
    "meets": [
      "a1",
      "a8",
      "a2",
      "a3",
      "a4",
      "a44",
      "a6",
      "a96",
      "a5"
    ]
  },
  "a8": {
    "road": "A8",
    "km": 534,
    "parts": [
      {
        "id": "a8-2",
        "from": "Laichingen",
        "to": "Gröbenzell",
        "km": 148
      },
      {
        "id": "a8",
        "from": "München",
        "to": "Salzburg",
        "km": 129
      },
      {
        "id": "a8-3",
        "from": "Merzig",
        "to": "Pirmasens",
        "km": 117
      },
      {
        "id": "a8-4",
        "from": "Ettlingen",
        "to": "Deggingen",
        "km": 113
      },
      {
        "id": "a8-5",
        "from": "Leinfelden-Echterdingen",
        "to": "Neuhausen auf den Fildern",
        "km": 12
      },
      {
        "id": "a8-6",
        "from": "Laichingen",
        "to": "Deggingen",
        "km": 6,
        "gap": true
      },
      {
        "id": "a8-7",
        "from": "Laichingen",
        "to": "Deggingen",
        "km": 5,
        "gap": true
      },
      {
        "id": "a8-8",
        "from": "Gröbenzell",
        "to": "Gräfelfing",
        "km": 4,
        "gap": true
      }
    ],
    "segments": 66,
    "stations": 60,
    "byState": [
      [
        "BY",
        38
      ],
      [
        "BW",
        15
      ],
      [
        "SL",
        6
      ],
      [
        "RP",
        1
      ]
    ],
    "noSeries": 15,
    "highest": [
      {
        "name": "Wasserscheide",
        "state": "BW",
        "h": 777
      },
      {
        "name": "Hohenstadt",
        "state": "BW",
        "h": 774
      },
      {
        "name": "Widderstall",
        "state": "BW",
        "h": 750
      }
    ],
    "highestWithSeries": [
      {
        "name": "Brücke am Irschenberg",
        "state": "BY",
        "h": 715
      },
      {
        "name": "Seehammer See",
        "state": "BY",
        "h": 690
      }
    ],
    "bridgeKm": 25,
    "forestPct": 29,
    "lowland": [
      "Merzig – Rehlingen",
      "Leonberg-West – Kreuz Stuttgart",
      "Bergen – Neukirchen"
    ],
    "exposed": [
      "Merklingen – Ulm-West / Ulm-Nord",
      "Leinfelden-Echterdingen – Neuhausen auf den Fildern",
      "Stuttgart-Flughafen/Messe – Esslingen"
    ],
    "meets": [
      "a1",
      "a7",
      "a6",
      "a93",
      "a99",
      "a5"
    ]
  },
  "a2": {
    "road": "A2",
    "km": 483,
    "parts": [
      {
        "id": "a2",
        "from": "Bottrop",
        "to": "Groß Kreutz",
        "km": 478
      },
      {
        "id": "a2-2",
        "from": "Groß Kreutz",
        "to": "Groß Kreutz",
        "km": 5,
        "gap": true
      }
    ],
    "segments": 64,
    "stations": 56,
    "byState": [
      [
        "NI",
        34
      ],
      [
        "NW",
        15
      ],
      [
        "ST",
        5
      ],
      [
        "BB",
        2
      ]
    ],
    "noSeries": 0,
    "highest": [
      {
        "name": "Papenbrink",
        "state": "NI",
        "h": 221
      },
      {
        "name": "Bielefelder Berg",
        "state": "NW",
        "h": 205
      },
      {
        "name": "Talbrücke Steinegge-Exter",
        "state": "NW",
        "h": 201
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 16,
    "forestPct": 39,
    "lowland": [
      "Bad Eilsen (Ausfahrt Ost) – Rasthof Auetal Nord"
    ],
    "exposed": [
      "Kreuz Magdeburg – Magdeburg-Zentrum",
      "Bornstedt – Rasthof Börde"
    ],
    "meets": [
      "a7",
      "a3",
      "a45",
      "a31"
    ]
  },
  "a9": {
    "road": "A9",
    "km": 543,
    "parts": [
      {
        "id": "a9-2",
        "from": "Beelitz",
        "to": "Schnaittach",
        "km": 353
      },
      {
        "id": "a9",
        "from": "Schnaittach",
        "to": "Unterföhring",
        "km": 174
      },
      {
        "id": "a9-3",
        "from": "Greding",
        "to": "Greding",
        "km": 7
      },
      {
        "id": "a9-4",
        "from": "Schnaittach",
        "to": "Schnaittach",
        "km": 5,
        "gap": true
      },
      {
        "id": "a9-5",
        "from": "Beelitz",
        "to": "Beelitz",
        "km": 3,
        "gap": true
      },
      {
        "id": "a9-6",
        "from": "Schnaittach",
        "to": "Schnaittach",
        "km": 3,
        "gap": true
      }
    ],
    "segments": 63,
    "stations": 54,
    "byState": [
      [
        "BY",
        40
      ],
      [
        "ST",
        6
      ],
      [
        "TH",
        5
      ],
      [
        "BB",
        3
      ]
    ],
    "noSeries": 0,
    "highest": [
      {
        "name": "Hormersdorf",
        "state": "BY",
        "h": 537
      },
      {
        "name": "Talbrücke Trockau",
        "state": "BY",
        "h": 527
      },
      {
        "name": "Testanlage Gelbelsee",
        "state": "BY",
        "h": 523
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 19,
    "forestPct": 30,
    "lowland": [
      "Hilpoltstein – Greding",
      "Münchberg-Nord – Rastplatz Streitau",
      "Schleiz – Bad Lobenstein"
    ],
    "exposed": [
      "Kreuz Rippachtal – Weißenfels",
      "Weißenfels – Rasthof Osterfeld",
      "Bitterfeld-Wolfen – Halle"
    ],
    "meets": [
      "a3",
      "a4",
      "a6",
      "a93",
      "a99"
    ]
  },
  "a3": {
    "road": "A3",
    "km": 793,
    "parts": [
      {
        "id": "a3",
        "from": "Emmerich",
        "to": "Schärding",
        "km": 786
      },
      {
        "id": "a3-2",
        "from": "Langenfeld",
        "to": "Leichlingen",
        "km": 4
      },
      {
        "id": "a3-3",
        "from": "Röthenbach an der Pegnitz",
        "to": "Schwaig",
        "km": 3
      }
    ],
    "segments": 100,
    "stations": 48,
    "byState": [
      [
        "BY",
        23
      ],
      [
        "NW",
        16
      ],
      [
        "HE",
        6
      ],
      [
        "RP",
        3
      ]
    ],
    "noSeries": 0,
    "highest": [
      {
        "name": "Parsberg",
        "state": "BY",
        "h": 538
      },
      {
        "name": "Unterpfraundorf",
        "state": "BY",
        "h": 524
      },
      {
        "name": "Galgenberg",
        "state": "BY",
        "h": 514
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 31,
    "forestPct": 37,
    "lowland": [
      "Iggensbach – Aicha vorm Wald",
      "Kreuz Altdorf – Oberölsbach",
      "Wörth an der Donau-Ost – Kirchroth"
    ],
    "exposed": [
      "Emmerich-Ost – Rastplatz Millingen"
    ],
    "meets": [
      "a1",
      "a7",
      "a2",
      "a9",
      "a4",
      "a44",
      "a45",
      "a93",
      "a5",
      "a46",
      "a73"
    ]
  },
  "a4": {
    "road": "A4",
    "km": 594,
    "parts": [
      {
        "id": "a4",
        "from": "Niederaula",
        "to": "Görlitz",
        "km": 439
      },
      {
        "id": "a4-2",
        "from": "Aachen",
        "to": "Eil",
        "km": 84
      },
      {
        "id": "a4-3",
        "from": "Köln",
        "to": "Wenden",
        "km": 71
      }
    ],
    "segments": 74,
    "stations": 43,
    "byState": [
      [
        "NW",
        18
      ],
      [
        "TH",
        13
      ],
      [
        "SN",
        11
      ],
      [
        "HE",
        1
      ]
    ],
    "noSeries": 0,
    "highest": [
      {
        "name": "Krombach",
        "state": "NW",
        "h": 481
      },
      {
        "name": "Wüstenbrand",
        "state": "SN",
        "h": 470
      },
      {
        "name": "Rabensteiner Wald",
        "state": "SN",
        "h": 468
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 32,
    "forestPct": 30,
    "lowland": [
      "Niederaula – Bad Hersfeld",
      "Bad Hersfeld – Friedewald",
      "Bergisch Gladbach-Bensberg – Overath"
    ],
    "exposed": [
      "Wiesaer Forst – Görlitz",
      "Wandersleben – Kreuz Erfurt",
      "Langerwehe – Merzenich"
    ],
    "meets": [
      "a1",
      "a7",
      "a9",
      "a3",
      "a44",
      "a45",
      "a71",
      "a61"
    ]
  },
  "a44": {
    "road": "A44",
    "km": 341,
    "parts": [
      {
        "id": "a44",
        "from": "Holzwickede",
        "to": "Lohfelden",
        "km": 150
      },
      {
        "id": "a44-2",
        "from": "Neersen",
        "to": "Niederwenigern",
        "km": 68
      },
      {
        "id": "a44-3",
        "from": "Walheim - Hahn",
        "to": "Jüchen",
        "km": 60
      },
      {
        "id": "a44-5",
        "from": "Helsa",
        "to": "Eisenach",
        "km": 55
      },
      {
        "id": "a44-4",
        "from": "Meerbusch",
        "to": "Ratingen",
        "km": 7
      },
      {
        "id": "a44-6",
        "from": "Titz",
        "to": "Titz",
        "km": 2
      }
    ],
    "segments": 49,
    "stations": 27,
    "byState": [
      [
        "NW",
        22
      ],
      [
        "HE",
        5
      ]
    ],
    "noSeries": 0,
    "highest": [
      {
        "name": "Walburg",
        "state": "HE",
        "h": 417
      },
      {
        "name": "Talbrücke Apfelbaumgrund",
        "state": "NW",
        "h": 380
      },
      {
        "name": "Hoofer Berg",
        "state": "HE",
        "h": 362
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 30,
    "forestPct": 33,
    "lowland": [
      "Hessisch Lichtenau-Ost – Eschwege",
      "Eschwege – Sontra-Mitte",
      "Sontra-Mitte – Sontra-Ost"
    ],
    "exposed": [
      "Dreieck Jackerath – Kreuz Holz",
      "Rastplatz Röllingsergraben – Soest",
      "Rastplatz Lohner Klei – Rastplatz Klievermühle"
    ],
    "meets": [
      "a1",
      "a7",
      "a3",
      "a4",
      "a61",
      "a46"
    ]
  },
  "a6": {
    "road": "A6",
    "km": 494,
    "parts": [
      {
        "id": "a6",
        "from": "Saarbrücken",
        "to": "Weiden",
        "km": 494
      }
    ],
    "segments": 58,
    "stations": 29,
    "byState": [
      [
        "BY",
        14
      ],
      [
        "BW",
        6
      ],
      [
        "RP",
        5
      ],
      [
        "SL",
        4
      ]
    ],
    "noSeries": 6,
    "highest": [
      {
        "name": "Frankenalb",
        "state": "BY",
        "h": 615
      },
      {
        "name": "Kalter Baum",
        "state": "BY",
        "h": 595
      },
      {
        "name": "Frankenhöhe",
        "state": "BY",
        "h": 529
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 24,
    "forestPct": 37,
    "lowland": [
      "Kaiserslautern-Einsiedlerhof – Dreieck Kaiserslautern",
      "Nabburg-West – Wernberg-Ost",
      "Pleystein – Weiden"
    ],
    "exposed": [],
    "meets": [
      "a7",
      "a8",
      "a9",
      "a93",
      "a5",
      "a61",
      "a73"
    ]
  },
  "a45": {
    "road": "A45",
    "km": 259,
    "parts": [
      {
        "id": "a45",
        "from": "Oestrich",
        "to": "Kleinostheim",
        "km": 253
      },
      {
        "id": "a45-2",
        "from": "Mengede",
        "to": "Oestrich",
        "km": 3,
        "gap": true
      },
      {
        "id": "a45-3",
        "from": "Kleinostheim",
        "to": "Kleinostheim",
        "km": 3,
        "gap": true
      }
    ],
    "segments": 39,
    "stations": 29,
    "byState": [
      [
        "NW",
        23
      ],
      [
        "HE",
        5
      ],
      [
        "BY",
        1
      ]
    ],
    "noSeries": 0,
    "highest": [
      {
        "name": "Homert",
        "state": "NW",
        "h": 532
      },
      {
        "name": "Talbrücke Sichter",
        "state": "NW",
        "h": 530
      },
      {
        "name": "Am Wildenstein",
        "state": "NW",
        "h": 490
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 28,
    "forestPct": 47,
    "lowland": [
      "Drolshagen – Rastplatz Springe",
      "Rastplatz Am Rehberg – Rastplatz Volkersbach",
      "Rastplatz Am Wildenberg – Rastplatz Kalteiche"
    ],
    "exposed": [],
    "meets": [
      "a1",
      "a2",
      "a3",
      "a4",
      "a5",
      "a46"
    ]
  },
  "a96": {
    "road": "A96",
    "km": 178,
    "parts": [
      {
        "id": "a96",
        "from": "Bregenz",
        "to": "München",
        "km": 178
      }
    ],
    "segments": 21,
    "stations": 23,
    "byState": [
      [
        "BY",
        14
      ],
      [
        "BW",
        9
      ]
    ],
    "noSeries": 9,
    "highest": [
      {
        "name": "Kirchdorfer Berg",
        "state": "BY",
        "h": 660
      },
      {
        "name": "Kohlberg Tunnel",
        "state": "BY",
        "h": 660
      },
      {
        "name": "Altmannshofen",
        "state": "BW",
        "h": 657
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 7,
    "forestPct": 31,
    "lowland": [
      "Rastplatz Humbrechts – Kißlegg"
    ],
    "exposed": [],
    "meets": [
      "a7",
      "a99"
    ]
  },
  "a93": {
    "road": "A93",
    "km": 278,
    "parts": [
      {
        "id": "a93",
        "from": "Hof",
        "to": "Wolnzach",
        "km": 241
      },
      {
        "id": "a93-2",
        "from": "Raubling",
        "to": "Kiefersfelden",
        "km": 26
      },
      {
        "id": "a93-3",
        "from": "Marktredwitz",
        "to": "Marktredwitz",
        "km": 10
      }
    ],
    "segments": 35,
    "stations": 20,
    "byState": [
      [
        "BY",
        20
      ]
    ],
    "noSeries": 0,
    "highest": [
      {
        "name": "Oberhardtmannsreuth",
        "state": "BY",
        "h": 543
      },
      {
        "name": "Autobahndreieck Hochfranken",
        "state": "BY",
        "h": 532
      },
      {
        "name": "Seibersbach",
        "state": "BY",
        "h": 528
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 9,
    "forestPct": 32,
    "lowland": [
      "Brannenburg – Oberaudorf",
      "Regenstauf – Regensburg-Nord",
      "Nabburg – Schwarzenfeld"
    ],
    "exposed": [],
    "meets": [
      "a8",
      "a9",
      "a3",
      "a6"
    ]
  },
  "a99": {
    "road": "A99",
    "km": 60,
    "parts": [
      {
        "id": "a99",
        "from": "Germering",
        "to": "Hohenbrunn",
        "km": 54
      },
      {
        "id": "a99-2",
        "from": "Gröbenzell",
        "to": "Karlsfeld",
        "km": 5
      }
    ],
    "segments": 9,
    "stations": 17,
    "byState": [
      [
        "BY",
        17
      ]
    ],
    "noSeries": 0,
    "highest": [
      {
        "name": "Putzbrunn",
        "state": "BY",
        "h": 565
      },
      {
        "name": "Hohenbrunn",
        "state": "BY",
        "h": 560
      },
      {
        "name": "Grasbrunn",
        "state": "BY",
        "h": 554
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 2,
    "forestPct": 22,
    "lowland": [],
    "exposed": [],
    "meets": [
      "a8",
      "a9",
      "a96"
    ]
  },
  "a71": {
    "road": "A71",
    "km": 225,
    "parts": [
      {
        "id": "a71",
        "from": "Sangerhausen",
        "to": "Niederwerrn",
        "km": 225
      }
    ],
    "segments": 23,
    "stations": 24,
    "byState": [
      [
        "TH",
        20
      ],
      [
        "BY",
        4
      ]
    ],
    "noSeries": 0,
    "highest": [
      {
        "name": "Oberhof",
        "state": "TH",
        "h": 593
      },
      {
        "name": "Wilde Gera",
        "state": "TH",
        "h": 588
      },
      {
        "name": "Suhl",
        "state": "TH",
        "h": 565
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 18,
    "forestPct": 21,
    "lowland": [
      "Rastplatz Dolmar – Meiningen-Süd",
      "Oberhof – Dreieck Suhl"
    ],
    "exposed": [
      "Rasthof Mellrichstädter Höhe – Bad Neustadt an der Saale",
      "Sömmerda-Süd – Erfurt-Nord",
      "Rastplatz Thüringer Tor – Rasthof Mellrichstädter Höhe"
    ],
    "meets": [
      "a4",
      "a73"
    ]
  },
  "a5": {
    "road": "A5",
    "km": 463,
    "parts": [
      {
        "id": "a5",
        "from": "Niederaula",
        "to": "Riehen",
        "km": 449
      },
      {
        "id": "a5-2",
        "from": "Frankfurt am Main",
        "to": "Mörfelden-Walldorf",
        "km": 11
      },
      {
        "id": "a5-3",
        "from": "Niederaula",
        "to": "Niederaula",
        "km": 3,
        "gap": true
      }
    ],
    "segments": 56,
    "stations": 20,
    "byState": [
      [
        "BW",
        13
      ],
      [
        "HE",
        7
      ]
    ],
    "noSeries": 13,
    "highest": [
      {
        "name": "Homberg/Ohm",
        "state": "HE",
        "h": 330
      },
      {
        "name": "Wetterau",
        "state": "HE",
        "h": 250
      },
      {
        "name": "Rebgarten",
        "state": "BW",
        "h": 250
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 11,
    "forestPct": 38,
    "lowland": [
      "Rastplatz Rheinaue – Riehen",
      "Müllheim / Neuenburg – Rastplatz Rheinaue",
      "Ohmtal-Dreieck – Homberg (Ohm)"
    ],
    "exposed": [
      "Gambacher Kreuz – Bad Nauheim"
    ],
    "meets": [
      "a7",
      "a8",
      "a3",
      "a6",
      "a45"
    ]
  },
  "a61": {
    "road": "A61",
    "km": 316,
    "parts": [
      {
        "id": "a61",
        "from": "Weilerswist",
        "to": "Hockenheim",
        "km": 242
      },
      {
        "id": "a61-2",
        "from": "Kaldenkirchen",
        "to": "Jüchen",
        "km": 38
      },
      {
        "id": "a61-3",
        "from": "Titz",
        "to": "Erftstadt",
        "km": 36
      }
    ],
    "segments": 38,
    "stations": 20,
    "byState": [
      [
        "RP",
        13
      ],
      [
        "NW",
        6
      ],
      [
        "BW",
        1
      ]
    ],
    "noSeries": 1,
    "highest": [
      {
        "name": "Laudert",
        "state": "RP",
        "h": 500
      },
      {
        "name": "Tiefenbachtalbrücke",
        "state": "RP",
        "h": 443
      },
      {
        "name": "Waldesch",
        "state": "RP",
        "h": 414
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 16,
    "forestPct": 30,
    "lowland": [
      "Rheinböllen – Stromberg"
    ],
    "exposed": [
      "Swisttal-Heimerzheim – Rastplatz Peppenhoven-West",
      "Kreuz Ludwigshafen – Mutterstadt-West",
      "Mutterstadt-West – Schifferstadt"
    ],
    "meets": [
      "a1",
      "a4",
      "a44",
      "a6",
      "a46"
    ]
  },
  "a20": {
    "road": "A20",
    "km": 349,
    "parts": [
      {
        "id": "a20",
        "from": "Bad Segeberg",
        "to": "Prenzlau",
        "km": 349
      }
    ],
    "segments": 39,
    "stations": 17,
    "byState": [
      [
        "MV",
        15
      ],
      [
        "BB",
        1
      ],
      [
        "SH",
        1
      ]
    ],
    "noSeries": 0,
    "highest": [
      {
        "name": "Brohmer Berge",
        "state": "MV",
        "h": 77
      },
      {
        "name": "Ravensmühle",
        "state": "MV",
        "h": 70
      },
      {
        "name": "Neukloster",
        "state": "MV",
        "h": 61
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 13,
    "forestPct": 8,
    "lowland": [],
    "exposed": [
      "Neubrandenburg-Ost – Friedland",
      "Parkplatz Klockow-West – Prenzlau-Süd",
      "Dummerstorf – Speckmoor"
    ],
    "meets": [
      "a1"
    ]
  },
  "a46": {
    "road": "A46",
    "km": 159,
    "parts": [
      {
        "id": "a46-3",
        "from": "Heinsberg",
        "to": "Neuss",
        "km": 51
      },
      {
        "id": "a46-2",
        "from": "Neuss",
        "to": "Schwelm",
        "km": 48
      },
      {
        "id": "a46",
        "from": "Wickede",
        "to": "Bestwig",
        "km": 43
      },
      {
        "id": "a46-4",
        "from": "Hagen",
        "to": "Iserlohn",
        "km": 17
      }
    ],
    "segments": 21,
    "stations": 19,
    "byState": [
      [
        "NW",
        19
      ]
    ],
    "noSeries": 0,
    "highest": [
      {
        "name": "Nuttlar",
        "state": "NW",
        "h": 383
      },
      {
        "name": "Talbrücke Fulmecke",
        "state": "NW",
        "h": 326
      },
      {
        "name": "Echterberg",
        "state": "NW",
        "h": 305
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 16,
    "forestPct": 43,
    "lowland": [
      "Wickede – Arnsberg-Altstadt",
      "Arnsberg-Altstadt – Freienohl"
    ],
    "exposed": [],
    "meets": [
      "a1",
      "a3",
      "a44",
      "a45",
      "a61"
    ]
  },
  "a73": {
    "road": "A73",
    "km": 172,
    "parts": [
      {
        "id": "a73",
        "from": "Suhl",
        "to": "Fürth",
        "km": 153
      },
      {
        "id": "a73-2",
        "from": "Stein",
        "to": "Schwarzenbruck",
        "km": 15
      },
      {
        "id": "a73-4",
        "from": "Fürth",
        "to": "Fürth",
        "km": 4,
        "gap": true
      }
    ],
    "segments": 22,
    "stations": 12,
    "byState": [
      [
        "BY",
        10
      ],
      [
        "TH",
        2
      ]
    ],
    "noSeries": 0,
    "highest": [
      {
        "name": "Eisfeld",
        "state": "BY",
        "h": 519
      },
      {
        "name": "Talbrücke St. Kilian",
        "state": "TH",
        "h": 413
      },
      {
        "name": "Zollhaus",
        "state": "BY",
        "h": 345
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 13,
    "forestPct": 35,
    "lowland": [
      "Suhl-Friedberg – Schleusingen"
    ],
    "exposed": [],
    "meets": [
      "a3",
      "a6",
      "a71"
    ]
  },
  "a31": {
    "road": "A31",
    "km": 240,
    "parts": [
      {
        "id": "a31",
        "from": "Hinte",
        "to": "Grafenwald",
        "km": 240
      }
    ],
    "segments": 29,
    "stations": 16,
    "byState": [
      [
        "NI",
        10
      ],
      [
        "NW",
        6
      ]
    ],
    "noSeries": 0,
    "highest": [
      {
        "name": "Gescher",
        "state": "NW",
        "h": 69
      },
      {
        "name": "Borken",
        "state": "NW",
        "h": 67
      },
      {
        "name": "Kaltenbach",
        "state": "NW",
        "h": 64
      }
    ],
    "highestWithSeries": [],
    "bridgeKm": 4,
    "forestPct": 30,
    "lowland": [],
    "exposed": [],
    "meets": [
      "a2"
    ]
  }
};
