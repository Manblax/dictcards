import { getYandexAuthUrl } from "@/lib/api";

export default function YandexAuthButton({ registration = false }: { registration?: boolean }) {
  return (
    <a
      href={getYandexAuthUrl()}
      className="btn w-full rounded-xl bg-white text-black hover:bg-neutral-100 border border-neutral-300 font-bold"
    >
      <span className="text-red-600 text-xl leading-none mr-2" aria-hidden="true">Я</span>
      {registration ? "Продолжить через Яндекс" : "Войти через Яндекс"}
    </a>
  );
}
