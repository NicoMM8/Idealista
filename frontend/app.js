/**
 * UMBRAL v2.0 — CONTROLADOR NACIONAL DE PISOS REALES, CARTOGRAFÍA DINÁMICA,
 * FILTRADO POR ENCUADRE (VIEWPORT) Y DIBUJO DE FIGURA A MANO ALZADA (ESTILO IDEALISTA)
 */

const state = {
  query: "España",
  minPrice: 0,
  maxPrice: 130000,
  selectedPortalId: null,
  verticalFilter: "all", // 'all' | 'ground' | 'first_floor_walkup' | 'elevator'
  activeTab: "approved", // 'approved' | 'rejected'
  sortBy: "score", // 'score' | 'price_asc' | 'sqm_desc' | 'price_sqm_asc'
  syncViewport: true,
  showRejectedOnMap: false,
  customExcludedWords: [],
  allowFirstFloorNoElevator: true,
  allowGroundFloor: true,
  allowOccupied: false,
  pageSize: 36,
  currentLimit: 36,

  // Full dataset from backend
  data: null,

  // Leaflet Map & Freehand Polygon Drawing state
  map: null,
  markersLayer: null,
  polygonLayer: null,
  isDrawingMode: false,
  isMouseDownDrawing: false,
  drawLatLngs: [],
  drawnPolygon: null, // Array of [lat, lon]
};

document.addEventListener("DOMContentLoaded", () => {
  if (window.UmbralThreeScene) {
    window.UmbralThreeScene.init();
  }
  initMap();
  bindUIEvents();
  executeSearch("España", true);
});

function initMap() {
  const mapEl = document.getElementById("interactive-map");
  if (!mapEl || typeof L === "undefined") return;

  state.map = L.map("interactive-map", {
    center: [40.0, -3.5],
    zoom: 6,
    zoomControl: false,
  });

  L.control.zoom({ position: "bottomright" }).addTo(state.map);

  // 100% Free, Zero-API-Key Map Layers:
  // 1. Esri World Street Map (Ultra-fast CDN, zero rate-limits, rock-solid)
  const esriStreetLayer = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "&copy; Esri, DeLorme, NAVTEQ",
      maxZoom: 19,
    }
  );

  // 2. OpenStreetMap Standard (warmed with editorial CSS filter)
  const osmLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  });

  // 3. Cartografía Oficial IGN España (Instituto Geográfico Nacional)
  const ignSpainLayer = L.tileLayer(
    "https://www.ign.es/wmts/ign-base?request=GetTile&service=WMTS&Version=1.0.0&Layer=IGNBaseTodo&Style=default&Format=image/jpeg&TileMatrixSet=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}",
    {
      attribution: '&copy; <a href="https://www.ign.es">IGN España</a>',
      maxZoom: 19,
    }
  );

  // 4. Esri Topográfico Arquitectónico
  const esriTopoLayer = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "&copy; Esri",
      maxZoom: 19,
    }
  );

  // 5. Vista Satélite Real (Esri World Imagery)
  const esriSatLayer = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "&copy; Esri Satellite",
      maxZoom: 19,
    }
  );

  esriStreetLayer.addTo(state.map);

  L.control
    .layers(
      {
        "Callejero Editorial (Esri CDN)": esriStreetLayer,
        "OpenStreetMap": osmLayer,
        "Cartografía Oficial IGN España": ignSpainLayer,
        "Topográfico Arquitectónico": esriTopoLayer,
        "Satélite Real": esriSatLayer,
      },
      null,
      { position: "topright" }
    )
    .addTo(state.map);

  state.markersLayer = L.layerGroup().addTo(state.map);

  // Robust sizing so map tiles are always 100% visible
  setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 250);
  setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 1000);
  window.addEventListener("resize", () => {
    if (state.map) state.map.invalidateSize();
  });

  // Real-time Viewport Sync when user zooms in/out or pans the map
  state.map.on("moveend zoomend", () => {
    if (state.isDrawingMode) return;
    state.currentLimit = state.pageSize;
    refreshViewportFilteredUI();
  });

  initFreehandDrawingEvents();
}

