import type { Metadata } from 'next';
import { AppPage } from '@/components/app-page';
import { Specs } from '@/components/specs';

export const metadata: Metadata = { title: 'Specs · Tapebook' };

export default function SpecsPage() {
  return (
    <AppPage>
      <Specs />
    </AppPage>
  );
}
