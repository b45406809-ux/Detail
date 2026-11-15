import { Redirect } from 'expo-router';

// Retire old phone sign-in links; cleaner verification happens in registration.
export default function RetiredPhoneSignIn() {
  return <Redirect href="/(auth)/sign-in" />;
}
