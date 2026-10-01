import { TabPlaceholder } from '@/features/TabPlaceholder';
export default function Planning() {
  return <TabPlaceholder title="Planning" subtitle="Budgets, goals and what's coming" sections={['Budgets', 'Goals', 'Recurring', 'Calendar', 'Cash flow']}
    empty={{ icon: 'planning', title: 'Nothing planned yet', message: 'Set a monthly budget or a savings goal and Nomi will keep track as you spend.' }} />;
}
