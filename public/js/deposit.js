// deposit.js — TonConnect UI + bottom sheet
(() => {
  const $ = s => document.querySelector(s);

  const sheet = $("#depositSheet");
  const btnOpen = document.querySelector('[data-open-deposit]');
  const btnClose = $("#depClose");
  const btnConnect = $("#btnConnectWallet");
  const btnDeposit = $("#btnDepositNow");
  const inpAmount = $("#depAmount");
  const tonAmountOut = $("#tonAmount");

  // === TonConnect ===
  const manifestUrl = `${location.origin}/tonconnect-manifest.json`;
  const tcui = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl,
    buttonRootId: undefined, // не рендерим встроенную кнопку
    uiPreferences: { theme: "DARK" }
  });

  // делимся TonConnect-экземпляром с другими модулями
  window.__wtTonConnect = tcui;
  window.dispatchEvent(new Event("wt-tc-ready"));

  // sync адреса
  async function applyAccount() {
    const acc = await tcui.getAccount();
    const short = a => a ? `${a.slice(0,4)}…${a.slice(-4)}` : "Not connected";
    document.getElementById("profileWallet")?.replaceChildren(document.createTextNode(short(acc?.address)));
    document.getElementById("walletFull")?.replaceChildren(document.createTextNode(acc?.address || "—"));
  }
  tcui.onStatusChange(applyAccount);
  applyAccount();

  // === Sheet controls ===
  function openSheet() {
    sheet?.classList.add("sheet--open");
    sheet?.setAttribute("aria-hidden", "false");
  }
  function closeSheet() {
    sheet?.classList.remove("sheet--open");
    sheet?.setAttribute("aria-hidden", "true");
  }

  btnOpen?.addEventListener("click", openSheet);
  btnClose?.addEventListener("click", closeSheet);
  sheet?.querySelector(".sheet__backdrop")?.addEventListener("click", closeSheet);

  // === Connect wallet ===
  btnConnect?.addEventListener("click", async () => {
    try {
      await tcui.openModal();
    } catch {}
  });

  // === Validate amount & enable Deposit ===
  function validate() {
    const v = parseFloat((inpAmount?.value || "0").replace(",", "."));
    const ok = !isNaN(v) && v >= 0.5;
    btnDeposit?.toggleAttribute("disabled", !ok);
    return { ok, v };
  }
  inpAmount?.addEventListener("input", validate);
  validate();

  // === Deposit Now ===
  btnDeposit?.addEventListener("click", async () => {
    const { ok, v } = validate();
    if (!ok) return;

    const acc = await tcui.getAccount();
    if (!acc) { await tcui.openModal(); return; }

    // адрес проекта (замени на свой)
    const DEST = "UQCXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"; // TON адрес получателя

    try {
      // 1 TON = 10^9 nanotons
      const nanotons = BigInt(Math.round(v * 1e9)).toString();

      await tcui.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: DEST, amount: nanotons }]
      });

      // обновим UI баланса просто визуально (для настоящего баланса нужен бэкенд-сканер/toncenter)
      const cur = parseFloat(tonAmountOut?.textContent || "0");
      if (!isNaN(cur)) tonAmountOut.textContent = (cur + v).toFixed(2);

      // сообщим бэку
      fetch("/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: v, address: acc.address })
      }).catch(() => {});

      closeSheet();
    } catch (e) {
      console.warn("Deposit canceled or failed:", e);
    }
  });
})();
