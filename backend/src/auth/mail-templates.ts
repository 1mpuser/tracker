export interface MailMessage {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Три шаблона писем. Все подстановки — через escapeHtml: Web-почтовики
// показывают HTML, и любой ввод юзера (например, адрес в тексте письма
// «кто-то пытался зарегистрироваться») куда попадает без экранирования.
export function signupConfirmMail(link: string, code: string): MailMessage {
  const html = `
    <p>Подтвердите регистрацию в трекере:</p>
    <p><a href="${escapeHtml(link)}">подтвердить</a></p>
    <p>или введите код: <b>${escapeHtml(code)}</b></p>
    <p>Ссылка и код действуют 24 часа. Если вы не регистрировались — проигнорируйте письмо.</p>
  `;
  return {
    subject: 'Подтвердите регистрацию в трекере',
    html,
    text: `Подтвердите регистрацию в трекере: ${link}\nИли введите код: ${code}\nСсылка и код действуют 24 часа. Если вы не регистрировались — проигнорируйте письмо.`,
  };
}

export function alreadyRegisteredMail(loginUrl: string, forgotUrl: string): MailMessage {
  return {
    subject: 'Попытка регистрации вашего адреса',
    html: `
      <p>Кто-то пытался зарегистрироваться в трекере на ваш адрес.</p>
      <p>Если это вы — <a href="${escapeHtml(loginUrl)}">войдите</a> или
        <a href="${escapeHtml(forgotUrl)}">восстановите пароль</a>.</p>
      <p>Если нет — просто проигнорируйте письмо.</p>
    `,
    text: `Кто-то пытался зарегистрироваться в трекере на ваш адрес.\nЕсли это вы — войдите (${loginUrl}) или восстановите пароль (${forgotUrl}).\nЕсли нет — просто проигнорируйте письмо.`,
  };
}

export function passwordResetMail(link: string): MailMessage {
  return {
    subject: 'Сброс пароля в трекере',
    html: `
      <p>Вы просили сбросить пароль в трекере:</p>
      <p><a href="${escapeHtml(link)}">установить новый пароль</a></p>
      <p>Ссылка действует 30 минут. Если это были не вы — проигнорируйте письмо.</p>
    `,
    text: `Вы просили сбросить пароль в трекере: ${link}\nСсылка действует 30 минут. Если это были не вы — проигнорируйте письмо.`,
  };
}

export function formatFrom(mailFrom: string): string {
  return mailFrom;
}
