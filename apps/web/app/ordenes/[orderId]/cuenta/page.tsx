import { TotalsScreen } from './totals-screen';

export default async function OrderTotalsPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <TotalsScreen orderId={orderId} />;
}
