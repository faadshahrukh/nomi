import { TabPlaceholder } from '@/features/TabPlaceholder';
export default function Transactions() {
  return <TabPlaceholder title="Transactions" subtitle="Your complete ledger" sections={['All', 'Expenses', 'Income', 'Transfers', 'Recurring']}
    empty={{ icon: 'list', title: 'No transactions yet', message: 'Tell Nomi what happened from Home. Everything you record shows up here, searchable and editable.' }} />;
}
