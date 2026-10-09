import type { Metadata } from 'next';
import { AppPage } from '@/components/app-page';
import { HuntView } from '@/components/hunt-view';

export async function generateMetadata({ params }: PageProps<'/hunt/[claimId]'>): Promise<Metadata> {
  const { claimId } = await params;
  return { title: `Hunt claim ${claimId} · Tapebook` };
}

export default async function HuntPage({ params }: PageProps<'/hunt/[claimId]'>) {
  const { claimId } = await params;
  return (
    <AppPage>
      <HuntView claimId={claimId} />
    </AppPage>
  );
}
