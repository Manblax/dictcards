import InfiniteModuleList from "@/components/InfiniteModuleList";
import { getModules } from "@/lib/api";
import { getServerAuthToken } from "@/lib/server-auth";
import type { Module } from "@/types/module";
import { redirect } from "next/navigation";

interface SearchPageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? "";
  const token = await getServerAuthToken();

  if (!token) {
    const destination = `/search?${new URLSearchParams({ q: query })}`;
    redirect(`/login?redirect=${encodeURIComponent(destination)}`);
  }

  let modules: Module[] = [];
  let failed = false;
  if (query) {
    try {
      modules = await getModules(0, 20, { token, query });
    } catch (error) {
      console.error("Failed to search modules:", error);
      failed = true;
    }
  }

  return (
    <div className="page-container max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <section aria-labelledby="search-results-title">
        <h1 id="search-results-title" className="mb-5 break-words text-xl font-bold text-[var(--app-text-strong)] sm:mb-6 sm:text-2xl">
          {query ? `Результаты поиска: «${query}»` : "Поиск модулей"}
        </h1>
        {failed ? (
          <p role="alert" className="text-error">Не удалось загрузить модули. Попробуйте ещё раз.</p>
        ) : !query ? (
          <p className="text-neutral-content">Введите название модуля в поле поиска.</p>
        ) : modules.length === 0 ? (
          <p role="status" className="text-neutral-content">Модули не найдены. Попробуйте другое название.</p>
        ) : (
          <InfiniteModuleList key={query} initialModules={modules} query={query} />
        )}
      </section>
    </div>
  );
}
