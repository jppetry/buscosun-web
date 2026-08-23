import WetterkarteRoute from './WetterkarteRoute';

/** `/warnungen` — die Wetterkarte mit dem amtlichen Warn-Layer als festem Hauptlayer (eigene SEO-URL). */
export default function WarnungenRoute() {
  return <WetterkarteRoute fixedPrimary="warnings" />;
}
