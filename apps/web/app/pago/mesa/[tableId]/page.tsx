import { TableAccountScreen } from './table-account-screen';

type Props = {
  params: Promise<{ tableId: string }>;
};

export default async function TableAccountPage({ params }: Props) {
  const { tableId } = await params;
  return <TableAccountScreen tableId={decodeURIComponent(tableId)} />;
}
