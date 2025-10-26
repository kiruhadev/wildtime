// deposit.js — TonConnect UI + депозитный «bottom sheet»
(() => {
  "use strict";
  const { $, url } = window.__wtUtil || { $: (s)=>document.querySelector(s), url:(p)=>new URL(p, location.href).toString() };

  // элементы
  const sheet      = $("#depositSheet");
  const btnOpen    = document.querySelector('[data-open-deposit]');
  const btnClose   = $("#depClose");
  const btnConnect = $("#btnConnectWallet");
  const btnDeposit = $("#btnDepositNow");
  const inpAmount  = $("#depAmount");
  const tonAmountOut = $("#tonAmount");

  // --- TonConnect UI ---
  const manifestUrl = url("tonconnect-manifest.json");
  const tcui = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl,
    buttonRootId: undefined,
    uiPreferences: { theme: "DARK" }
  });

  // делимся инстансом с другими скриптами
  window.__wtTonConnect = tcui;
  window.dispatchEvent(new Event("wt-tc-ready"));

  // синхронизация адреса для профиля
  async function applyAccount() {
    const acc = await tcui.getAccount().catch(() => null);
    const short = (a) => a ? `${a.slice(0,4)}…${a.slice(-4)}` : "Not connected";
    $("#profileWallet")?.replaceChildren(document.createTextNode(short(acc?.address)));
    $("#walletFull")?.replaceChildren(document.createTextNode(acc?.address || "—"));
  }
  tcui.onStatusChange(applyAccount);
  applyAccount();

  // --- sheet controls ---
  const openSheet  = () => { sheet?.classList.add("sheet--open");  sheet?.setAttribute("aria-hidden","false"); };
  const closeSheet = () => { sheet?.classList.remove("sheet--open"); sheet?.setAttribute("aria-hidden","true"); };

  btnOpen?.addEventListener("click", openSheet);
  btnClose?.addEventListener("click", closeSheet);
  sheet?.querySelector(".sheet__backdrop")?.addEventListener("click", closeSheet);

  // connect wallet
  btnConnect?.addEventListener("click", async () => {
    try { await tcui.openModal(); } catch {}
  });

  // валидация суммы
  function validate(){
    const v = parseFloat((inpAmount?.value || "0").replace(",", "."));
    const ok = !isNaN(v) && v >= 0.5;
    btnDeposit?.toggleAttribute("disabled", !ok);
    return { ok, v };
  }
  inpAmount?.addEventListener("input", validate);
  validate();

  // депозит
  btnDeposit?.addEventListener("click", async () => {
    const { ok, v } = validate();
    if (!ok) return;

    const acc = await tcui.getAccount();
    if (!acc) { try { await tcui.openModal(); } catch {} return; }

    // TODO: поставь свой реальный TON-адрес проекта
    const DEST = "UQCtVhhBFPBvCoT8H7szNQUhEvHgbvnX50r8v6d8y5wdr19J";

    try {
      const nanotons = BigInt(Math.round(v * 1e9)).toString();
      await tcui.sendTransaction({
        validUntil: Math.floor(Date.now()/1000) + 300,
        messages: [{ address: DEST, amount: nanotons }]
      });

      // локальное (визуальное) увеличение «баланса»
      const cur = parseFloat(tonAmountOut?.textContent || "0");
      if (!isNaN(cur)) tonAmountOut.textContent = (cur + v).toFixed(2);

      // уведомим бэк (не блокируем UX)
      fetch(url("deposit"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: v, address: acc.address })
      }).catch(() => {});

      closeSheet();
    } catch (e) {
      console.warn("Deposit canceled/failed:", e);
    }
  });
})();
