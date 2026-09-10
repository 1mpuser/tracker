// Скрытый ввод пароля без эха (raw-mode). Импортируется скриптами set-owner и
// reset-password; дублировать его в двух местах не стоит.
export async function promptPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\n' || ch === '\r') {
          finish();
          return;
        }
        if (ch === '\u0003') process.exit(130);
        if (ch === '\u007f') {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
      }
    };
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      resolve(value);
    };
    stdin.on('data', onData);
  });
}