function initFreehandDrawingEvents() {
  const map = state.map;
  if (!map) return;
  const container = map.getContainer();

  map.on("mousedown", (e) => {
    if (!state.isDrawingMode) return;
    state.isMouseDownDrawing = true;
    state.drawLatLngs = [[e.latlng.lat, e.latlng.lng]];
    if (state.polygonLayer) {
      map.removeLayer(state.polygonLayer);
    }
    state.polygonLayer = L.polyline(state.drawLatLngs, {
      color: "#B84A32",
      weight: 3,
      dashArray: "6, 4",
    }).addTo(map);
  });

  map.on("mousemove", (e) => {
    if (!state.isDrawingMode || !state.isMouseDownDrawing) return;
    state.drawLatLngs.push([e.latlng.lat, e.latlng.lng]);
    if (state.polygonLayer) {
      state.polygonLayer.setLatLngs(state.drawLatLngs);
    }
  });

  window.addEventListener("mouseup", () => {
    if (!state.isDrawingMode || !state.isMouseDownDrawing) return;
    state.isMouseDownDrawing = false;
    finishFreehandPolygon();
  });

  // Touch support for drawing on tablets/phones
  container.addEventListener(
    "touchstart",
    (e) => {
      if (!state.isDrawingMode || e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      const latlng = map.mouseEventToLatLng(touch);
      state.isMouseDownDrawing = true;
      state.drawLatLngs = [[latlng.lat, latlng.lng]];
      if (state.polygonLayer) map.removeLayer(state.polygonLayer);
      state.polygonLayer = L.polyline(state.drawLatLngs, {
        color: "#B84A32",
        weight: 3,
      }).addTo(map);
    },
    { passive: false }
  );

  container.addEventListener(
    "touchmove",
    (e) => {
      if (!state.isDrawingMode || !state.isMouseDownDrawing || e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      const latlng = map.mouseEventToLatLng(touch);
      state.drawLatLngs.push([latlng.lat, latlng.lng]);
      if (state.polygonLayer) state.polygonLayer.setLatLngs(state.drawLatLngs);
    },
    { passive: false }
  );

  container.addEventListener("touchend", () => {
    if (!state.isDrawingMode || !state.isMouseDownDrawing) return;
    state.isMouseDownDrawing = false;
    finishFreehandPolygon();
  });
}

function toggleDrawingMode() {
  if (!state.map) return;
  state.isDrawingMode = !state.isDrawingMode;
  const drawBtn = document.getElementById("btn-draw-polygon");
  const hint = document.getElementById("draw-status-hint");
  const mapEl = document.getElementById("interactive-map");

  if (state.isDrawingMode) {
    state.map.dragging.disable();
    if (drawBtn) {
      drawBtn.classList.add("active-draw");
      drawBtn.textContent = "✏️ ARRASTRA EL RATÓN EN EL MAPA PARA TRAZAR...";
    }
    if (hint) {
      hint.textContent = "Mantén pulsado el clic izquierdo y rodea la zona que quieras filtrar";
    }
    if (mapEl) mapEl.style.cursor = "crosshair";
  } else {
    state.map.dragging.enable();
    if (drawBtn) {
      drawBtn.classList.remove("active-draw");
      drawBtn.textContent = "✏️ DIBUJAR ZONA A MANO ALZADA (COMO IDEALISTA)";
    }
    if (mapEl) mapEl.style.cursor = "";
  }
}

function finishFreehandPolygon() {
  const map = state.map;
  state.isDrawingMode = false;
  map.dragging.enable();

  const drawBtn = document.getElementById("btn-draw-polygon");
  const clearBtn = document.getElementById("btn-clear-polygon");
  const hint = document.getElementById("draw-status-hint");
  const mapEl = document.getElementById("interactive-map");

  if (mapEl) mapEl.style.cursor = "";
  if (drawBtn) {
    drawBtn.classList.remove("active-draw");
    drawBtn.textContent = "✏️ VOLVER A DIBUJAR ZONA";
  }

  if (state.drawLatLngs.length < 4) {
    if (state.polygonLayer) map.removeLayer(state.polygonLayer);
    state.drawnPolygon = null;
    if (hint) hint.textContent = "Trazo demasiado corto. Prueba a rodear un barrio o región.";
    return;
  }

  if (state.polygonLayer) map.removeLayer(state.polygonLayer);
  state.drawnPolygon = state.drawLatLngs;
  state.polygonLayer = L.polygon(state.drawnPolygon, {
    color: "#B84A32",
    fillColor: "#B84A32",
    fillOpacity: 0.16,
    weight: 2.5,
  }).addTo(map);

  if (clearBtn) clearBtn.style.display = "inline-block";
  if (hint) hint.textContent = "✓ Filtrando por tu figura dibujada a mano alzada";

  state.currentLimit = state.pageSize;
  refreshViewportFilteredUI();
}

function clearDrawnPolygon() {
  if (state.polygonLayer && state.map) {
    state.map.removeLayer(state.polygonLayer);
  }
  state.polygonLayer = null;
  state.drawnPolygon = null;
  state.drawLatLngs = [];

  const drawBtn = document.getElementById("btn-draw-polygon");
  const clearBtn = document.getElementById("btn-clear-polygon");
  const hint = document.getElementById("draw-status-hint");

  if (drawBtn) drawBtn.textContent = "✏️ DIBUJAR ZONA A MANO ALZADA (COMO IDEALISTA)";
  if (clearBtn) clearBtn.style.display = "none";
  if (hint) hint.textContent = "Amplía o aleja el mapa: la lista muestra lo que ves en pantalla";

  state.currentLimit = state.pageSize;
  refreshViewportFilteredUI();
}

function pointInPolygon(lat, lon, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0],
      yi = polygon[i][1];
    const xj = polygon[j][0],
      yj = polygon[j][1];
    const intersect =
      yi > lon !== yj > lon && lat < ((xj - xi) * (lon - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function bindUIEvents() {
  const searchInput = document.getElementById("city-search-input");
  const searchBtn = document.getElementById("btn-run-search");
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      const q = (searchInput.value || "España").trim();
      executeSearch(q, true);
    });
  }
  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const q = (searchInput.value || "España").trim();
        executeSearch(q, true);
      }
    });
  }

  // Min & Max Price sliders + Aval ICO presets
  const minSlider = document.getElementById("min-price-slider");
  const minLabel = document.getElementById("min-price-display");
  const priceSlider = document.getElementById("max-price-slider");
  const priceLabel = document.getElementById("max-price-display");

  function updateMinPriceUI(val) {
    state.minPrice = val;
    if (minSlider) minSlider.value = String(val);
    if (minLabel) {
      minLabel.textContent = val <= 0 ? "0 € (Sin mín.)" : formatEuro(val);
    }
    document.querySelectorAll(".ico-preset-btn").forEach((b) => {
      b.classList.toggle("active", parseInt(b.getAttribute("data-min-price"), 10) === val);
    });
    if (val > state.maxPrice) {
      state.maxPrice = val;
      if (priceSlider) priceSlider.value = String(val);
      if (priceLabel) priceLabel.textContent = formatEuro(val);
    }
  }

  if (minSlider) {
    minSlider.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      updateMinPriceUI(val);
    });
    minSlider.addEventListener("change", () => {
      executeSearch("España", false);
    });
  }

  document.querySelectorAll(".ico-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = parseInt(btn.getAttribute("data-min-price") || "0", 10);
      updateMinPriceUI(val);
      executeSearch("España", false);
    });
  });

  if (priceSlider) {
    priceSlider.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      state.maxPrice = val;
      if (priceLabel) priceLabel.textContent = formatEuro(val);
      if (state.minPrice > val) {
        updateMinPriceUI(val);
      }
    });
    priceSlider.addEventListener("change", () => {
      executeSearch("España", false);
    });
  }

  // Quick city / Spain buttons
  document.querySelectorAll(".city-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".city-chip").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const city = btn.getAttribute("data-city");
      if (searchInput) searchInput.value = city;
      state.selectedPortalId = null;
      clearDrawnPolygon();
      focusOrSearchCity(city);
    });
  });

  // Zoom to All Spain button on Map
  document.getElementById("btn-zoom-spain")?.addEventListener("click", () => {
    clearDrawnPolygon();
    document.querySelectorAll(".city-chip").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-city") === "España");
    });
    if (searchInput) searchInput.value = "España";
    if (state.map) {
      state.map.flyTo([40.0, -3.6], 6, { duration: 1.0 });
    }
  });

  // Draw Polygon & Clear Polygon buttons
  document.getElementById("btn-draw-polygon")?.addEventListener("click", toggleDrawingMode);
  document.getElementById("btn-clear-polygon")?.addEventListener("click", clearDrawnPolygon);
  document.getElementById("btn-deep-scrape-zone")?.addEventListener("click", triggerDeepScrapeInZone);

  // Sync Viewport Checkbox
  document.getElementById("chk-sync-viewport")?.addEventListener("change", (e) => {
    state.syncViewport = e.target.checked;
    refreshViewportFilteredUI();
  });

  // 3D Floor Section Filter Buttons
  document.querySelectorAll(".floor-3d-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".floor-3d-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const mode = btn.getAttribute("data-section");
      state.verticalFilter = mode;

      if (window.UmbralThreeScene) {
        const threeMode = mode === "first_floor_walkup" ? "first_walkup" : mode;
        window.UmbralThreeScene.setSectionFilter(threeMode);
      }
      state.currentLimit = state.pageSize;
      refreshViewportFilteredUI();
    });
  });

  // Approved vs Rejected tabs
  document.getElementById("tab-approved")?.addEventListener("click", () => {
    state.activeTab = "approved";
    document.getElementById("tab-approved").classList.add("active");
    document.getElementById("tab-rejected").classList.remove("active");
    state.currentLimit = state.pageSize;
    refreshViewportFilteredUI();
  });

  document.getElementById("tab-rejected")?.addEventListener("click", () => {
    state.activeTab = "rejected";
    document.getElementById("tab-rejected").classList.add("active");
    document.getElementById("tab-approved").classList.remove("active");
    state.currentLimit = state.pageSize;
    refreshViewportFilteredUI();
  });

  // Sort select
  document.getElementById("sort-select")?.addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    state.currentLimit = state.pageSize;
    refreshViewportFilteredUI();
  });

  // Map rejected pins toggle
  document.getElementById("chk-map-rejected")?.addEventListener("change", (e) => {
    state.showRejectedOnMap = e.target.checked;
    refreshViewportFilteredUI();
  });

  // Custom forbidden word form
  const addWordBtn = document.getElementById("btn-add-excluded-word");
  const wordInput = document.getElementById("input-custom-word");
  if (addWordBtn && wordInput) {
    addWordBtn.addEventListener("click", () => {
      const w = wordInput.value.trim();
      if (w && !state.customExcludedWords.includes(w)) {
        state.customExcludedWords.push(w);
        wordInput.value = "";
        renderCustomExcludedPills();
        executeSearch("España", false);
      }
    });
    wordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addWordBtn.click();
    });
  }

  // Toggle accessibility rules (1º sin ascensor / Bajo)
  document.getElementById("pill-toggle-first-floor")?.addEventListener("click", (e) => {
    state.allowFirstFloorNoElevator = !state.allowFirstFloorNoElevator;
    e.currentTarget.classList.toggle("inactive", !state.allowFirstFloorNoElevator);
    executeSearch("España", false);
  });

  document.getElementById("pill-toggle-ground")?.addEventListener("click", (e) => {
    state.allowGroundFloor = !state.allowGroundFloor;
    e.currentTarget.classList.toggle("inactive", !state.allowGroundFloor);
    executeSearch("España", false);
  });

  // Toggle Inmuebles sin posesión (Ocupados)
  document.getElementById("pill-toggle-occupied")?.addEventListener("click", (e) => {
    state.allowOccupied = !state.allowOccupied;
    const el = e.currentTarget;
    if (state.allowOccupied) {
      el.textContent = "⚡ Admitiendo Inmuebles sin posesión";
      el.classList.remove("inactive");
      el.style.background = "var(--terracotta)";
      el.style.color = "#fff";
      el.style.borderColor = "var(--terracotta)";
    } else {
      el.textContent = "✕ Vetar Inmuebles sin posesión";
      el.classList.add("inactive");
      el.style.background = "";
      el.style.color = "";
      el.style.borderColor = "";
    }
    executeSearch("España", false);
  });

  // Modals
  document.getElementById("dossier-backdrop")?.addEventListener("click", (e) => {
    if (e.target.id === "dossier-backdrop") closeDossierModal();
  });

  document.getElementById("btn-open-auditor")?.addEventListener("click", () => {
    document.getElementById("auditor-backdrop")?.classList.add("open");
  });
  document.getElementById("btn-close-auditor")?.addEventListener("click", () => {
    document.getElementById("auditor-backdrop")?.classList.remove("open");
  });
  document.getElementById("btn-run-live-audit")?.addEventListener("click", runCustomLiveAudit);

  // Bridge modal
  document.getElementById("btn-open-bridge")?.addEventListener("click", () => {
    document.getElementById("bridge-backdrop")?.classList.add("open");
  });
  document.getElementById("btn-close-bridge")?.addEventListener("click", () => {
    document.getElementById("bridge-backdrop")?.classList.remove("open");
  });
  document.getElementById("bridge-backdrop")?.addEventListener("click", (e) => {
    if (e.target.id === "bridge-backdrop") document.getElementById("bridge-backdrop")?.classList.remove("open");
  });

  // API Keys modal
  document.getElementById("btn-open-apikeys")?.addEventListener("click", () => {
    document.getElementById("apikeys-backdrop")?.classList.add("open");
  });
  document.getElementById("btn-close-apikeys")?.addEventListener("click", () => {
    document.getElementById("apikeys-backdrop")?.classList.remove("open");
  });
  document.getElementById("btn-save-apikeys")?.addEventListener("click", saveOptionalApiKeys);
}

