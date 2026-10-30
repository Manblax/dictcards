import { shouldShowGoogleAuth } from "@/lib/server-country";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const showGoogleAuth = await shouldShowGoogleAuth();
  return <LoginForm showGoogleAuth={showGoogleAuth} socialAuthEnabled={process.env.SOCIAL_AUTH_ENABLED !== "false"} />;
}
