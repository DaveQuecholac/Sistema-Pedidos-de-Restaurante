import { PaymentScreen } from '../../../ordenes/[orderId]/cobro/payment-screen';

type Props = {
  params: Promise<{ orderId: string }>;
};

export default async function PagoCobroPage({ params }: Props) {
  const { orderId } = await params;
  return <PaymentScreen orderId={decodeURIComponent(orderId)} />;
}