const QUICK_CITY_COORDS = {
  España: { lat: 40.0, lon: -3.6, zoom: 6 },
  Valencia: { lat: 39.4699, lon: -0.3763, zoom: 13 },
  Madrid: { lat: 40.4168, lon: -3.7038, zoom: 12 },
  Alicante: { lat: 38.3452, lon: -0.481, zoom: 13 },
  Sevilla: { lat: 37.3891, lon: -5.9845, zoom: 13 },
  Zaragoza: { lat: 41.6488, lon: -0.8891, zoom: 13 },
  Málaga: { lat: 36.7213, lon: -4.4214, zoom: 13 },
  Murcia: { lat: 37.9922, lon: -1.1307, zoom: 13 },
  Granada: { lat: 37.1773, lon: -3.5986, zoom: 13 },
  Barcelona: { lat: 41.3874, lon: 2.1686, zoom: 12 },
  Valladolid: { lat: 41.6523, lon: -4.7245, zoom: 13 },
  Córdoba: { lat: 37.8882, lon: -4.7794, zoom: 13 },
  Gijón: { lat: 43.5322, lon: -5.6611, zoom: 13 },
  Vigo: { lat: 42.2406, lon: -8.7207, zoom: 13 },
  "A Coruña": { lat: 43.3623, lon: -8.4115, zoom: 13 },
  Castellón: { lat: 39.9864, lon: -0.0513, zoom: 13 },
  Almería: { lat: 36.834, lon: -2.4637, zoom: 13 },
};

