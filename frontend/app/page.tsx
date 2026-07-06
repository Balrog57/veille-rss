'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkAuth } from '@/lib/api';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    checkAuth()
      .then(() => router.push('/dashboard'))
      .catch(() => router.push('/login'));
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-amber-500 text-lg animate-pulse">Chargement...</div>
    </div>
  );
}
