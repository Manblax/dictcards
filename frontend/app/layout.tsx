import type { Metadata } from "next";
import "./globals.css";
import MainLayout from "@/components/layout/MainLayout";
import AuthSessionSync from "@/components/AuthSessionSync";
import ThemeSync from "@/components/ThemeSync";
import { getServerAuthToken } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "dictcards",
  description: "Приложение для изучения с флэш-карточками",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const token = await getServerAuthToken();

  return (
    <html lang="ru" data-theme="dark-classic">
      <body>
        <ThemeSync />
        <AuthSessionSync />
        <MainLayout isAuthenticated={Boolean(token)}>{children}</MainLayout>
      </body>
    </html>
  );
}
