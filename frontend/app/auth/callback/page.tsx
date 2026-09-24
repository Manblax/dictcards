"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { persistAuthSession } from "@/lib/auth";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const processed = useRef(false);

  useEffect(() => {
    // The fragment is consumed once, including React Strict Mode effect replay.
    if (processed.current) return;
    processed.current = true;
    const provider = searchParams.get("provider") === "yandex" ? "yandex" : "google";
    const credentials = provider === "yandex"
      ? new URLSearchParams(window.location.hash.slice(1))
      : searchParams;
    if (window.location.hash) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    const error = searchParams.get("error");

    if (error) {
      router.replace(`/login?error=${encodeURIComponent(error)}`);
      return;
    }

    const token = credentials.get("access_token");
    const id = credentials.get("id");
    const username = credentials.get("username");
    const email = credentials.get("email");

    if (!token || !id || !username || !email) {
      router.replace(`/login?error=${provider}_auth_invalid_response`);
      return;
    }

    persistAuthSession(token, {
      id,
      username,
      email,
    });

    router.replace("/");
    router.refresh();
  }, [router, searchParams]);

  return <AuthCallbackLoadingState />;
}

function AuthCallbackLoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <span className="loading loading-spinner loading-lg text-primary" />
        <p className="mt-4 text-neutral-content">Выполняем вход…</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<AuthCallbackLoadingState />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
