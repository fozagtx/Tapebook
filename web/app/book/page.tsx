import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppPage } from '@/components/app-page';
import { Book } from '@/components/book';

export const metadata: Metadata = { title: 'The Book · Tapebook' };

export default function BookPage() {
  return (
    <AppPage>
      <Suspense>
        <Book />
      </Suspense>
    </AppPage>
  );
}
