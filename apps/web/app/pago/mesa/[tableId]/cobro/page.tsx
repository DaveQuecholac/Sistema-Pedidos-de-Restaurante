import { TablePaymentScreen } from './table-payment-screen';

type Props = {
  params: Promise<{ tableId: string }>;
};

export default async function TablePaymentPage({ params }: Props) {
  const { tableId } = await params;
  return <TablePaymentScreen tableId={decodeURIComponent(tableId)} />;
}
