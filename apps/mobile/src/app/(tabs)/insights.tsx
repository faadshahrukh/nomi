import { TabPlaceholder } from '@/features/TabPlaceholder';
export default function Insights() {
  return <TabPlaceholder title="Insights" subtitle="What your money is doing" sections={['Overview', 'What changed', 'Patterns', 'Categories', 'Merchants']}
    empty={{ icon: 'insights', title: 'Insights need a little history', message: "After a few weeks of activity, Nomi can show what changed and why. It only reports what your transactions support." }} />;
}
