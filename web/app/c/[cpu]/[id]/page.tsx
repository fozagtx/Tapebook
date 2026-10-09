import type { Metadata } from 'next';
import { AppPage } from '@/components/app-page';
import { CircuitView } from '@/components/circuit-view';

export async function generateMetadata({ params }: PageProps<'/c/[cpu]/[id]'>): Promise<Metadata> {
  const { id } = await params;
  return { title: `Circuit #${id} · Tapebook` };
}

export default async function CircuitPage({ params }: PageProps<'/c/[cpu]/[id]'>) {
  const { cpu, id } = await params;
  return (
    <AppPage>
      <CircuitView cpu={cpu} id={id} />
    </AppPage>
  );
}
