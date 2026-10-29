// ==UserScript==
// @name         UMBRAL Bridge · Conector Idealista & Multi-Portal
// @namespace    https://github.com/NicoMM8/Idealista
// @version      1.0.0
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

  const STORAGE_KEY_URL = "umbral_bridge_backend_url";
  const STORAGE_KEY_AUTOSYNC = "umbral_bridge_autosync";

  let defaultBackend = localStorage.getItem(STORAGE_KEY_URL) || "http://localhost:8050";
  let autoSync = localStorage.getItem(STORAGE_KEY_AUTOSYNC) === "true";

  const capturedListings = new Map();
  let syncTimeout = null;

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

    if (autoSync) {
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(sendListingsToUmbral, 1500);
    }
  }

  function sendListingsToUmbral() {
    if (capturedListings.size === 0) return;

    const btn = document.getElementById("umbral-hud-sync-btn");
    const msg = document.getElementById("umbral-hud-msg");
    const urlInput = document.getElementById("umbral-hud-backend-url");
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
          msg.innerHTML = `✓ <strong>${data.imported} pisos importados</strong> (${data.approved} aptos en mapa / ${data.rejected} filtrados). <br><a href="${targetUrl}" target="_blank" style="color:#264636;font-weight:700;text-decoration:underline;">Abrir Umbral ↗</a>`;
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

  function injectHUD() {
    if (document.getElementById("umbral-bridge-hud")) return;

    // Inject CSS styles
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      #umbral-bridge-hud {
        position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; width: 310px;
        background: #F3EFE6; border: 2px solid #181614; box-shadow: 6px 6px 0px #181614;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; color: #181614; line-height: 1.35;
      }
      .umbral-hud-header { background: #181614; color: #F3EFE6; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; text-transform: uppercase; cursor: pointer; }
      .umbral-hud-header .dot { display: inline-block; width: 8px; height: 8px; background: #C2E24E; border-radius: 50%; margin-right: 6px; box-shadow: 0 0 6px #C2E24E; }
      .umbral-hud-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 9px; }
      .umbral-hud-counter-row { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid rgba(24,22,20,0.2); padding-bottom: 6px; }
      .umbral-hud-counter { font-size: 22px; font-weight: 800; color: #B84A32; font-family: Georgia, serif; }
      .umbral-hud-action-btn { background: #B84A32; color: #fff; border: 1.5px solid #181614; padding: 9px 12px; font-size: 11.5px; font-weight: 700; text-transform: uppercase; cursor: pointer; box-shadow: 2px 2px 0 #181614; width: 100%; }
      .umbral-hud-action-btn:hover { background: #181614; }
      .umbral-hud-options { display: flex; flex-direction: column; gap: 5px; font-size: 11px; }
      .umbral-hud-url-input { background: #fff; border: 1px solid #181614; padding: 4px 6px; font-size: 10.5px; font-family: monospace; width: 100%; box-sizing: border-box; }
      .umbral-hud-status-msg { font-size: 10.5px; padding: 6px 8px; border-left: 3px solid #264636; display: none; }
    `;
    document.head.appendChild(styleEl);

    const hud = document.createElement("div");
    hud.id = "umbral-bridge-hud";
    hud.innerHTML = `
      <div class="umbral-hud-header" id="umbral-hud-header">
        <span><span class="dot"></span>UMBRAL BRIDGE</span>
        <span style="font-size:10px;color:#C2E24E;">ACTIVO</span>
      </div>
      <div class="umbral-hud-body" id="umbral-hud-body">
        <div class="umbral-hud-counter-row">
          <div>
            <div class="umbral-hud-counter" id="umbral-hud-counter">0</div>
            <div style="font-size:10px;text-transform:uppercase;color:#666;">Pisos capturados en pantalla</div>
          </div>
          <span style="font-size:9.5px;background:#C2E24E;color:#181614;font-weight:700;padding:2px 5px;">IDEALISTA</span>
        </div>
        <button class="umbral-hud-action-btn" id="umbral-hud-sync-btn">
          ⚡ ENVIAR A MI OBSERVATORIO
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
    `;

    document.body.appendChild(hud);

    document.getElementById("umbral-hud-sync-btn")?.addEventListener("click", sendListingsToUmbral);

    document.getElementById("umbral-hud-chk-autosync")?.addEventListener("change", (e) => {
      autoSync = e.target.checked;
      localStorage.setItem(STORAGE_KEY_AUTOSYNC, autoSync ? "true" : "false");
    });

    document.getElementById("umbral-hud-backend-url")?.addEventListener("change", (e) => {
      defaultBackend = e.target.value.trim();
      localStorage.setItem(STORAGE_KEY_URL, defaultBackend);
    });

    document.getElementById("umbral-hud-header")?.addEventListener("click", () => {
      const b = document.getElementById("umbral-hud-body");
      if (b) b.style.display = b.style.display === "none" ? "flex" : "none";
    });
  }

  function updateHUD() {
    const counterEl = document.getElementById("umbral-hud-counter");
    if (counterEl) {
      counterEl.textContent = capturedListings.size;
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    injectHUD();
    scanCurrentPage();
  });

  if (document.readyState === "complete" || document.readyState === "interactive") {
    injectHUD();
    scanCurrentPage();
  }

  let scrollTimeout = null;
  window.addEventListener("scroll", () => {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(scanCurrentPage, 400);
  });

  const observer = new MutationObserver(() => {
    scanCurrentPage();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
