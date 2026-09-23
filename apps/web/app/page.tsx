/**
 * Driving adapter (web) — UI only.
 * Business rules live in the API hexagon; this page must not compute totals or kitchen rules.
 */
export default function HomePage() {
  return (
    <main>
      <h1>Sistema de Pedidos</h1>
      <p>Adaptador web (Next.js). El núcleo hexagonal vive en @restaurante/api.</p>
    </main>
  );
}