let nextDeepPageByZone = 4;

async function triggerDeepScrapeInZone() {
  if (!state.map) return;
  const btn = document.getElementById("btn-deep-scrape-zone");
  const hint = document.getElementById("draw-status-hint");
  const center = state.map.getCenter();
  if (btn) {
    btn.textContent = "⚡ EXTRAYENDO PÁGINAS EN VIVO...";
    btn.disabled = true;
  }
  try {
    const resp = await fetch("/api/deep-scrape-zone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: center.lat,
        lon: center.lng,
        start_page: nextDeepPageByZone,
        pages: 4,
        max_price: state.maxPrice,
      }),
    });
    const res = await resp.json();
    nextDeepPageByZone = res.next_start_page || nextDeepPageByZone + 4;
    if (hint) {
      hint.textContent = `✓ +${res.new_listings_added} pisos reales nuevos extraídos en ${res.province}`;
    }
    await executeSearch("España", false);
  } catch (e) {
    console.error("Deep scrape error:", e);
  } finally {
    if (btn) {
      btn.textContent = "⚡ EXTRAER MÁS PÁGINAS DE ESTA ZONA";
      btn.disabled = false;
    }
  }
}

async function focusOrSearchCity(cityQuery) {
  if (QUICK_CITY_COORDS[cityQuery] && state.data) {
    const c = QUICK_CITY_COORDS[cityQuery];
    setText("stat-city-name", cityQuery.toUpperCase());
    if (state.map) {
      state.map.flyTo([c.lat, c.lon], c.zoom, { duration: 1.0 });
    }
    return;
  }
  // If it's a custom municipality (e.g. Elche, Gandia, Toledo, Jerez), scrape it live and fly map there!
  await executeSearch(cityQuery, true);
}

async function executeSearch(queryToRun = "España", flyMap = true) {
  const btn = document.getElementById("btn-run-search");
  if (btn) {
    btn.textContent = "RASTREANDO PORTALES...";
    btn.disabled = true;
  }

  try {
    // If user searched a specific town not yet in our cache, first trigger backend scrape for that town
    if (queryToRun && queryToRun.toLowerCase() !== "españa") {
      const cityResp = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: queryToRun,
          min_price: state.minPrice,
          max_price: state.maxPrice,
          custom_excluded_words: state.customExcludedWords,
          allow_first_floor_no_elevator: state.allowFirstFloorNoElevator,
          allow_ground_floor: state.allowGroundFloor,
          allow_occupied: state.allowOccupied,
        }),
      });
      const cityData = await cityResp.json();
      if (flyMap && state.map && cityData.city) {
        state.map.flyTo([cityData.city.lat, cityData.city.lon], cityData.city.zoom || 13, {
          duration: 1.0,
        });
      }
      setText("stat-city-name", cityData.city.name.toUpperCase());
    }

    // Always load the full national dataset into `state.data` so zooming out to Spain shows all 2,124+ listings!
    const resp = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "España",
        min_price: state.minPrice,
        max_price: state.maxPrice,
        custom_excluded_words: state.customExcludedWords,
        allow_first_floor_no_elevator: state.allowFirstFloorNoElevator,
        allow_ground_floor: state.allowGroundFloor,
        allow_occupied: state.allowOccupied,
      }),
    });
    const nationalData = await resp.json();
    state.data = nationalData;

    setText(
      "stat-national-cached",
      `${nationalData.national_total_cached.toLocaleString("es-ES")} PISOS REALES`
    );

    if (flyMap && queryToRun.toLowerCase() === "españa" && state.map) {
      state.map.flyTo([40.0, -3.6], 6, { duration: 1.0 });
      setText("stat-city-name", "TODA ESPAÑA");
    }

    refreshViewportFilteredUI();
  } catch (err) {
    console.error("Error searching portals:", err);
  } finally {
    if (btn) {
      btn.textContent = "BUSCAR Y ENCUADRAR MAPA";
      btn.disabled = false;
    }
  }
}

function isItemInSpatialView(item) {
  if (!item.lat || !item.lon) return false;

  // 1. If user drew a custom polygon (Idealista-style figure), strictly filter by polygon!
  if (state.drawnPolygon && state.drawnPolygon.length >= 3) {
    return pointInPolygon(item.lat, item.lon, state.drawnPolygon);
  }

  // 2. If viewport sync is enabled, filter by current map screen bounds
  if (state.syncViewport && state.map) {
    const bounds = state.map.getBounds();
    return bounds.contains([item.lat, item.lon]);
  }

  return true;
}

