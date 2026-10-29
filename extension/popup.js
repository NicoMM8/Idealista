document.addEventListener("DOMContentLoaded", async () => {
  const countEl = document.getElementById("pop-count");
  const portalBadge = document.getElementById("badge-portal");
  const urlInput = document.getElementById("pop-input-url");
  const syncBtn = document.getElementById("pop-btn-sync");
  const openBtn = document.getElementById("pop-btn-open-umbral");
  const statusMsg = document.getElementById("pop-status");

  // Load saved backend URL
  const savedUrl = localStorage.getItem("umbral_bridge_backend_url") || "http://localhost:8050";
  urlInput.value = savedUrl;

  urlInput.addEventListener("change", () => {
    localStorage.setItem("umbral_bridge_backend_url", urlInput.value.trim());
  });

  // Query active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: "getStatus" }, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        portalBadge.textContent = "INACTIVO EN ESTA PESTAÑA";
        portalBadge.style.background = "#9E2A2B";
        portalBadge.style.color = "#fff";
        countEl.textContent = "0";
        return;
      }
      portalBadge.textContent = (resp.portal || "PORTAL").toUpperCase();
      countEl.textContent = resp.count || 0;
      if (resp.backendUrl) urlInput.value = resp.backendUrl;
    });
  }

  syncBtn.addEventListener("click", () => {
    if (!tab || !tab.id) return;
    syncBtn.disabled = true;
    syncBtn.textContent = "ENVIANDO...";

    chrome.tabs.sendMessage(tab.id, { action: "syncNow" }, (resp) => {
      syncBtn.disabled = false;
      syncBtn.textContent = "SINCRONIZAR ⚡";

      if (resp && resp.ok) {
        statusMsg.style.display = "block";
        statusMsg.style.background = "#E6EFEA";
        statusMsg.style.color = "#264636";
        statusMsg.innerHTML = `✓ ¡${resp.count} pisos sincronizados correctamente!`;
        countEl.textContent = resp.count;
      } else {
        statusMsg.style.display = "block";
        statusMsg.style.background = "#FBEBEB";
        statusMsg.style.color = "#9E2A2B";
        statusMsg.textContent = "✕ Error al sincronizar. Revisa la URL.";
      }
    });
  });

  openBtn.addEventListener("click", () => {
    const dest = urlInput.value.trim() || "http://localhost:8050";
    chrome.tabs.create({ url: dest });
  });
});

