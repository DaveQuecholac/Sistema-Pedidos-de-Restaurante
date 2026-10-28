import { MesasScreen } from './mesas/mesas-screen';

/**
 * Driving adapter (web) — UI only.
 * Business rules live in the API hexagon; this page must not compute totals or kitchen rules.
 */
export default function HomePage() {
  return <MesasScreen />;
}