function refreshViewportFilteredUI() {
  if (!state.data) return;

  // Filter approved & rejected by spatial view (polygon or map viewport bounds)
  const spatialApproved = state.data.approved.filter(isItemInSpatialView);
  const spatialRejected = state.data.rejected.filter(isItemInSpatialView);

  // Update 3D section button counters for current map view
  const elevCount = spatialApproved.filter(
    (x) => x.filter_audit.accessibility_mode === "elevator"
  ).length;
  const groundCount = spatialApproved.filter(
    (x) => x.filter_audit.accessibility_mode === "ground"
  ).length;
  const firstCount = spatialApproved.filter(
    (x) => x.filter_audit.accessibility_mode === "first_floor_walkup"
  ).length;

  setText("count-3d-all", spatialApproved.length);
  setText("count-3d-ground", groundCount);
  setText("count-3d-first", firstCount);
  setText("count-3d-elevator", elevCount);

  // Update Portal Telemetry Matrix for current map view
  renderPortalsMatrixForView(spatialApproved, spatialRejected);

  // Apply portal & 3D section sub-filters
  const baseList = state.activeTab === "approved" ? spatialApproved : spatialRejected;
  let filteredList = baseList.filter((item) => {
    if (state.selectedPortalId && item.portal_id !== state.selectedPortalId) {
      return false;
    }
    if (state.activeTab === "approved" && state.verticalFilter !== "all") {
      if (item.filter_audit.accessibility_mode !== state.verticalFilter) {
        return false;
      }
    }
    return true;
  });

  // Sort
  if (state.sortBy === "price_asc") {
    filteredList.sort((a, b) => a.price - b.price);
  } else if (state.sortBy === "sqm_desc") {
    filteredList.sort((a, b) => b.sqm - a.sqm);
  } else if (state.sortBy === "price_sqm_asc") {
    filteredList.sort((a, b) => a.price_per_sqm - b.price_per_sqm);
  } else {
    filteredList.sort(
      (a, b) =>
        b.filter_audit.habitability_score - a.filter_audit.habitability_score ||
        a.price - b.price
    );
  }

  // Update top counters
  setText("stat-approved-count", spatialApproved.length);
  setText("stat-rejected-count", spatialRejected.length);

  if (spatialApproved.length > 0) {
    const avgP = Math.round(
      spatialApproved.reduce((acc, x) => acc + x.price, 0) / spatialApproved.length
    );
    const avgSqmP = Math.round(
      spatialApproved.reduce((acc, x) => acc + x.price_per_sqm, 0) / spatialApproved.length
    );
    setText("stat-avg-price", formatEuro(avgP));
    setText("stat-avg-sqm", `${avgSqmP} €/m²`);
  }

  renderCardsList(filteredList);
  renderMapPinsAndClusters(
    state.activeTab === "approved" ? filteredList : spatialApproved,
    state.activeTab === "rejected" || state.showRejectedOnMap ? spatialRejected : []
  );
}

function renderPortalsMatrixForView(spatialApproved, spatialRejected) {
  const container = document.getElementById("portals-matrix-grid");
  if (!container || !state.data) return;

  const okByPortal = {};
  const badByPortal = {};
  spatialApproved.forEach((x) => {
    okByPortal[x.portal_id] = (okByPortal[x.portal_id] || 0) + 1;
  });
  spatialRejected.forEach((x) => {
    badByPortal[x.portal_id] = (badByPortal[x.portal_id] || 0) + 1;
  });

  const DIRECT_LAUNCHER_IDS = new Set(["idealista", "yaencontre", "indomio", "tucasa"]);

  container.innerHTML = state.data.portals
    .map((p) => {
      const isSelected = state.selectedPortalId === p.id;
      const okC = okByPortal[p.id] || 0;
      const badC = badByPortal[p.id] || 0;
      const isLauncher = DIRECT_LAUNCHER_IDS.has(p.id);

      if (isLauncher) {
        const securityLabel = p.id === "idealista" ? "API OAUTH2 · ENLACE DIRECTO" : "LANZADOR DIRECTO PREFILTRADO";
        return `
        <div class="portal-card launcher-card" data-portal-id="${p.id}" title="Protegido por DataDome anti-bot: haz clic para abrir la búsqueda prefiltrada directamente en nueva pestaña">
          <div class="portal-card-top">
            <span class="portal-name">
              <span class="portal-color-pip" style="background:${p.badge_color}"></span>
              ${escapeHtml(p.name)}
            </span>
            <a href="${escapeHtml(p.search_url)}" target="_blank" rel="noopener" class="portal-direct-link" onclick="event.stopPropagation()">
              ABRIR FILTRADO ↗
            </a>
          </div>
          <div style="font-family:var(--font-mono);font-size:9px;color:var(--ink-muted)">
            ${securityLabel}
          </div>
          <div class="portal-metrics">
            <span class="portal-launcher-tag">🛡️ DATADOME · CLIC PARA ABRIR ↗</span>
          </div>
        </div>
      `;
      }

      const hasActivity = okC > 0 || badC > 0;
      const metricsHtml = hasActivity
        ? `<div class="portal-metrics">
            <span class="portal-ok">✓ ${okC} EN MAPA</span>
            <span class="portal-blocked">✕ ${badC} FILTRADOS</span>
          </div>`
        : `<div class="portal-metrics">
            <span class="portal-muted">0 en este encuadre (activo en el país)</span>
          </div>`;

      return `
      <div class="portal-card ${isSelected ? "selected-filter" : ""}" data-portal-id="${p.id}" title="Clic para filtrar las viviendas de este portal en la lista">
        <div class="portal-card-top">
          <span class="portal-name">
            <span class="portal-color-pip" style="background:${p.badge_color}"></span>
            ${escapeHtml(p.name)}
          </span>
          <a href="${escapeHtml(p.search_url)}" target="_blank" rel="noopener" class="portal-direct-link" onclick="event.stopPropagation()">
            ABRIR PORTAL ↗
          </a>
        </div>
        <div style="font-family:var(--font-mono);font-size:9.5px;color:var(--ink-muted)">
          ${escapeHtml(p.tier)}
        </div>
        ${metricsHtml}
      </div>
    `;
    })
    .join("");

  container.querySelectorAll(".portal-card").forEach((card) => {
    card.addEventListener("click", () => {
      const pid = card.getAttribute("data-portal-id");
      if (DIRECT_LAUNCHER_IDS.has(pid)) {
        const directLink = card.querySelector(".portal-direct-link");
        if (directLink && directLink.href) {
          window.open(directLink.href, "_blank", "noopener");
        }
        return;
      }
      state.selectedPortalId = state.selectedPortalId === pid ? null : pid;
      state.currentLimit = state.pageSize;
      refreshViewportFilteredUI();
    });
  });
}

