import ValidationPage from '../../validation/ValidationPage';
import { useAppNav } from '../useAppNav';

export default function ValidationRoute() {
  const nav = useAppNav();
  return <ValidationPage onBack={nav.goHome} />;
}
