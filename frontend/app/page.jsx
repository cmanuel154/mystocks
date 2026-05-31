'use client';
// output: 'export' requires client-side navigation here — server redirect()
// is not available in a static export build.
export const dynamic = 'force-static';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard'); }, [router]);
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0026CC] border-t-transparent" />
    </div>
  );
}
