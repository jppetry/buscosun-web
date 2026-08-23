import FeedbackPage from '../../feedback/FeedbackPage';
import { useAppNav } from '../useAppNav';

export default function FeedbackRoute() {
  const nav = useAppNav();
  return <FeedbackPage onBack={nav.goHome} />;
}
