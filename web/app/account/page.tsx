import type { Metadata } from 'next';
import { Account } from '@/components/account';
import { AppPage } from '@/components/app-page';

export const metadata: Metadata = { title: 'Account · Tapebook' };

export default function AccountPage() {
  return (
    <AppPage>
      <Account />
    </AppPage>
  );
}
