import { Module } from "@/types/module";
import Link from "next/link";

interface ModuleCardProps {
  module: Module;
}

const ModuleCard = ({ module }: ModuleCardProps) => {
  return (
    <Link href={`/module/${module.id}`} className="min-w-0">
      <div className="module-list-card card bg-base-300/50 hover:bg-base-300 transition-all cursor-pointer border border-neutral/10 hover:border-primary/30 rounded-2xl overflow-hidden">
        <div className="card-body flex flex-row items-center gap-3 p-4 sm:gap-4 sm:p-6">
          {/* Иконка модуля */}
          <div className="flex-shrink-0">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20 sm:h-14 sm:w-14">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-6 w-6 text-primary sm:h-7 sm:w-7"
              >
                <path d="M9 3v18m6-18v18M3 9h18M3 15h18" />
              </svg>
            </div>
          </div>

          {/* Контент */}
          <div className="flex-1 min-w-0">
            {/* Заголовок */}
            <h3 className="mb-1 break-words text-base font-bold text-[var(--app-text-strong)] sm:text-lg">
              {module.title}
            </h3>

            {/* Метаинформация */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-content sm:text-sm">
              <span>
                {module.termCount} {getTermWord(module.termCount)}
              </span>
              <span>•</span>
              <div className="flex min-w-0 items-center gap-1">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning text-xs font-bold text-warning-content">
                  {module.author.charAt(0).toUpperCase()}
                </div>
                <span className="min-w-0 break-words">Автор: {module.author}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
};

// Функция для правильного склонения слова "термин"
const getTermWord = (count: number): string => {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return "терминов";
  }

  if (lastDigit === 1) {
    return "термин";
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return "термина";
  }

  return "терминов";
};

export default ModuleCard;
