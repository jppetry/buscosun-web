/**
 * Intro tour content — one feature per step, data-driven so steps are trivially
 * reorderable/extendable. Headlines + body are German; identifiers English.
 *
 * Each feature step carries more than a teaser: `capabilities` lists what the
 * feature lets you do, and `howTo` is a one-line "so nutzt du es" hint — so the
 * tour both *shows the possibilities* and *teaches usage*. The opening step
 * explains the basic flow of the app itself.
 *
 * Order = a deliberate arc: first teach how buscosun works, then ground the
 * visitor in the core map, hit the most frequent everyday need (radar), the
 * planning tools (route, event), the trust differentiator (multi-model
 * confidence), the visual "wow" (globe), close on the unique local AI assistant
 * — then a clear CTA into the app.
 */

import type { IntroArt } from './introArt';
import {
  FlowArt, MapArt, RadarArt, RouteArt, EventArt, ForecastArt, GlobeArt, StartArt,
  MapDetail, RadarDetail, RouteDetail, EventDetail, ForecastDetail, GlobeDetail,
} from './introArt';

export interface IntroStep {
  id: string;
  /** Small label above the headline. */
  eyebrow: string;
  /** Short, punchy German headline. */
  title: string;
  /** 1–2 plain-language sentences. */
  body: string;
  /** What the feature lets you do — shown as a short checked list ("Möglichkeiten"). */
  capabilities?: string[];
  /** One-line usage hint ("So geht's"). */
  howTo?: string;
  /** Design-system accent token the illustration + step chrome inherit. */
  accent: string;
  /** Custom static illustration for this step. */
  Illustration: IntroArt;
  /** Optional second, smaller illustration: a concrete UI snippet of the feature. */
  Detail?: IntroArt;
  /** Final step renders the primary CTA instead of "Weiter". */
  cta?: boolean;
}

export const INTRO_STEPS: IntroStep[] = [
  {
    id: 'how',
    eyebrow: 'So funktioniert’s',
    title: 'So nutzt du buscosun',
    body: 'Gib oben einen Ort ein – buscosun öffnet die interaktive Karte mit allen Wetterdaten. Oder spring direkt in eines der Features.',
    capabilities: [
      'Ort suchen oder direkt auf der Karte tippen',
      'Wetter-Layer ein- und ausblenden',
      'Einen Punkt antippen für die Detail-Vorhersage',
      'Orte als Favoriten für den schnellen Zugriff speichern',
    ],
    howTo: 'Tippe ins Suchfeld oben und wähle deinen Ort.',
    accent: '--terracotta-500',
    Illustration: FlowArt,
  },
  {
    id: 'map',
    eyebrow: 'Wetterkarte',
    title: 'Die ganze DACH-Wetterkarte',
    body: 'Alle Wetterlagen als Layer auf einer interaktiven Karte – höhenkorrigiert aus DWD, GeoSphere und MeteoSwiss.',
    capabilities: [
      'Layer: Wind, Niederschlag, Temperatur, Wolken, Satellit, Blitze',
      'Zeit-Slider durch den Tagesverlauf bewegen',
      'Punktwerte, korrigiert auf die echte Geländehöhe',
      'Ohne Ortssuche direkt mit dem DACH-Überblick starten',
    ],
    howTo: 'Karte öffnen und oben die Layer umschalten.',
    accent: '--steel-600',
    Illustration: MapArt,
    Detail: MapDetail,
  },
  {
    id: 'radar',
    eyebrow: 'Regenradar',
    title: 'Regnet es gleich?',
    body: 'Minutengenaues Radar mit ehrlichem Übergang von der Messung zur Vorhersage.',
    capabilities: [
      '„Regen in X Minuten" für deinen Standort',
      'Messung und Modell-Vorhersage klar getrennt',
      'Sturmzellen-Zugbahn, Blitze und Schneefallgrenze',
      'Datenquelle und Aktualität transparent ausgewiesen',
    ],
    howTo: 'Ort wählen – der Punkt-Streifen zeigt, wann Regen kommt.',
    accent: '--slate-500',
    Illustration: RadarArt,
    Detail: RadarDetail,
  },
  {
    id: 'route',
    eyebrow: 'Tourenplanung',
    title: 'Wetter entlang deiner Route',
    body: 'Sieh Wind, Regen und Temperatur an jedem Kilometer deiner Strecke.',
    capabilities: [
      'GPX hochladen oder eine Strecke planen',
      'Wetter je Kilometer statt nur am Ziel',
      'Startzeit mit dem Zeit-Scrubber durchspielen',
    ],
    howTo: 'GPX-Datei laden und die Startzeit verschieben.',
    accent: '--sage-600',
    Illustration: RouteArt,
    Detail: RouteDetail,
  },
  {
    id: 'event',
    eyebrow: 'Event-Planung',
    title: 'Welcher Tag passt am besten?',
    body: 'Sag uns, wann du etwas vorhast – wir nennen dir den besten Tag dafür.',
    capabilities: [
      'Anlass, Ort und Zeitfenster festlegen',
      'Bester Tag aus dem Vergleich – inklusive Plan B',
      'Phasen (z. B. Trauung, Empfang) einzeln bewertet',
    ],
    howTo: 'Anlass wählen und die besten Tage anzeigen lassen.',
    accent: '--amber-500',
    Illustration: EventArt,
    Detail: EventDetail,
  },
  {
    id: 'forecast',
    eyebrow: 'Vorhersage',
    title: 'Mehrere Modelle, ehrlicher Spread',
    body: 'Statt einer einzelnen Zahl siehst du, wie sicher die Vorhersage wirklich ist.',
    capabilities: [
      'Mehrere Wettermodelle nebeneinander',
      'Unsicherheitsband statt Scheingenauigkeit',
      'Klar als Tendenz markiert, wenn es unsicher wird',
    ],
    howTo: 'Auf die Spannweite achten – eng heißt sicher.',
    accent: '--steel-600',
    Illustration: ForecastArt,
    Detail: ForecastDetail,
  },
  {
    id: 'globe',
    eyebrow: '3D-Globus',
    title: 'Das Wetter der ganzen Erde',
    body: 'Eine frei drehbare 3D-Erdkugel mit globalem Wind und Wetter.',
    capabilities: [
      'Frei drehbare, zoombare 3D-Erde',
      'Globaler Wind und Jetstream',
      'Temperatur als Raster über dem Planeten',
    ],
    howTo: 'Mit der Maus ziehen, um den Globus zu drehen.',
    accent: '--slate-500',
    Illustration: GlobeArt,
    Detail: GlobeDetail,
  },
  {
    id: 'start',
    eyebrow: 'Bereit?',
    title: 'Such deinen Ort und leg los',
    body: 'Das war die Tour. Gib oben einfach deinen Ort ein – alles Weitere entdeckst du unterwegs.',
    accent: '--sage-600',
    Illustration: StartArt,
    cta: true,
  },
];
