import { auth } from '@/lib/auth';
// import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LoginForm } from './_components/loginForm';
import { headers } from 'next/headers';

const signInPage = async() => {

  const session = await auth.api.getSession({
    headers: await headers()
  });

  if(session){
    return redirect("/");
  }

  return (
    <LoginForm />
  )
}

export default signInPage
