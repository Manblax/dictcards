"use client";

import Link from "next/link";
import UserMenu from "./UserMenu";
import BrandLogo from "@/components/BrandLogo";

interface HeaderProps {
  isAuthenticated: boolean;
}

const Header = ({ isAuthenticated }: HeaderProps) => {
  return (
    <header className="app-header bg-base-100 border-b border-neutral/30 sticky top-0 z-30">
      <div className="page-container flex h-[calc(var(--app-header-height)-1px)] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 md:flex-nowrap md:gap-4">
        {isAuthenticated ? (
          <>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3 xl:hidden">
              <label
                htmlFor="app-sidebar"
                className="btn btn-ghost btn-square h-11 min-h-11 w-11"
                aria-label="Открыть меню"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </label>

              <Link
                href="/"
                className="flex items-center text-xl font-bold text-[var(--app-text-strong)]"
                aria-label="Главная"
              >
                <BrandLogo />
              </Link>
            </div>

            <div className="relative order-last min-w-0 w-full basis-full md:order-none md:max-w-md md:flex-1 md:basis-auto">
              <input
                type="text"
                placeholder="Поиск"
                className="input h-11 min-h-11 w-full text-base bg-base-200 pl-10"
              />
              <svg
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-content"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </>
        ) : (
          <Link href="/" className="flex items-center gap-3 text-[var(--app-text-strong)]">
            <BrandLogo />
          </Link>
        )}

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {isAuthenticated && (
            <Link
              href="/create"
              className="btn btn-primary btn-circle h-11 min-h-11 w-11"
              title="Создать модуль"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </Link>
          )}

          <UserMenu />
        </div>
      </div>
    </header>
  );
};

export default Header;
