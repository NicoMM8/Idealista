// ==UserScript==
// @name         UMBRAL Bridge · Conector Idealista & Multi-Portal
// @namespace    https://github.com/NicoMM8/Idealista
// @version      2.0.0
// @description  Captura viviendas en Idealista, Yaencontre e Indomio mientras navegas y las envía a tu observatorio UMBRAL para filtrarlas y verlas en el mapa.
// @author       UMBRAL
// @match        *://*.idealista.com/*
// @match        *://*.yaencontre.com/*
// @match        *://*.indomio.es/*
// @match        *://*.tucasa.com/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      127.0.0.1
// @connect      *
// ==/UserScript==

(function () {
  'use strict';
  if (window.__UMBRAL_BRIDGE_INITIALIZED__) return;
  window.__UMBRAL_BRIDGE_INITIALIZED__ = true;

  const STORAGE_KEY_URL = "umbral_bridge_backend_url";
  const STORAGE_KEY_AUTOSYNC = "umbral_bridge_autosync";

  let defaultBackend = localStorage.getItem(STORAGE_KEY_URL) || "http://localhost:8050";
  let autoSync = localStorage.getItem(STORAGE_KEY_AUTOSYNC) === "true";

  const capturedListings = new Map();
  let lastCountScanned = 0;
  let syncDebounceTimer = null;
  let shadowRoot = null;

  function detectCity() {
    const title = document.title || "";
    const h1 = document.querySelector("h1")?.innerText || "";
    const breadcrumb = document.querySelector(".breadcrumb-navigation, [class*='breadcrumb']")?.innerText || "";
    const combined = `${h1} ${breadcrumb} ${title}`;

    const CITIES = [
      "Valencia", "Madrid", "Barcelona", "Alicante", "Sevilla", "Málaga",
      "Murcia", "Zaragoza", "Granada", "Valladolid", "Córdoba", "Gijón",
      "Vigo", "A Coruña", "Castellón", "Almería", "Bilbao", "Santander",
      "Toledo", "Tarragona", "Lleida", "Girona", "Badajoz", "Cáceres"
    ];

    for (const c of CITIES) {
      if (new RegExp(`\\b${c}\\b`, "i").test(combined)) {
        return c;
      }
    }
    return "Valencia";
  }

  function parseIdealistaCards() {
    const city = detectCity();
    const articles = document.querySelectorAll("article.item, article[data-adid]");
    if (articles.length === 0) return;

    articles.forEach((art) => {
      const adId = art.getAttribute("data-adid") || art.getAttribute("id") || "";
      if (!adId || adId === "0" || adId.includes("banner")) return;

      const linkEl = art.querySelector("a.item-link");
      if (!linkEl) return;

      const title = linkEl.getAttribute("title") || linkEl.innerText.trim();
      const href = linkEl.href;

      const priceEl = art.querySelector(".price-row .item-price, .item-price");
      if (!priceEl) return;
      const priceNum = parseInt(priceEl.innerText.replace(/[^\d]/g, ""), 10) || 0;
      if (priceNum <= 0) return;

      const detailEls = art.querySelectorAll(".item-detail, .item-detail-char span");
      let sqm = 65;
      let rooms = 2;
      let floor = null;
      let hasElevator = null;

      detailEls.forEach((el) => {
        const text = el.innerText.toLowerCase().trim();
        if (text.includes("hab")) {
          const m = text.match(/(\d+)/);
          if (m) rooms = parseInt(m[1], 10);
        } else if (text.includes("m²") || text.includes("m2")) {
          const m = text.match(/(\d+)/);
          if (m) sqm = parseInt(m[1], 10);
        } else if (text.includes("bajo") || text.includes("entresuelo")) {
          floor = 0;
        } else if (text.includes("planta") || text.includes("º") || text.includes("ª")) {
          const m = text.match(/(\d+)/);
          if (m) floor = parseInt(m[1], 10);
        }
        if (text.includes("con ascensor")) hasElevator = true;
        if (text.includes("sin ascensor")) hasElevator = false;
      });

      const images = [];
      const imgEls = art.querySelectorAll(".item-multimedia img, picture img");
      imgEls.forEach((img) => {
        const src = img.src || img.getAttribute("data-ondemand-img") || img.getAttribute("data-src");
        if (src && !src.includes("data:image") && !src.includes("placeholder")) {
          images.push(src);
        }
      });

      const descEl = art.querySelector(".item-description, p.ellipsis");
      const desc = descEl ? descEl.innerText.trim() : "";

      const fullId = `id-${adId}`;
      if (!capturedListings.has(fullId)) {
        capturedListings.set(fullId, {
          id: fullId,
          portal_id: "idealista",
          title: title,
          price: priceNum,
          sqm: sqm,
          rooms: rooms,
          floor: floor,
          has_elevator: hasElevator,
          url: href,
          images: images.length ? images : ["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80"],
          description: desc,
          city: city,
          neighborhood: title,
        });
      }
    });
  }

  function scanCurrentPage() {
    parseIdealistaCards();
    updateHUD();

    if (autoSync && capturedListings.size > lastCountScanned) {
      lastCountScanned = capturedListings.size;
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(sendListingsToUmbral, 1800);
    }
  }

  function sendListingsToUmbral() {
    if (capturedListings.size === 0) return;
    if (!shadowRoot) return;

    const btn = shadowRoot.getElementById("umbral-hud-sync-btn");
    const msg = shadowRoot.getElementById("umbral-hud-msg");
    const urlInput = shadowRoot.getElementById("umbral-hud-backend-url");
    const targetUrl = (urlInput ? urlInput.value.trim() : defaultBackend) || "http://localhost:8050";

    if (btn) {
      btn.textContent = "⚡ ENVIANDO AL OBSERVATORIO...";
      btn.disabled = true;
    }

    const payload = {
      listings: Array.from(capturedListings.values()),
    };

    fetch(`${targetUrl.replace(/\/$/, "")}/api/bridge/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((data) => {
        if (msg) {
          msg.style.display = "block";
          msg.style.background = "#E6EFEA";
          msg.style.color = "#264636";
          msg.innerHTML = `✓ <strong>${data.imported} pisos importados</strong> (${data.approved} aptos / ${data.rejected} filtrados). <br><a href="${targetUrl}" target="_blank" style="color:#264636;font-weight:700;text-decoration:underline;">Abrir Umbral ↗</a>`;
        }
        if (btn) btn.textContent = "✓ SINCRONIZADO CON ÉXITO";
      })
      .catch((err) => {
        if (msg) {
          msg.style.display = "block";
          msg.style.background = "#FBEBEB";
          msg.style.color = "#9E2A2B";
          msg.innerHTML = `✕ Error conectando con ${targetUrl}. Verifica que esté encendido.`;
        }
        if (btn) btn.textContent = "✕ REINTENTAR SINCRONIZACIÓN";
      })
      .finally(() => {
        if (btn) btn.disabled = false;
      });
  }

  function injectIsolatedHUD() {
    if (document.getElementById("umbral-bridge-host")) return;
    if (!document.body) return;

    const host = document.createElement("div");
    host.id = "umbral-bridge-host";
    host.style.all = "initial";
    shadowRoot = host.attachShadow({ mode: "open" });

    const styles = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      #umbral-bridge-hud {
        position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; width: 310px;
        background: #F3EFE6; border: 2px solid #181614; box-shadow: 6px 6px 0px #181614;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; color: #181614; line-height: 1.35;
      }
      .umbral-hud-header { background: #181614; color: #F3EFE6; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; text-transform: uppercase; cursor: pointer; }
      .dot { display: inline-block; width: 8px; height: 8px; background: #C2E24E; border-radius: 50%; margin-right: 6px; box-shadow: 0 0 6px #C2E24E; }
      .umbral-hud-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 9px; }
      .umbral-hud-counter-row { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid rgba(24,22,20,0.2); padding-bottom: 6px; }
      .umbral-hud-counter { font-size: 22px; font-weight: 800; color: #B84A32; font-family: Georgia, serif; }
      .umbral-hud-action-btn { background: #B84A32; color: #fff; border: 1.5px solid #181614; padding: 9px 12px; font-size: 11.5px; font-weight: 700; text-transform: uppercase; cursor: pointer; box-shadow: 2px 2px 0 #181614; width: 100%; }
      .umbral-hud-action-btn:hover { background: #181614; }
      .umbral-hud-options { display: flex; flex-direction: column; gap: 5px; font-size: 11px; }
      .umbral-hud-url-input { background: #fff; border: 1px solid #181614; padding: 4px 6px; font-size: 10.5px; font-family: monospace; width: 100%; }
      .umbral-hud-status-msg { font-size: 10.5px; padding: 6px 8px; border-left: 3px solid #264636; display: none; }
    `;

    shadowRoot.innerHTML = `
      <style>${styles}</style>
      <div id="umbral-bridge-hud">
        <div class="umbral-hud-header" id="umbral-hud-header">
          <span><span class="dot"></span>UMBRAL BRIDGE</span>
          <span style="font-size:10px;color:#C2E24E;">ACTIVO</span>
        </div>
        <div class="umbral-hud-body" id="umbral-hud-body">
          <div class="umbral-hud-counter-row">
            <div>
              <div class="umbral-hud-counter" id="umbral-hud-counter">0</div>
              <div style="font-size:10px;text-transform:uppercase;color:#666;">Pisos capturados</div>
            </div>
            <span style="font-size:9.5px;background:#C2E24E;color:#181614;font-weight:700;padding:2px 5px;">IDEALISTA</span>
          </div>
          <button class="umbral-hud-action-btn" id="umbral-hud-sync-btn">
            ⚡ SINCRONIZAR CON MI OBSERVATORIO
          </button>
          <div id="umbral-hud-msg" class="umbral-hud-status-msg"></div>
          <div class="umbral-hud-options">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" id="umbral-hud-chk-autosync" ${autoSync ? "checked" : ""}>
              <span>Auto-enviar al hacer scroll</span>
            </label>
            <div>
              <span style="font-size:9px;text-transform:uppercase;color:#777;font-weight:600;">Destino (Local o Vercel):</span>
              <input type="text" id="umbral-hud-backend-url" class="umbral-hud-url-input" value="${defaultBackend}">
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(host);

    shadowRoot.getElementById("umbral-hud-sync-btn")?.addEventListener("click", sendListingsToUmbral);

    shadowRoot.getElementById("umbral-hud-chk-autosync")?.addEventListener("change", (e) => {
      autoSync = e.target.checked;
      localStorage.setItem(STORAGE_KEY_AUTOSYNC, autoSync ? "true" : "false");
    });

    shadowRoot.getElementById("umbral-hud-backend-url")?.addEventListener("change", (e) => {
      defaultBackend = e.target.value.trim();
      localStorage.setItem(STORAGE_KEY_URL, defaultBackend);
    });

    shadowRoot.getElementById("umbral-hud-header")?.addEventListener("click", () => {
      const b = shadowRoot.getElementById("umbral-hud-body");
      if (b) b.style.display = b.style.display === "none" ? "flex" : "none";
    });
  }

  function updateHUD() {
    if (!shadowRoot) return;
    const counterEl = shadowRoot.getElementById("umbral-hud-counter");
    if (counterEl) {
      counterEl.textContent = capturedListings.size;
    }
  }

  function init() {
    injectIsolatedHUD();
    scanCurrentPage();

    let scrollWait = false;
    window.addEventListener(
      "scroll",
      () => {
        if (!scrollWait) {
          scrollWait = true;
          setTimeout(() => {
            scrollWait = false;
            scanCurrentPage();
          }, 600);
        }
      },
      { passive: true }
    );

    setInterval(() => {
      const currentCardsCount = document.querySelectorAll("article.item, article[data-adid]").length;
      if (currentCardsCount > 0 && currentCardsCount !== lastCountScanned) {
        scanCurrentPage();
      }
    }, 3500);
  }

  if (document.readyState === "complete") {
    setTimeout(init, 300);
  } else {
    window.addEventListener("load", () => setTimeout(init, 300));
  }
})();
