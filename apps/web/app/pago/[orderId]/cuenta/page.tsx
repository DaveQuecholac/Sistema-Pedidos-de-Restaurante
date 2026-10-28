import { TotalsScreen } from '../../../ordenes/[orderId]/cuenta/totals-screen';

type Props = {
  params: Promise<{ orderId: string }>;
};

export default async function PagoCuentaPage({ params }: Props) {
  const { orderId } = await params;
  return <TotalsScreen orderId={decodeURIComponent(orderId)} />;
}
