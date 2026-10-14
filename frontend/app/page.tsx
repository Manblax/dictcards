import ModuleCard from "@/components/ModuleCard";
import BrandLogo from "@/components/BrandLogo";
import { getModules } from "@/lib/api";
import { getServerAuthToken } from "@/lib/server-auth";
import { Module } from "@/types/module";
import Link from "next/link";

export default async function Home() {
  let recentModules: Module[] = [];
  const token = await getServerAuthToken();
  
  if (token) {
    try {
    recentModules = await getModules(0, 6, { token });
    } catch (error) {
      console.error("Failed to fetch modules:", error);
    }
  }

  if (!token) {
    return <GuestHome />;
  }

  return (
    <div className="page-container max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <section>
        <h2 className="mb-5 text-xl font-bold text-[var(--app-text-strong)] sm:mb-6 sm:text-2xl">Недавние</h2>
        {recentModules.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recentModules.map((module) => (
              <ModuleCard key={module.id} module={module} />
            ))}
          </div>
        ) : (
          <div className="text-neutral-content">
            Нет недавних модулей. Создайте первый!
          </div>
        )}
      </section>
    </div>
  );
}

function GuestHome() {
  return (
    <div className="min-h-[calc(100dvh-var(--app-header-height))] px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(22rem,1fr)]">
        <section className="max-w-xl">
          <div className="mb-7 flex items-center gap-3">
            <BrandLogo size={64} />
          </div>

          <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-normal text-[var(--app-text-strong)] sm:text-5xl">
            Учите слова по своим модулям
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-neutral-content">
            Собирайте термины, слушайте произношение и возвращайтесь к повторению без лишней навигации.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:mt-9 sm:flex-row">
            <Link href="/register" className="btn btn-primary min-h-12 rounded-xl px-7 text-base font-bold text-primary-content">
              Зарегистрироваться
            </Link>
            <Link href="/login" className="btn min-h-12 rounded-xl border border-[var(--app-border)] bg-transparent px-7 text-base font-bold text-[var(--app-text-strong)] hover:border-[var(--app-focus)] hover:bg-[var(--app-panel)]">
              Войти
            </Link>
          </div>
        </section>

        <section
          aria-label="Пример учебного модуля"
          className="overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)]"
        >
          <div className="border-b border-[var(--app-border)] px-6 py-5">
            <div className="text-sm font-semibold uppercase tracking-normal text-accent">
              Сегодня
            </div>
            <h2 className="mt-2 text-2xl font-bold text-[var(--app-text-strong)]">
              English: phrasal verbs
            </h2>
            <p className="mt-1 text-sm text-neutral-content">24 термина</p>
          </div>

          <div className="divide-y divide-[var(--app-border)]">
            <PreviewTerm term="look up" definition="искать информацию" />
            <PreviewTerm term="carry on" definition="продолжать" />
            <PreviewTerm term="figure out" definition="понять, разобраться" />
          </div>

          <div className="grid grid-cols-3 gap-px bg-[var(--app-border)] text-center">
            <PreviewStat value="18" label="выучено" />
            <PreviewStat value="6" label="повторить" />
            <PreviewStat value="4m" label="сессия" />
          </div>
        </section>
      </div>
    </div>
  );
}

function PreviewTerm({
  term,
  definition,
}: {
  term: string;
  definition: string;
}) {
  return (
    <div className="grid gap-2 px-6 py-5 sm:grid-cols-[10rem_1fr]">
      <div className="font-semibold text-[var(--app-text-strong)]">{term}</div>
      <div className="text-neutral-content">{definition}</div>
    </div>
  );
}

function PreviewStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-[var(--app-panel)] px-4 py-5">
      <div className="text-xl font-bold text-[var(--app-text-strong)]">{value}</div>
      <div className="mt-1 text-sm text-neutral-content">{label}</div>
    </div>
  );
}
