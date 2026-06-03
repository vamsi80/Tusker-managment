import { SignUpForm } from './_components/signUpForm';
import { Suspense } from 'react';
import { AppLoader } from '@/components/shared/app-loader';

/**
 * Sign-up page renders immediately without calling the backend.
 * Client-side session check is handled inside SignUpForm via authClient.useSession().
 * This prevents the page from hanging when the backend is unavailable.
 */
const signUpPage = async () => {
  return (
    <Suspense fallback={<AppLoader />}>
      <SignUpForm />
    </Suspense>
  );
}

export default signUpPage;
