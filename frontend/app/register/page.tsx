import { shouldShowGoogleAuth } from "@/lib/server-country";
import RegisterForm from "./RegisterForm";

export default async function RegisterPage() {
  const showGoogleAuth = await shouldShowGoogleAuth();
  return <RegisterForm showGoogleAuth={showGoogleAuth} />;
}