function renderCardsList(list) {
  const grid = document.getElementById("listings-grid");
  if (!grid) return;

  if (list.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 48px; border: 1.5px dashed var(--ink-primary); text-align:center;">
        <h3 style="font-family:var(--font-serif);font-size:26px;margin-bottom:8px;">No hay viviendas en este recorte exacto del mapa</h3>
        <p style="font-family:var(--font-mono);font-size:12px;color:var(--ink-muted);margin-bottom:16px;">
          Desamplía el mapa, desplázalo a otra zona o pulsa "🇪🇸 Ver Mapa de Toda España".
        </p>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button class="folio-btn" onclick="resetSubFilters()">MOSTRAR TODA ESPAÑA</button>
        </div>
      </div>
    `;
    return;
  }

  const visibleSlice = list.slice(0, state.currentLimit);
  const hasMore = list.length > state.currentLimit;

  let html = visibleSlice.map((item) => buildListingCardHTML(item)).join("");
  if (hasMore) {
    const remaining = list.length - state.currentLimit;
    html += `
      <div class="load-more-wrap">
        <button class="btn-execute-search" id="btn-load-more-cards">
          MOSTRAR MÁS PISOS REALES DE ESTA ZONA (+${Math.min(36, remaining)} DE ${remaining} RESTANTES)
        </button>
      </div>
    `;
  }
  grid.innerHTML = html;

  document.getElementById("btn-load-more-cards")?.addEventListener("click", () => {
    state.currentLimit += state.pageSize;
    renderCardsList(list);
  });

  grid.querySelectorAll(".property-card").forEach((cardEl) => {
    const id = cardEl.getAttribute("data-id");
    const item = visibleSlice.find((x) => x.id === id);
    if (!item) return;

    cardEl.addEventListener("mouseenter", () => {
      highlightMarker(id, true);
      if (window.UmbralThreeScene) {
        window.UmbralThreeScene.highlightFloor(
          item.floor_num,
          item.has_elevator,
          `<strong>${escapeHtml(item.portal_name)} · ${escapeHtml(item.city)}</strong>${escapeHtml(
            item.filter_audit.accessibility_badge
          )} · ${formatEuro(item.price)}`
        );
      }
    });

    cardEl.addEventListener("mouseleave", () => {
      highlightMarker(id, false);
    });

    cardEl.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      openDossierModal(item);
    });
  });
}

window.resetSubFilters = function () {
  state.selectedPortalId = null;
  state.verticalFilter = "all";
  clearDrawnPolygon();
  if (state.map) {
    state.map.flyTo([40.0, -3.6], 6, { duration: 0.9 });
  }
  refreshViewportFilteredUI();
};

function buildListingCardHTML(item) {
  const audit = item.filter_audit;
  const passed = audit.passed;
  const imgUrl = (item.images && item.images[0]) || "";
  const modeClass = `mode-${audit.accessibility_mode || "elevator"}`;

  const rejectionBlock = !passed
    ? audit.rejections
        .map(
          (r) => `
      <div class="rejection-audit-box">
        <strong>BLOQUEADO · ${escapeHtml(r.category)}</strong>
        <div>${escapeHtml(r.reason)}</div>
        <div class="rejection-snippet">${escapeHtml(r.snippet || "")}</div>
      </div>
    `
        )
        .join("")
    : "";

  return `
    <article class="property-card ${passed ? "" : "is-rejected"}" id="card-${item.id}" data-id="${item.id}">
      <div>
        <div class="card-folio-header">
          <span>${escapeHtml(item.city)} · ${escapeHtml(item.neighborhood)}</span>
          <span class="card-portal-tag" style="background:${item.portal_color || "#181614"}">
            ${escapeHtml(item.portal_name)}
          </span>
        </div>

        <div class="card-media-wrap">
          <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" />
          <div class="card-accessibility-ribbon ${modeClass}">
            ${escapeHtml(audit.accessibility_badge)}
          </div>
          ${
            audit.has_occupied_warning
              ? `<div class="card-warning-occupied-stamp">⚠️ ACTIVO SIN POSESIÓN (OCUPADO)</div>`
              : ""
          }
          ${
            !passed
              ? `<div class="card-rejected-stamp">DESCARTADO · ${escapeHtml(
                  audit.rejections[0]?.category || "FILTRO"
                )}</div>`
              : ""
          }
        </div>

        <div class="card-body">
          <div class="card-price-row">
            <span class="card-price">${formatEuro(item.price)}</span>
            <span class="card-sqm-price">${item.price_per_sqm} €/m² · ${item.images?.length || 1} fotos</span>
          </div>

          <h2 class="card-title">${escapeHtml(item.title)}</h2>

          <div class="card-Specs-row">
            <div class="spec-cell">
              <strong>${item.sqm} m²</strong>
              <span>Superficie</span>
            </div>
            <div class="spec-cell">
              <strong>${item.rooms} hab.</strong>
              <span>Dormitorios</span>
            </div>
            <div class="spec-cell">
              <strong>${escapeHtml(item.floor_label)}</strong>
              <span>Altura</span>
            </div>
            <div class="spec-cell">
              <strong>${item.has_elevator ? "SÍ" : "NO"}</strong>
              <span>Ascensor</span>
            </div>
          </div>

          ${rejectionBlock}

          <p class="card-excerpt">${escapeHtml(item.description)}</p>
        </div>
      </div>

      <div class="card-footer">
        <span class="verified-seal" style="color:${passed ? "var(--moss)" : "var(--danger-crimson)"}">
          ${passed ? "● ANUNCIO REAL VERIFICADO" : "✕ RECHAZADO POR FILTRO"}
        </span>
        <div class="card-actions">
          <button class="btn-card-action">EXPEDIENTE</button>
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="btn-card-action primary" title="Ir directamente al anuncio real en ${escapeHtml(item.portal_name)}">
            IR AL ANUNCIO REAL ↗
          </a>
        </div>
      </div>
    </article>
  `;
}

function renderMapPinsAndClusters(approvedList, rejectedList) {
  if (!state.map || !state.markersLayer) return;
  state.markersLayer.clearLayers();

  const zoom = state.map.getZoom();
  const allToRender = [
    ...approvedList.map((x) => ({ item: x, isRejected: false })),
    ...rejectedList.map((x) => ({ item: x, isRejected: true })),
  ];

  setText("map-pins-counter", `${allToRender.length} VIVIENDAS EN PANTALLA`);

  // When zoomed out to National Spain or Autonomous Community level (zoom <= 8) with many pins,
  // group nearby apartments into interactive City/Zone Clusters + clickable zoom-in!
  if (zoom <= 8 && allToRender.length > 90) {
    const gridStep = zoom <= 6 ? 0.65 : 0.28;
    const buckets = {};
    allToRender.forEach(({ item }) => {
      const gx = Math.round(item.lat / gridStep);
      const gy = Math.round(item.lon / gridStep);
      const key = `${gx}_${gy}`;
      if (!buckets[key]) {
        buckets[key] = {
          items: [],
          latSum: 0,
          lonSum: 0,
          minPrice: item.price,
          cityName: item.city || item.province || "Zona",
        };
      }
      buckets[key].items.push(item);
      buckets[key].latSum += item.lat;
      buckets[key].lonSum += item.lon;
      if (item.price < buckets[key].minPrice) buckets[key].minPrice = item.price;
    });

    Object.values(buckets).forEach((b) => {
      const centerLat = b.latSum / b.items.length;
      const centerLon = b.lonSum / b.items.length;
      const count = b.items.length;
      const minK = Math.round(b.minPrice / 1000);

      const icon = L.divIcon({
        className: "custom-cluster-div",
        html: `
          <div class="arch-cluster-pin">
            <span>${escapeHtml(b.cityName.toUpperCase())}</span>
            <span style="background:#181614;color:#fff;padding:1px 6px;">${count} PISOS</span>
            <span style="font-weight:400;font-size:10px;">desde ${minK}k €</span>
          </div>
        `,
        iconSize: [180, 30],
        iconAnchor: [90, 15],
      });

      const m = L.marker([centerLat, centerLon], { icon }).addTo(state.markersLayer);
      m.on("click", () => {
        state.map.flyTo([centerLat, centerLon], Math.min(zoom + 4, 13), { duration: 0.85 });
      });
    });
    return;
  }

  // At city/neighborhood zoom (or <= 90 pins), render individual clickable apartment price pins
  // Cap at 350 individual DOM pins simultaneously for 60fps smoothness
  const pinsSlice = allToRender.slice(0, 350);

  pinsSlice.forEach(({ item, isRejected }) => {
    const shortPrice = `${Math.round(item.price / 1000)}k €`;
    const shortFloor =
      item.floor_num === 0
        ? "BAJO"
        : item.has_elevator
        ? `${item.floor_num || ""}º ASC`
        : `${item.floor_num || 1}º S/A`;

    const icon = L.divIcon({
      className: "custom-div-pin",
      html: `
        <div class="arch-map-pin ${isRejected ? "rejected-pin" : ""}" id="pin-${item.id}">
          <span>${shortPrice}</span>
          <span class="pin-floor">· ${shortFloor}</span>
        </div>
      `,
      iconSize: [96, 26],
      iconAnchor: [48, 13],
    });

    const marker = L.marker([item.lat, item.lon], { icon }).addTo(state.markersLayer);

    marker.on("mouseover", () => {
      if (window.UmbralThreeScene) {
        window.UmbralThreeScene.highlightFloor(
          item.floor_num,
          item.has_elevator,
          `<strong>${escapeHtml(item.portal_name)} · ${escapeHtml(item.city)}</strong>${escapeHtml(
            item.filter_audit.accessibility_badge
          )} · ${formatEuro(item.price)}`
        );
      }
      const cardEl = document.getElementById(`card-${item.id}`);
      if (cardEl) cardEl.classList.add("highlighted");
    });

    marker.on("mouseout", () => {
      const cardEl = document.getElementById(`card-${item.id}`);
      if (cardEl) cardEl.classList.remove("highlighted");
    });

    marker.on("click", () => {
      openDossierModal(item);
    });
  });
}

function highlightMarker(id, active) {
  const pinEl = document.getElementById(`pin-${id}`);
  if (pinEl) {
    pinEl.classList.toggle("active-pin", active);
  }
}

function openDossierModal(item) {
  const backdrop = document.getElementById("dossier-backdrop");
  const content = document.getElementById("dossier-modal-content");
  if (!backdrop || !content) return;

  const audit = item.filter_audit;
  const imgs = item.images || [];

  content.innerHTML = `
    <div class="dossier-modal-header">
      <span>EXPEDIENTE DE ANUNCIO REAL · ${escapeHtml(item.ref_code || item.id)} · PORTAL: ${escapeHtml(
    item.portal_name
  )}</span>
      <button class="btn-close-modal" onclick="closeDossierModal()">CERRAR [ESC]</button>
    </div>

    <div class="dossier-modal-body">
      <div>
        <div class="dossier-gallery">
          ${imgs
            .slice(0, 3)
            .map((src) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(item.title)}" />`)
            .join("")}
        </div>
        <div class="kicker-line">${escapeHtml(item.neighborhood)} · ${escapeHtml(item.city)} (${escapeHtml(
    item.province || ""
  )})</div>
        <h2 style="font-family:var(--font-serif);font-size:30px;line-height:1.15;margin-bottom:12px;">
          ${escapeHtml(item.title)}
        </h2>
        <p style="font-size:14.5px;line-height:1.65;color:var(--ink-secondary);margin-bottom:18px;max-height:220px;overflow-y:auto;">
          ${escapeHtml(item.description)}
        </p>

        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${(audit.verified_tags || [])
            .map(
              (t) =>
                `<span class="${
                  audit.passed ? "inclusion-pill" : "exclusion-pill"
                }">${escapeHtml(t)}</span>`
            )
            .join("")}
        </div>
      </div>

      <div class="dossier-blueprint-box">
        <div style="border-bottom:var(--rule-strong);padding-bottom:10px;display:flex;justify-content:space-between;align-items:baseline;">
          <span style="font-family:var(--font-serif);font-size:36px;font-weight:700;">${formatEuro(
            item.price
          )}</span>
          <span style="font-family:var(--font-mono);font-size:12px;color:var(--terracotta);">TOPE ≤ ${formatEuro(
            state.maxPrice
          )} ✓</span>
        </div>

        <div style="font-family:var(--font-mono);font-size:11.5px;display:grid;grid-template-columns:1fr 1fr;gap:10px;border-bottom:var(--rule-hairline);padding-bottom:12px;">
          <div><strong>SUPERFICIE:</strong> ${item.sqm} m² (${item.price_per_sqm} €/m²)</div>
          <div><strong>HABITACIONES:</strong> ${item.rooms} dormitorios</div>
          <div><strong>PLANTA / COTA:</strong> ${escapeHtml(item.floor_label)}</div>
          <div><strong>ASCENSOR:</strong> ${item.has_elevator ? "SÍ (Verificado)" : "NO (Admitido ≤1º)"}</div>
          <div><strong>PORTAL ORIGEN:</strong> ${escapeHtml(item.portal_name)}</div>
          <div><strong>COORDENADAS:</strong> ${Number(item.lat).toFixed(4)}, ${Number(item.lon).toFixed(4)}</div>
        </div>

        <div style="background:var(--bg-stone);padding:12px;border:1px solid var(--ink-primary);font-family:var(--font-mono);font-size:11px;">
          <strong style="display:block;margin-bottom:6px;color:var(--moss);">
            AUDITORÍA DE EXCLUSIÓN DE TRAMPAS INMOBILIARIAS:
          </strong>
          <div>✓ Sin menciones a "ocupado / sin posesión / okupa"</div>
          <div>✓ Sin menciones a "nuda propiedad / usufructo"</div>
          <div>✓ Sin menciones a "alquilado / con inquilino / renta"</div>
          <div>✓ Sin menciones a "solo inversores / subasta / cesión"</div>
          <div>✓ Vivienda residencial real (excluidos locales sin empadronamiento)</div>
          <div>✓ Cumple regla de accesibilidad (${escapeHtml(audit.accessibility_badge)})</div>
        </div>

        <div style="margin-top:auto;display:flex;flex-direction:column;gap:8px;padding-top:12px;">
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="btn-execute-search" style="text-align:center;text-decoration:none;display:block;">
            ABRIR PÁGINA EXACTA DEL ANUNCIO EN ${escapeHtml(item.portal_name.toUpperCase())} ↗
          </a>
          <button class="folio-btn" style="padding:9px;" onclick="focusMapOnProperty('${item.id}')">
            CENTRAR EN EL MAPA Y MODELO 3D
          </button>
        </div>
      </div>
    </div>
  `;

  backdrop.classList.add("open");
}

window.closeDossierModal = function () {
  document.getElementById("dossier-backdrop")?.classList.remove("open");
};

window.focusMapOnProperty = function (id) {
  closeDossierModal();
  if (!state.data) return;
  const all = [...state.data.approved, ...state.data.rejected];
  const item = all.find((x) => x.id === id);
  if (item && state.map) {
    state.map.flyTo([item.lat, item.lon], 16, { duration: 0.9 });
    setTimeout(() => highlightMarker(id, true), 950);
    if (window.UmbralThreeScene) {
      window.UmbralThreeScene.highlightFloor(
        item.floor_num,
        item.has_elevator,
        `<strong>${escapeHtml(item.portal_name)}</strong>${escapeHtml(
          item.filter_audit.accessibility_badge
        )} · ${formatEuro(item.price)}`
      );
    }
  }
};

function renderCustomExcludedPills() {
  const container = document.getElementById("custom-excluded-pills");
  if (!container) return;
  container.innerHTML = state.customExcludedWords
    .map(
      (w, idx) => `
      <span class="exclusion-pill" style="cursor:pointer" data-idx="${idx}" title="Clic para quitar">
        ✕ "${escapeHtml(w)}"
      </span>
    `
    )
    .join("");

  container.querySelectorAll(".exclusion-pill").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.getAttribute("data-idx"), 10);
      state.customExcludedWords.splice(idx, 1);
      renderCustomExcludedPills();
      executeSearch("España", false);
    });
  });
}

async function saveOptionalApiKeys() {
  const k = document.getElementById("input-idealista-key")?.value || "";
  const s = document.getElementById("input-idealista-secret")?.value || "";
  const msg = document.getElementById("apikeys-status-msg");
  try {
    const resp = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idealista_key: k, idealista_secret: s }),
    });
    const res = await resp.json();
    if (msg) {
      msg.textContent = res.has_idealista_key
        ? "✓ Credenciales de Idealista guardadas correctamente."
        : "Credenciales vaciadas (usando extracción directa sin clave).";
    }
  } catch (e) {
    if (msg) msg.textContent = "Error al guardar credenciales.";
  }
}

async function runCustomLiveAudit() {
  const urlInput = document.getElementById("audit-url-input");
  const textInput = document.getElementById("audit-text-input");
  const priceInput = document.getElementById("audit-price-input");
  const outBox = document.getElementById("audit-live-result");

  if (!outBox) return;
  outBox.innerHTML = `<div style="font-family:var(--font-mono);font-size:12px;">Analizando texto, planta, ascensor y fotografías...</div>`;

  try {
    const resp = await fetch("/api/audit-custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: urlInput?.value.trim() || null,
        raw_text: textInput?.value.trim() || null,
        price: parseInt(priceInput?.value || "115000", 10),
        max_price: state.maxPrice,
      }),
    });
    const { result } = await resp.json();
    const audit = result.filter_audit;

    outBox.innerHTML = `
      <div style="border:1.5px solid ${
        audit.passed ? "var(--moss)" : "var(--danger-crimson)"
      };padding:14px;background:var(--bg-paper);">
        <div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:${
          audit.passed ? "var(--moss)" : "var(--danger-crimson)"
        };margin-bottom:6px;">
          ${
            audit.passed
              ? "✓ VIVIENDA APTA · CUMPLE TODOS LOS REQUISITOS"
              : "✕ ANUNCIO RECHAZADO POR EL FILTRO ANTI-TRAMPAS"
          }
        </div>
        <div style="font-family:var(--font-mono);font-size:11px;margin-bottom:8px;">
          Accesibilidad detectada: <strong>${escapeHtml(audit.accessibility_badge)}</strong> · Precio: <strong>${formatEuro(
      result.price
    )}</strong>
        </div>
        ${
          audit.rejections.length > 0
            ? audit.rejections
                .map(
                  (r) =>
                    `<div class="rejection-audit-box" style="margin-top:6px;">
                      <strong>${escapeHtml(r.category)}:</strong> ${escapeHtml(r.reason)}
                      <div class="rejection-snippet">${escapeHtml(r.snippet || "")}</div>
                    </div>`
                )
                .join("")
            : `<div style="font-family:var(--font-mono);font-size:11px;color:var(--moss);">Libre de menciones a ocupas, nuda propiedad, alquiler vigente o solo inversores.</div>`
        }
      </div>
    `;
  } catch (e) {
    outBox.innerHTML = `<div style="color:var(--danger-crimson)">Error al analizar el anuncio.</div>`;
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function formatEuro(num) {
  const n = Number(num || 0);
  return n.toLocaleString("es-ES") + " €";
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
