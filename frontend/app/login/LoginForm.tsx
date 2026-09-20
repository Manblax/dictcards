"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthInput from "@/components/AuthInput";
import { login, getGoogleAuthUrl } from "@/lib/api";
import { getStoredUser, persistAuthSession } from "@/lib/auth";
import { resolveSafeRedirect } from "@/lib/navigation";

function LoginPageContent({ showGoogleAuth }: { showGoogleAuth: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = resolveSafeRedirect(searchParams.get("redirect"));
  const registerHref =
    redirectTo === "/"
      ? "/register"
      : `/register?redirect=${encodeURIComponent(redirectTo)}`;
  const [formData, setFormData] = useState({
    username: "", // Может быть email или username
    password: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const authError = searchParams.get("error");

  useEffect(() => {
    if (getStoredUser()) {
      router.replace("/");
    }
  }, [router]);

  const handleFieldChange = (field: "username" | "password", value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));

    if (loginError) {
      setLoginError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoading(true);

    try {
      const data = await login(formData);
      persistAuthSession(data.access_token, data.user);

      router.replace(redirectTo);
      router.refresh();
    } catch (error: any) {
      const message =
        error?.message === "Invalid credentials"
          ? "Неверный email, имя пользователя или пароль. Проверьте данные и попробуйте снова."
          : "Не удалось войти. Попробуйте еще раз.";

      setLoginError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const hasLoginError = Boolean(loginError);
  const errorInputClassName = hasLoginError
    ? "border-error/70 bg-error/10 focus:border-error text-[var(--app-text-strong)]"
    : "";

  return <LoginPageLayout authError={authError} registerHref={registerHref} form={(
    <form onSubmit={handleSubmit} className="space-y-4">
      <AuthInput
        id="login-username"
        label="Эл. почта или имя пользователя"
        type="text"
        placeholder="user@email.com"
        value={formData.username}
        onChange={(e) => handleFieldChange("username", e.target.value)}
        className={errorInputClassName}
        aria-invalid={hasLoginError}
        autoComplete="username"
        required
      />

      <div className="relative">
        <AuthInput
          id="login-password"
          label="Пароль"
          type={showPassword ? "text" : "password"}
          placeholder="••••••••"
          value={formData.password}
          onChange={(e) => handleFieldChange("password", e.target.value)}
          className={errorInputClassName}
          aria-invalid={hasLoginError}
          autoComplete="current-password"
          required
        />
        <button
          type="button"
          className="password-toggle absolute right-4 top-[38px] text-neutral-content hover:text-[var(--app-text-strong)]"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
        >
          {showPassword ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
              <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
            </svg>
          )}
        </button>
      </div>

      {loginError && (
        <p className="text-sm text-error font-medium -mt-1" role="alert">
          {loginError}
        </p>
      )}

      <button
        type="submit"
        className="btn btn-primary w-full rounded-xl mt-2 font-bold text-primary-content"
        disabled={isLoading}
      >
        {isLoading ? <span className="loading loading-spinner"></span> : "Войти"}
      </button>

      {showGoogleAuth && <a
        href={getGoogleAuthUrl()}
        className="btn w-full rounded-xl bg-white text-black hover:bg-neutral-100 border border-neutral-300 font-bold"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 mr-2" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.31h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.86c2.26-2.08 3.58-5.15 3.58-8.65Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.86-3c-1.07.72-2.43 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.28v3.09A12 12 0 0 0 12 24Z"
          />
          <path
            fill="#FBBC05"
            d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76l3.99-3.09Z"
          />
          <path
            fill="#EA4335"
            d="M12 4.76c1.77 0 3.35.61 4.59 1.8l3.44-3.44C17.94 1.14 15.24 0 12 0A12 12 0 0 0 1.28 6.62l3.99 3.09c.95-2.84 3.6-4.95 6.73-4.95Z"
          />
        </svg>
        Войти через Google
      </a>}
    </form>
  )} />;
}

function LoginPageLayout({
  authError,
  form,
  registerHref = "/register",
}: {
  authError?: string | null;
  form: React.ReactNode;
  registerHref?: string;
}) {
  return (
    <div className="auth-page flex min-h-[calc(100dvh-var(--app-header-height))] items-center justify-center px-4 py-8 sm:py-10">
      <div className="max-w-md w-full">
        <h1 className="mb-3 text-2xl font-bold text-[var(--app-text-strong)] sm:text-3xl">Вход</h1>
        <p className="mb-8 text-neutral-content">
          Войдите, чтобы открыть библиотеку и продолжить работу с модулями.
        </p>

        {form}

        {authError && (
          <p className="mt-4 text-sm text-error">
            Не удалось войти через Google. Попробуйте еще раз.
          </p>
        )}

        <p className="text-center mt-6 text-neutral-content">
          Нет аккаунта?{" "}
          <Link href={registerHref} className="text-primary hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  );
}

function LoginPageFallback() {
  return <LoginPageLayout form={<div className="loading loading-spinner text-primary" />} />;
}

export default function LoginForm({ showGoogleAuth }: { showGoogleAuth: boolean }) {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent showGoogleAuth={showGoogleAuth} />
    </Suspense>
  );
}
