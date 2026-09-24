export function getAuthErrorMessage(error: string): string {
  switch (error) {
    case "oauth": // Legacy Google error links.
      return "Не удалось войти через Google. Попробуйте еще раз.";
    case "yandex_not_configured":
      return "Вход через Яндекс пока не настроен. Используйте другой способ входа.";
    case "yandex_access_denied":
      return "Вход через Яндекс отменён. Для входа разрешите доступ к данным аккаунта.";
    case "yandex_email_missing":
      return "Яндекс не предоставил адрес электронной почты. Разрешите доступ к почте и попробуйте снова.";
    case "yandex_account_conflict":
      return "Этот email уже связан с другим аккаунтом Яндекса. Используйте прежний способ входа.";
    case "yandex_state_invalid":
      return "Сеанс входа через Яндекс истёк или недействителен. Начните вход заново.";
    default:
      if (error.startsWith("yandex_")) return "Не удалось войти через Яндекс. Попробуйте еще раз.";
      if (error.startsWith("google_")) return "Не удалось войти через Google. Попробуйте еще раз.";
      return "Не удалось войти. Попробуйте еще раз.";
  }
}
