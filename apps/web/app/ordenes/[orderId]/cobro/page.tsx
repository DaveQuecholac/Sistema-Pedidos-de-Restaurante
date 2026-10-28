import { PaymentScreen } from './payment-screen';

export default async function OrderPaymentPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <PaymentScreen orderId={orderId} />;
}
