/**
 * BDE-E — der Karteninhalt „Brandprofil": Abruf, Zustände, Netz, Legende.
 *
 * Eine Komponente, zwei Aufrufer (Live-Dossier und Historie-Dossier) — dasselbe Muster wie
 * `DriversView`/`SatImageryBlock`. Der Abruf ist bewusst **eigen** und nicht der der
 * Wetterführung: das Profil braucht 31 Tage Stundenreihe und die Bodenfeuchte, die
 * Wetterführung nur das Brandzeitfenster (Begründung in `fireProfileLoad.ts`). Wer die
 * Karte nie aufklappt, zieht die 31 Tage nicht.
 */
import { useEffect, useState } from 'react';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import { ChartSkeleton, MissingBlock, useDossierBreakpoint } from './DossierPrimitives';
import { FireProfileChart } from './FireProfileChart';
import {
  buildFireProfile, PROFILE_NOTE, PROFILE_DEPENDENCE_NOTE, PROFILE_REF_DAYS,
  type FireProfile,
} from '../detail/fireProfile';
import { fetchFireProfileHours } from '../detail/fireProfileLoad';

export interface FireProfileBlockProps {
  lat: number;
  lon: number;
  /**
   * Zeitanker des Brands — im Regelfall die Erstdetektion, sonst das EFFIS-Branddatum
   * (`fireWindowAnchor`). `null` = es gibt keine Zeit, für die ein Profil gelten könnte.
   */
  anchorMs: number | null;
  /** Wird der Anker aus der Kartierung genommen, gilt derselbe Vorbehalt wie in der Wetterführung. */
  anchorNote?: string;
}

type State = { kind: 'loading' } | { kind: 'empty'; why: string } | { kind: 'ok'; profile: FireProfile };

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
const fmtHour = (ms: number) => new Date(ms).toLocaleString('de-DE', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
});

export function FireProfileBlock({ lat, lon, anchorMs, anchorNote }: FireProfileBlockProps) {
  const bp = useDossierBreakpoint();
  const compact = bp !== 'desktop';
  const [st, setSt] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (anchorMs == null) {
      setSt({ kind: 'empty', why: 'Für diesen Eintrag gibt es keinen Zeitpunkt — weder eine Detektion noch ein Branddatum aus der Kartierung. Ohne Zeitpunkt kein Profil.' });
      return;
    }
    let alive = true;
    setSt({ kind: 'loading' });
    void fetchFireProfileHours(lat, lon, anchorMs).then((hours) => {
      if (!alive) return;
      if (hours.length === 0) {
        setSt({ kind: 'empty', why: 'Die Archivreihe ist nicht erreichbar — ohne sie gibt es keine Vergleichsstunden. Es wird nichts geschätzt.' });
        return;
      }
      const profile = buildFireProfile(hours, anchorMs);
      if (!profile) {
        setSt({ kind: 'empty', why: 'Keine Archivstunde nahe genug am Brandzeitpunkt — der Rang bliebe eine Behauptung.' });
        return;
      }
      setSt({ kind: 'ok', profile });
    });
    return () => { alive = false; };
  }, [lat, lon, anchorMs]);

  if (st.kind === 'loading') {
    return <ChartSkeleton height={compact ? 236 : 268} note={`Vergleichsreihe der letzten ${PROFILE_REF_DAYS} Tage wird geholt …`} />;
  }
  if (st.kind === 'empty') return <MissingBlock>{st.why}</MissingBlock>;

  const p = st.profile;
  return (
    <Stack spacing={1}>
      <Typography variant="body2">
        Brandstunde <strong>{fmtHour(p.atMs)} UTC</strong> · verglichen mit {p.axes[0]?.n ?? 0} Stunden
        derselben Tageszeit zwischen {fmtDay(p.refRange[0])} und {fmtDay(p.refRange[1])}.
      </Typography>

      <FireProfileChart profile={p} compact={compact} />

      {anchorNote && <Typography variant="caption" color="text.secondary">{anchorNote}</Typography>}
      <Typography variant="caption" color="text.secondary">{PROFILE_NOTE}</Typography>
      <Typography variant="caption" color="text.secondary">{PROFILE_DEPENDENCE_NOTE}</Typography>
      {p.notes.map((n) => (
        <Typography key={n} variant="caption" color="text.secondary">{n}</Typography>
      ))}
    </Stack>
  );
}
