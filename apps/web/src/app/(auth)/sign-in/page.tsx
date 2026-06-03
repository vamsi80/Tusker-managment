import { LoginForm } from './_components/loginForm';
import { Suspense } from 'react';
import { AppLoader } from '@/components/shared/app-loader';

/**
 * Sign-in page renders immediately without calling the backend.
 * Client-side session check is handled inside LoginForm via authClient.useSession().
 * This prevents the page from hanging when the backend is unavailable.
 */
const signInPage = async () => {
  return (
    <Suspense fallback={<AppLoader />}>
      <LoginForm />
    </Suspense>
  );
}

export default signInPage;
