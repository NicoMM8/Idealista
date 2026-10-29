# UMBRAL — Observatorio Multi-Portal de Vivienda Habitable

**UMBRAL** es una plataforma web y observatorio cartográfico de búsqueda residencial en España. Centraliza anuncios **100% reales** extraídos de múltiples portales inmobiliarios y aplica un **motor de auditoría de habitabilidad y filtrado anti-inversores** para garantizar que los inmuebles mostrados sean viviendas reales habitables para personas, no activos tóxicos, trampas posesorias ni productos para fondos.

---

## 🏛️ Los 4 Pilares de Habitabilidad

1. **Tope de Precio Flexible (Tope por defecto ≤ 130.000 €, regulable hasta 500.000 €)**
   - Control deslizante de presupuesto máximo y filtro de **Precio Mínimo** con presets específicos para operaciones con **Aval ICO** (referencia catastral ≥ 100.000 €).
2. **Cero Ocupados y Posesión Real Garantizada**
   - Vetado estricto por NLP de inmuebles ocupados, okupas, cesión de remate, subastas judiciales y activos bancarios sin posesión.
   - Píldora interactiva para admitir o vetar inmuebles sin posesión según las necesidades del comprador.
3. **Vivienda Residencial Real (Pleno Dominio)**
   - Exclusión de nuda propiedad, usufructo y contratos de alquiler vigentes.
   - Bloqueo de falsos pisos que en el Registro de la Propiedad constan como **locales comerciales sin cédula ni posibilidad de empadronamiento**.
4. **Cota Vertical y Accesibilidad Física**
   - Obligatoriedad de ascensor en cualquier altura, o bien **1ª Planta sin ascensor** o **Planta Baja / Acceso a pie de calle**. Vetado automático de 2º piso o superior sin ascensor.

---

## 🌐 Matriz de Portales Inmobiliarios Conectados

- **Extracción Real en Vivo (Conectores directos JSON/DOM/Nuxt/Elder.js):**
  - **Fotocasa** (JSON `__INITIAL_PROPS__`)
  - **Pisos.com** (`ld+json` + DOM preview)
  - **Habitaclia** (JSON `initialSearchResultsPage`)
  - **Trovimap** (JSON `trovimap-state` con coordenadas exactas)
  - **Tecnocasa** (JSON `:estates`)
  - **Redpiso** (JSON `__NUXT_DATA__` con coordenadas GPS)
  - **Housfy** (JSON `Elder.js` con coordenadas GPS)
  - **Solvia / Servihabitat** (DOM + carrusel de fotografías reales)
- **Lanzadores Directos Prefiltrados:**
  - **Idealista** (Enlace directo + soporte para API oficial OAuth2)
  - **Yaencontre**
  - **Indomio**
  - **Tucasa.com**

---

## 🗺️ Cartografía Dinámica y Experiencia 3D

- **Filtro Espacial por Encuadre (Viewport Bounds):** La lista y las métricas se sincronizan en tiempo real con el encuadre del mapa. Desamplía para ver **toda España** o haz zoom a tu barrio.
- **Dibujo de Figuras a Mano Alzada (estilo Idealista):** Dibuja con el ratón un polígono libre para recortar exactamente las calles o distritos de interés.
- **Axonometría Residencial en 3D (Three.js):** Sección interactiva de un bloque de viviendas con iluminación solar simulada según la hora del día, núcleo de ascensor animado e iluminación por cota.

---

## 🚀 Instalación y Puesta en Marcha

### Requisitos
- Python 3.10 o superior

### Pasos
```bash
# 1. Clonar el repositorio
git clone https://github.com/NicoMM8/Idealista.git
cd Idealista

# 2. Instalar dependencias
pip install -r requirements.txt

# 3. Iniciar el servidor
python run.py
```

Abre tu navegador en:
**http://localhost:8050**

---

## 📂 Estructura del Proyecto

```text
├── backend/
│   ├── filter_engine.py       # Motor léxico y reglas de habitabilidad
│   ├── main.py                # Servidor API FastAPI
│   ├── portals_scraper.py     # Orquestador multi-portal y caché
│   ├── real_scrapers.py       # Extractores concurrentes de cada portal
│   ├── spain_50_provinces.py  # Coordenadas y gazetteer de 50 provincias
│   └── data/
│       └── spain_real_listings_cache.json  # Catálogo nacional verificado
├── frontend/
│   ├── index.html             # Interfaz editorial arquitectónica
│   ├── styles.css             # Estilos de diseño editorial suizo/editorial
│   ├── app.js                 # Controlador Leaflet y reactividad
│   └── three_scene.js         # Escena 3D axonometría Three.js
├── run.py                     # Punto de entrada local (Uvicorn)
├── requirements.txt           # Dependencias de Python
└── README.md
```

