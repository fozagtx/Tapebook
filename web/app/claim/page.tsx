import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppPage } from '@/components/app-page';
import { ClaimFlow } from '@/components/claim-flow';

export const metadata: Metadata = { title: 'Post a claim · Tapebook' };

export default function ClaimPage() {
  return (
    <AppPage>
      <Suspense>
        <ClaimFlow />
      </Suspense>
    </AppPage>
  );
}
