import { redirect } from 'next/navigation';

// Sign-up is the same Google button as sign-in: the first Google sign-in
// creates the account. Kept as a redirect so existing links to /signup work.
export default function SignupPage() {
  redirect('/login');
}
