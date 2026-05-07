export async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<boolean> {
  if (!token || !chatId) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML'
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}