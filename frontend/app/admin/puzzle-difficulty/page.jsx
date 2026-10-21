'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '../../../store/auth/auth-store';
import PuzzleDifficultyDashboard from '../../../components/admin/puzzle-difficulty/PuzzleDifficultyDashboard';
import AdminLayout from '../../../components/admin/AdminLayout';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

export default function AdminPuzzleDifficultyPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const isAdmin = user?.role === 'admin' || user?.roles?.includes('admin');
    if (!isAuthenticated || !isAdmin) {
      router.push('/login');
    } else {
      setAuthorized(true);
    }
  }, [isAuthenticated, user, router]);

  if (!authorized) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Suspense fallback={<LoadingSpinner />}>
            <PuzzleDifficultyDashboard />
          </Suspense>
        </div>
      </div>
    </AdminLayout>
  );
}
