/**
 * UMBRAL BRIDGE · EXTENSIÓN CONECTORA MULTI-PORTAL
 * Captura viviendas en Idealista, Yaencontre e Indomio mientras navegas
 * y las envía a tu observatorio UMBRAL para filtrarlas y verlas en el mapa.
 */

(function () {
  const STORAGE_KEY_URL = "umbral_bridge_backend_url";
  const STORAGE_KEY_AUTOSYNC = "umbral_bridge_autosync";

  let defaultBackend = localStorage.getItem(STORAGE_KEY_URL) || "http://localhost:8050";
  let autoSync = localStorage.getItem(STORAGE_KEY_AUTOSYNC) === "true";

  const capturedListings = new Map();
  let syncTimeout = null;

  function getPortalType() {
    const host = window.location.hostname;
    if (host.includes("idealista.com")) return "idealista";
    if (host.includes("yaencontre.com")) return "yaencontre";
    if (host.includes("indomio.es")) return "indomio";
    if (host.includes("tucasa.com")) return "tucasa";
    return "idealista";
  }

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

      // Extract specs from details
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

      // Photos
      const images = [];
      const imgEls = art.querySelectorAll(".item-multimedia img, picture img");
      imgEls.forEach((img) => {
        const src = img.src || img.getAttribute("data-ondemand-img") || img.getAttribute("data-src");
        if (src && !src.includes("data:image") && !src.includes("placeholder")) {
          images.push(src);
        }
      });

      // Excerpt / description
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
    const portal = getPortalType();
    if (portal === "idealista") {
      parseIdealistaCards();
    }
    updateHUD();

    if (autoSync) {
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(sendListingsToUmbral, 1500);
    }
  }

  async function sendListingsToUmbral() {
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

    try {
      const resp = await fetch(`${targetUrl.replace(/\/$/, "")}/api/bridge/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();

      if (msg) {
        msg.style.display = "block";
        msg.innerHTML = `✓ <strong>${data.imported} pisos importados</strong> (${data.approved} aptos en mapa / ${data.rejected} filtrados). <br><a href="${targetUrl}" target="_blank" style="color:#264636;font-weight:700;text-decoration:underline;">Abrir Umbral ↗</a>`;
      }
      if (btn) {
        btn.textContent = "✓ SINCRONIZADO CON ÉXITO";
      }
    } catch (err) {
      console.error("[UMBRAL BRIDGE] Error enviando pisos:", err);
      if (msg) {
        msg.style.display = "block";
        msg.style.background = "#FBEBEB";
        msg.style.color = "#9E2A2B";
        msg.style.borderLeftColor = "#9E2A2B";
        msg.innerHTML = `✕ Error al conectar con ${targetUrl}. Asegúrate de que el servidor esté encendido.`;
      }
      if (btn) {
        btn.textContent = "✕ REINTENTAR SINCRONIZACIÓN";
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function injectHUD() {
    if (document.getElementById("umbral-bridge-hud")) return;

    const hud = document.createElement("div");
    hud.id = "umbral-bridge-hud";
    hud.innerHTML = `
      <div class="umbral-hud-header" id="umbral-hud-header">
        <span><span class="dot"></span>UMBRAL BRIDGE</span>
        <button class="umbral-hud-btn-toggle" id="umbral-hud-toggle" title="Minimizar">_</button>
      </div>
      <div class="umbral-hud-body">
        <div class="umbral-hud-counter-row">
          <div>
            <div class="umbral-hud-counter" id="umbral-hud-counter">0</div>
            <div class="umbral-hud-label">Pisos capturados en pantalla</div>
          </div>
          <span style="font-size:10px;font-family:monospace;color:#264636;background:#E6EFEA;padding:2px 6px;">${getPortalType().toUpperCase()}</span>
        </div>

        <button class="umbral-hud-action-btn" id="umbral-hud-sync-btn">
          ⚡ SINCRONIZAR CON MI OBSERVATORIO
        </button>

        <div id="umbral-hud-msg" class="umbral-hud-status-msg"></div>

        <div class="umbral-hud-options">
          <label>
            <input type="checkbox" id="umbral-hud-chk-autosync" ${autoSync ? "checked" : ""}>
            <span>Auto-enviar al hacer scroll</span>
          </label>
          <div>
            <span style="font-size:9.5px;text-transform:uppercase;color:#777;font-weight:600;">Destino (Local o Vercel):</span>
            <input type="text" id="umbral-hud-backend-url" class="umbral-hud-url-input" value="${defaultBackend}">
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(hud);

    // Bind events
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
      hud.classList.toggle("minimized");
    });
  }

  function updateHUD() {
    const counterEl = document.getElementById("umbral-hud-counter");
    if (counterEl) {
      counterEl.textContent = capturedListings.size;
    }
  }

  // Initialize
  window.addEventListener("DOMContentLoaded", () => {
    injectHUD();
    scanCurrentPage();
  });

  if (document.readyState === "complete" || document.readyState === "interactive") {
    injectHUD();
    scanCurrentPage();
  }

  // Monitor dynamic scroll / pagination on Idealista
  let scrollTimeout = null;
  window.addEventListener("scroll", () => {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(scanCurrentPage, 400);
  });

  // Observe DOM changes (e.g. Next Page / AJAX listings injection)
  const observer = new MutationObserver(() => {
    scanCurrentPage();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
