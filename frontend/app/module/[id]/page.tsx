import { getModule } from "@/lib/api";
import { getServerAuthToken } from "@/lib/server-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import DeleteModuleButton from "@/components/DeleteModuleButton";
import PronunciationButton from "@/components/PronunciationButton";
import ModuleStudyModes from "@/components/ModuleStudyModes";

interface ModulePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ModulePage({ params }: ModulePageProps) {
  const { id } = await params;
  const token = await getServerAuthToken();

  if (!token) {
    redirect(`/login?redirect=/module/${id}`);
  }

  const module = await getModule(id, { token });

  if (!module) {
    notFound();
  }

  return (
    <div className="page-container px-4 py-6 sm:px-6 sm:py-8">
      <div className="max-w-5xl mx-auto">
        {/* Хедер модуля */}
        <div className="mb-7 sm:mb-8">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="mb-2 break-words text-2xl font-bold text-[var(--app-text-strong)] sm:text-3xl">{module.title}</h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-content">
                <span className="font-bold text-[var(--app-text-strong)]">{module.termCount} терминов</span>
                <span>•</span>
                <div className="flex min-w-0 items-center gap-1">
                  <div className="avatar placeholder w-5 h-5 rounded-full bg-warning text-warning-content flex items-center justify-center text-xs font-bold">
                    {module.author[0].toUpperCase()}
                  </div>
                  <span className="min-w-0 break-words font-medium hover:underline cursor-pointer">{module.author}</span>
                </div>
              </div>
            </div>
            
            {/* Кнопки действий */}
            <div className="flex shrink-0 gap-2 self-end sm:self-auto">
              <button className="btn btn-square btn-ghost text-neutral-content" title="Поделиться">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
              <Link href={`/module/${module.id}/edit`} className="btn btn-square btn-ghost text-neutral-content" title="Редактировать">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </Link>
              <DeleteModuleButton moduleId={module.id} />
            </div>
          </div>
          
          {/* Описание (если есть) */}
          {module.description && (
            <p className="text-neutral-content mb-6 break-words">{module.description}</p>
          )}

          {/* Кнопки режимов обучения */}
          <ModuleStudyModes moduleId={module.id} />
        </div>

        {/* Заголовок списка */}
        <h2 className="mb-4 text-lg font-bold text-[var(--app-text-strong)] sm:text-xl">Термины в этом модуле ({module.terms?.length || 0})</h2>

        {/* Список карточек */}
        <div className="space-y-3">
          {module.terms?.map((term) => (
            <div key={term.id} className="card bg-base-200 hover:bg-base-300 transition-colors rounded-xl border border-transparent hover:border-neutral/20">
              <div className="module-term-body card-body flex flex-col items-start gap-4 p-4 sm:flex-row sm:items-center sm:gap-8 sm:p-5">
                
                {/* Термин (Левая колонка) */}
                <div className="order-2 w-full min-w-0 flex-1 border-b border-neutral/20 pb-3 sm:order-none sm:w-auto sm:border-b-0 sm:border-r sm:pb-0 sm:pr-8">
                  <span className="text-base sm:text-lg font-medium text-[var(--app-text-strong)] block break-words">{term.term}</span>
                </div>

                {/* Определение (Центральная колонка) */}
                <div className="order-3 w-full min-w-0 flex-[2] sm:order-none sm:w-auto">
                   <span className="text-base text-neutral-content block break-words">{term.definition}</span>
                </div>

                {/* Действия (Правая колонка) */}
                <div className="order-1 flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1 self-end sm:order-none sm:ml-auto sm:max-w-[45%] sm:self-auto">
                   <button className={`btn btn-ghost btn-sm btn-circle ${term.isFavorite ? 'text-warning' : 'text-neutral-content hover:text-warning'}`}>
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill={term.isFavorite ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                     </svg>
                   </button>
                   <PronunciationButton term={term.term} showTranscription />
                   <button className="btn btn-ghost btn-sm btn-circle text-neutral-content hover:text-[var(--app-text-strong)]">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                   </button>
                </div>

              </div>
            </div>
          ))}

          {/* Кнопка добавить термин (внизу, опционально, как в Quizlet) */}
          <div className="py-6 text-center">
             <Link href={`/module/${module.id}/edit`} className="btn btn-lg w-full min-w-0 border-none bg-base-200 font-bold text-[var(--app-text-strong)] hover:bg-base-300 sm:w-auto sm:min-w-[250px]">
                Добавить или удалить термины
             </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
