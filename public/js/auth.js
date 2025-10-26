// auth.js — пример валидации (если нужно дергать с фронта)
export async function validateTelegram(initData) {
  try {
    const res = await fetch("/auth/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData })
    }).then(r => r.json());
    return !!res?.ok;
  } catch {
    return false;
  }
}
