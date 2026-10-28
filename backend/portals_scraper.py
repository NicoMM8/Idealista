import asyncio
import json
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup

from backend.filter_engine import evaluate_listing, strip_accents
from backend.real_scrapers import (
    fetch_html_sync,
    fetch_idealista_official_api,
    parse_fotocasa_html,
    parse_habitaclia_html,
    parse_pisos_com_html,
    scrape_city_real_listings,
)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)
CACHE_FILE = os.path.join(DATA_DIR, "spain_real_listings_cache.json")
API_KEYS_FILE = os.path.join(DATA_DIR, "api_keys.json")


# ============================================================================
# CATALOG OF SPANISH REAL ESTATE PORTALS
# ============================================================================
PORTALS_CATALOG: List[Dict[str, Any]] = [
    {
        "id": "fotocasa",
        "name": "Fotocasa",
        "domain": "fotocasa.es",
        "badge_color": "#2A4B7C",
        "tier": "Extracción Real en Vivo (JSON)",
        "url_template": "https://www.fotocasa.es/es/comprar/viviendas/{fc_slug}/todas-las-zonas/l?maxPrice={max_price}",
    },
    {
        "id": "pisos",
        "name": "Pisos.com",
        "domain": "pisos.com",
        "badge_color": "#B84A32",
        "tier": "Extracción Real en Vivo (LD+DOM)",
        "url_template": "https://www.pisos.com/venta/pisos-{ps_slug}/hasta-{max_price}/con-ascensor/",
    },
    {
        "id": "habitaclia",
        "name": "Habitaclia",
        "domain": "habitaclia.com",
        "badge_color": "#C46A2B",
        "tier": "Extracción Real en Vivo (JSON)",
        "url_template": "https://www.habitaclia.com/comprar/viviendas/{hb_prov_slug}-provincia/s?maxPrice={max_price}",
    },
    {
        "id": "trovimap",
        "name": "Trovimap",
        "domain": "trovimap.com",
        "badge_color": "#3A5A6B",
        "tier": "Extracción Real en Vivo (JSON)",
        "url_template": "https://www.trovimap.com/venta/vivienda/{slug}?maxPrice={max_price}&sort=price_asc",
    },
    {
        "id": "tecnocasa",
        "name": "Tecnocasa",
        "domain": "tecnocasa.es",
        "badge_color": "#1E4D3B",
        "tier": "Extracción Real en Vivo (JSON)",
        "url_template": "https://www.tecnocasa.es/venta/inmuebles/{province_slug}/{slug}.html?max_price={max_price}",
    },
    {
        "id": "redpiso",
        "name": "Redpiso",
        "domain": "redpiso.es",
        "badge_color": "#9E2B25",
        "tier": "Extracción Real en Vivo (DOM)",
        "url_template": "https://www.redpiso.es/venta-viviendas/{slug}?orden=precio_asc",
    },
    {
        "id": "housfy",
        "name": "Housfy",
        "domain": "housfy.com",
        "badge_color": "#2C3E50",
        "tier": "Extracción Real en Vivo (DOM)",
        "url_template": "https://housfy.com/venta-inmuebles/{province_slug}/{slug}",
    },
    {
        "id": "solvia",
        "name": "Solvia / Servihabitat",
        "domain": "servihabitat.com",
        "badge_color": "#7D5A38",
        "tier": "Extracción Real en Vivo (DOM)",
        "url_template": "https://www.servihabitat.com/es/venta/vivienda/{province_slug}",
    },
    {
        "id": "idealista",
        "name": "Idealista",
        "domain": "idealista.com",
        "badge_color": "#6B7B3A",
        "tier": "Enlace Directo + API OAuth2",
        "url_template": "https://www.idealista.com/venta-viviendas/{slug}-{province_slug}/con-precio-hasta_{max_price},bajos,primeras-plantas-o-superiores,ascensor/",
    },
    {
        "id": "yaencontre",
        "name": "Yaencontre",
        "domain": "yaencontre.com",
        "badge_color": "#8E443D",
        "tier": "Lanzador Directo Prefiltrado",
        "url_template": "https://www.yaencontre.com/venta/pisos/{slug}/p-{max_price}",
    },
    {
        "id": "indomio",
        "name": "Indomio",
        "domain": "indomio.es",
        "badge_color": "#8C2D38",
        "tier": "Lanzador Directo Prefiltrado",
        "url_template": "https://www.indomio.es/venta-casas/{slug}/?prezzoMassimo={max_price}",
    },
    {
        "id": "tucasa",
        "name": "Tucasa.com",
        "domain": "tucasa.com",
        "badge_color": "#2E5A44",
        "tier": "Lanzador Directo Prefiltrado",
        "url_template": "https://www.tucasa.com/compra-venta/viviendas/{province_slug}/",
    },
]


# ============================================================================
# SPANISH CITIES & PROVINCES CONFIGURATION FOR REAL SCRAPING
# ============================================================================
SPANISH_CITIES_GAZETTEER: Dict[str, Dict[str, Any]] = {
    "espana": {
        "name": "Toda España (Mapa Nacional)",
        "province": "España",
        "slug": "espana",
        "province_slug": "espana",
        "fc_slug": "espana",
        "hb_prov_slug": "valencia",
        "hb_city_slug": None,
        "ps_slug": "espana",
        "lat": 40.2085,
        "lon": -3.7130,
        "zoom": 6,
    },
    "valencia": {
        "name": "Valencia",
        "province": "Valencia",
        "slug": "valencia",
        "province_slug": "valencia",
        "fc_slug": "valencia-capital",
        "hb_prov_slug": "valencia",
        "hb_city_slug": "valencia-capital",
        "ps_slug": "valencia_capital",
        "lat": 39.4699,
        "lon": -0.3763,
        "zoom": 13,
    },
    "madrid": {
        "name": "Madrid",
        "province": "Madrid",
        "slug": "madrid",
        "province_slug": "madrid",
        "fc_slug": "madrid-capital",
        "hb_prov_slug": "madrid",
        "hb_city_slug": "madrid-capital",
        "ps_slug": "madrid_capital_zona_urbana",
        "lat": 40.4168,
        "lon": -3.7038,
        "zoom": 12,
    },
    "alicante": {
        "name": "Alicante / Alacant",
        "province": "Alicante",
        "slug": "alicante-alacant",
        "province_slug": "alicante",
        "fc_slug": "alicante-alacant",
        "hb_prov_slug": "alicante",
        "hb_city_slug": None,
        "ps_slug": "alicante_alacant",
        "lat": 38.3452,
        "lon": -0.4810,
        "zoom": 13,
    },
    "sevilla": {
        "name": "Sevilla",
        "province": "Sevilla",
        "slug": "sevilla",
        "province_slug": "sevilla",
        "fc_slug": "sevilla-capital",
        "hb_prov_slug": "sevilla",
        "hb_city_slug": None,
        "ps_slug": "sevilla_capital",
        "lat": 37.3891,
        "lon": -5.9845,
        "zoom": 13,
    },
    "zaragoza": {
        "name": "Zaragoza",
        "province": "Zaragoza",
        "slug": "zaragoza",
        "province_slug": "zaragoza",
        "fc_slug": "zaragoza-capital",
        "hb_prov_slug": "zaragoza",
        "hb_city_slug": None,
        "ps_slug": "zaragoza_capital",
        "lat": 41.6488,
        "lon": -0.8891,
        "zoom": 13,
    },
    "malaga": {
        "name": "Málaga",
        "province": "Málaga",
        "slug": "malaga",
        "province_slug": "malaga",
        "fc_slug": "malaga-capital",
        "hb_prov_slug": "malaga",
        "hb_city_slug": None,
        "ps_slug": "malaga_capital",
        "lat": 36.7213,
        "lon": -4.4214,
        "zoom": 13,
    },
    "murcia": {
        "name": "Murcia",
        "province": "Murcia",
        "slug": "murcia",
        "province_slug": "murcia",
        "fc_slug": "murcia-capital",
        "hb_prov_slug": "murcia",
        "hb_city_slug": None,
        "ps_slug": "murcia_capital",
        "lat": 37.9922,
        "lon": -1.1307,
        "zoom": 13,
    },
    "granada": {
        "name": "Granada",
        "province": "Granada",
        "slug": "granada",
        "province_slug": "granada",
        "fc_slug": "granada-capital",
        "hb_prov_slug": "granada",
        "hb_city_slug": None,
        "ps_slug": "granada_capital",
        "lat": 37.1773,
        "lon": -3.5986,
        "zoom": 13,
    },
    "barcelona": {
        "name": "Barcelona",
        "province": "Barcelona",
        "slug": "barcelona",
        "province_slug": "barcelona",
        "fc_slug": "barcelona-capital",
        "hb_prov_slug": "barcelona",
        "hb_city_slug": None,
        "ps_slug": "barcelona_capital",
        "lat": 41.3874,
        "lon": 2.1686,
        "zoom": 12,
    },
    "valladolid": {
        "name": "Valladolid",
        "province": "Valladolid",
        "slug": "valladolid",
        "province_slug": "valladolid",
        "fc_slug": "valladolid-capital",
        "hb_prov_slug": "valladolid",
        "hb_city_slug": None,
        "ps_slug": "valladolid_capital",
        "lat": 41.6523,
        "lon": -4.7245,
        "zoom": 13,
    },
    "cordoba": {
        "name": "Córdoba",
        "province": "Córdoba",
        "slug": "cordoba",
        "province_slug": "cordoba",
        "fc_slug": "cordoba-capital",
        "hb_prov_slug": "cordoba",
        "hb_city_slug": None,
        "ps_slug": "cordoba_capital",
        "lat": 37.8882,
        "lon": -4.7794,
        "zoom": 13,
    },
    "gijon": {
        "name": "Gijón / Asturias",
        "province": "Asturias",
        "slug": "gijon",
        "province_slug": "asturias",
        "fc_slug": "gijon",
        "hb_prov_slug": "asturias",
        "hb_city_slug": None,
        "ps_slug": "gijon",
        "lat": 43.5322,
        "lon": -5.6611,
        "zoom": 13,
    },
    "vigo": {
        "name": "Vigo / Pontevedra",
        "province": "Pontevedra",
        "slug": "vigo",
        "province_slug": "pontevedra",
        "fc_slug": "vigo",
        "hb_prov_slug": "pontevedra",
        "hb_city_slug": None,
        "ps_slug": "vigo",
        "lat": 42.2406,
        "lon": -8.7207,
        "zoom": 13,
    },
    "coruna": {
        "name": "A Coruña",
        "province": "A Coruña",
        "slug": "a-coruna",
        "province_slug": "a-coruna",
        "fc_slug": "a-coruna-capital",
        "hb_prov_slug": "a-coruna",
        "hb_city_slug": None,
        "ps_slug": "a_coruna_capital",
        "lat": 43.3623,
        "lon": -8.4115,
        "zoom": 13,
    },
    "castellon": {
        "name": "Castellón de la Plana",
        "province": "Castellón",
        "slug": "castellon-de-la-plana",
        "province_slug": "castellon",
        "fc_slug": "castellon-de-la-plana-castello-de-la-plana",
        "hb_prov_slug": "castellon",
        "hb_city_slug": None,
        "ps_slug": "castellon_de_la_plana_castello_de_la_plana",
        "lat": 39.9864,
        "lon": -0.0513,
        "zoom": 13,
    },
    "almeria": {
        "name": "Almería",
        "province": "Almería",
        "slug": "almeria",
        "province_slug": "almeria",
        "fc_slug": "almeria-capital",
        "hb_prov_slug": "almeria",
        "hb_city_slug": None,
        "ps_slug": "almeria_capital",
        "lat": 36.8340,
        "lon": -2.4637,
        "zoom": 13,
    },
}


# In-memory National Real Listings Cache (keyed by listing ID)
_NATIONAL_LISTINGS_BY_ID: Dict[str, Dict[str, Any]] = {}
_SCRAPED_CITY_KEYS: set = set()
_LAST_CACHE_MTIME: float = 0.0
_PRE_EVALUATED_CACHE: Dict[str, Dict[str, Any]] = {}


def load_national_cache(force: bool = False) -> None:
    global _NATIONAL_LISTINGS_BY_ID, _SCRAPED_CITY_KEYS, _LAST_CACHE_MTIME, _PRE_EVALUATED_CACHE
    if not os.path.exists(CACHE_FILE):
        return
    try:
        mtime = os.path.getmtime(CACHE_FILE)
        if not force and mtime == _LAST_CACHE_MTIME and _NATIONAL_LISTINGS_BY_ID:
            return
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            payload = json.load(f)
            items = payload.get("items") or []
            _SCRAPED_CITY_KEYS = set(payload.get("scraped_cities") or [])
            for it in items:
                iid = it.get("id")
                if iid:
                    _NATIONAL_LISTINGS_BY_ID[iid] = it
        _LAST_CACHE_MTIME = mtime
        _PRE_EVALUATED_CACHE.clear()
    except Exception:
        pass


def save_national_cache() -> None:
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "updated_at": int(time.time()),
                    "scraped_cities": list(_SCRAPED_CITY_KEYS),
                    "items": list(_NATIONAL_LISTINGS_BY_ID.values()),
                },
                f,
                ensure_ascii=False,
            )
    except Exception:
        pass


def get_saved_api_keys() -> Dict[str, str]:
    if os.path.exists(API_KEYS_FILE):
        try:
            with open(API_KEYS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"idealista_key": "", "idealista_secret": ""}


def save_api_keys(idealista_key: str, idealista_secret: str) -> None:
    with open(API_KEYS_FILE, "w", encoding="utf-8") as f:
        json.dump(
            {
                "idealista_key": idealista_key.strip(),
                "idealista_secret": idealista_secret.strip(),
            },
            f,
        )


# Load cache on module import
load_national_cache()


async def resolve_city_metadata(query: str) -> Tuple[str, Dict[str, Any]]:
    q_clean = strip_accents(query or "España").strip()
    if (
        not q_clean
        or q_clean in ("espana", "toda espana", "spain", "all", "mapa", "nacional")
        or q_clean.startswith("espa")
        or "toda espa" in q_clean
    ):
        return "espana", SPANISH_CITIES_GAZETTEER["espana"]

    for key, data in SPANISH_CITIES_GAZETTEER.items():
        if key == "espana":
            continue
        if key in q_clean or q_clean in key or strip_accents(data["name"]) in q_clean:
            return key, data

    # Dynamic lookup via OpenStreetMap Nominatim for any other Spanish municipality
    q_slug = re.sub(r"[^a-z0-9]+", "-", q_clean).strip("-")
    q_under = re.sub(r"[^a-z0-9]+", "_", q_clean).strip("_")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": f"{query}, España",
                    "format": "jsonv2",
                    "limit": 1,
                    "addressdetails": 1,
                },
                headers={"User-Agent": "UmbralHabitabilidad/2.0 (Arquitectura Espana)"},
            )
            if resp.status_code == 200 and resp.json():
                top = resp.json()[0]
                lat = float(top["lat"])
                lon = float(top["lon"])
                addr = top.get("address", {})
                city_name = (
                    addr.get("city")
                    or addr.get("town")
                    or addr.get("village")
                    or addr.get("municipality")
                    or query.title()
                )
                prov_name = addr.get("province") or addr.get("state") or city_name
                c_slug = re.sub(r"[^a-z0-9]+", "-", strip_accents(city_name)).strip("-")
                p_slug = re.sub(r"[^a-z0-9]+", "-", strip_accents(prov_name)).strip("-")
                c_under = re.sub(r"[^a-z0-9]+", "_", strip_accents(city_name)).strip("_")

                return c_slug, {
                    "name": city_name,
                    "province": prov_name,
                    "slug": c_slug or q_slug,
                    "province_slug": p_slug or c_slug or q_slug,
                    "fc_slug": c_slug or q_slug,
                    "hb_prov_slug": p_slug or c_slug or q_slug,
                    "hb_city_slug": None,
                    "ps_slug": c_under or q_under,
                    "lat": lat,
                    "lon": lon,
                    "zoom": 13,
                }
    except Exception:
        pass

    return "valencia", SPANISH_CITIES_GAZETTEER["valencia"]


def build_portal_search_url(portal: Dict[str, Any], city_meta: Dict[str, Any], max_price: int = 130000) -> str:
    return portal["url_template"].format(
        slug=city_meta.get("slug", "valencia"),
        province_slug=city_meta.get("province_slug", "valencia"),
        fc_slug=city_meta.get("fc_slug", "valencia-capital"),
        hb_prov_slug=city_meta.get("hb_prov_slug", "valencia"),
        ps_slug=city_meta.get("ps_slug", "valencia_capital"),
        max_price=max_price,
    )


async def ensure_city_scraped(city_key: str, city_meta: Dict[str, Any], force_refresh: bool = False) -> int:
    """Scrapes real apartments for `city_key` if not yet cached (or if `force_refresh=True`)."""
    global _NATIONAL_LISTINGS_BY_ID, _SCRAPED_CITY_KEYS
    if city_key == "espana":
        return len(_NATIONAL_LISTINGS_BY_ID)

    if city_key in _SCRAPED_CITY_KEYS and not force_refresh and len(_NATIONAL_LISTINGS_BY_ID) > 30:
        return 0

    scraped = await scrape_city_real_listings(
        city_name=city_meta["name"],
        province_name=city_meta["province"],
        fc_slug=city_meta["fc_slug"],
        hb_prov_slug=city_meta["hb_prov_slug"],
        hb_city_slug=city_meta.get("hb_city_slug"),
        ps_slug=city_meta["ps_slug"],
        max_price=130000,
        deep=True,
    )

    # Also check if user configured Official Idealista OAuth2 API keys
    keys = get_saved_api_keys()
    if keys.get("idealista_key") and keys.get("idealista_secret"):
        id_items = await fetch_idealista_official_api(
            keys["idealista_key"],
            keys["idealista_secret"],
            city_meta["lat"],
            city_meta["lon"],
            distance_meters=15000,
            max_price=130000,
        )
        scraped.extend(id_items)

    added = 0
    for item in scraped:
        item["city_key"] = city_key
        _NATIONAL_LISTINGS_BY_ID[item["id"]] = item
        added += 1

    if added > 0:
        _SCRAPED_CITY_KEYS.add(city_key)
        save_national_cache()

    return added


async def harvest_all_spain(cities_subset: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Scrapes real listings across all configured Spanish cities concurrently and persists them
    to `spain_real_listings_cache.json` so the full Map of Spain has hundreds of real flats.
    """
    target_keys = cities_subset or [k for k in SPANISH_CITIES_GAZETTEER.keys() if k != "espana"]
    total_added = 0
    # Scrape in batches of 4 cities to be polite and fast
    for i in range(0, len(target_keys), 4):
        batch = target_keys[i : i + 4]
        tasks = [
            ensure_city_scraped(k, SPANISH_CITIES_GAZETTEER[k], force_refresh=True)
            for k in batch
        ]
        counts = await asyncio.gather(*tasks, return_exceptions=True)
        for c in counts:
            if isinstance(c, int):
                total_added += c
    return {
        "cities_harvested": len(target_keys),
        "total_cached_listings": len(_NATIONAL_LISTINGS_BY_ID),
    }


def point_in_polygon(lat: float, lon: float, polygon: List[List[float]]) -> bool:
    """Ray-casting algorithm to check if (lat, lon) is inside a user-drawn polygon [[lat, lon], ...]."""
    n = len(polygon)
    if n < 3:
        return True
    inside = False
    p1_lat, p1_lon = polygon[0][0], polygon[0][1]
    for i in range(1, n + 1):
        p2_lat, p2_lon = polygon[i % n][0], polygon[i % n][1]
        if lon > min(p1_lon, p2_lon):
            if lon <= max(p1_lon, p2_lon):
                if lat <= max(p1_lat, p2_lat):
                    if p1_lon != p2_lon:
                        xinters = (lon - p1_lon) * (p2_lat - p1_lat) / (p2_lon - p1_lon) + p1_lat
                    if p1_lat == p2_lat or lat <= xinters:
                        inside = not inside
        p1_lat, p1_lon = p2_lat, p2_lon
    return inside


async def search_all_portals(
    query: str = "Valencia",
    max_price: int = 130000,
    min_price: int = 0,
    selected_portals: Optional[List[str]] = None,
    custom_excluded_words: Optional[List[str]] = None,
    allow_first_floor_no_elevator: bool = True,
    allow_ground_floor: bool = True,
    allow_occupied: bool = False,
    force_refresh: bool = False,
    bbox: Optional[List[float]] = None,  # [south, west, north, east]
    polygon: Optional[List[List[float]]] = None,  # [[lat, lon], ...]
) -> Dict[str, Any]:
    """
    Returns 100% REAL scraped apartments across Spain or for the target city,
    filtered by our strict Habitability & Anti-Investor Engine, plus optional
    map bounding box (`bbox`) or freehand-drawn `polygon`.
    """
    t0 = time.time()
    city_key, city_meta = await resolve_city_metadata(query)

    # Ensure city (or initial cache) is populated with real listings
    if city_key == "espana":
        if len(_NATIONAL_LISTINGS_BY_ID) < 100:
            await harvest_all_spain(["valencia", "madrid", "alicante", "sevilla", "zaragoza", "malaga"])
    else:
        await ensure_city_scraped(city_key, city_meta, force_refresh=force_refresh)

    all_cached = list(_NATIONAL_LISTINGS_BY_ID.values())

    # If user is not filtering by explicit bbox/polygon and chose a specific city, filter by distance to that city (~35km radius)
    if city_key != "espana" and not bbox and not polygon:
        clat, clon = city_meta["lat"], city_meta["lon"]
        combined_raw = [
            x for x in all_cached
            if x.get("city_key") == city_key
            or (abs(float(x.get("lat", 0)) - clat) < 0.32 and abs(float(x.get("lon", 0)) - clon) < 0.38)
        ]
    else:
        combined_raw = all_cached

    # Filter by map bounding box [south, west, north, east] if provided
    if bbox and len(bbox) == 4:
        south, west, north, east = bbox
        combined_raw = [
            x for x in combined_raw
            if south <= float(x.get("lat", 0)) <= north and west <= float(x.get("lon", 0)) <= east
        ]

    # Filter by freehand drawn polygon if provided
    if polygon and len(polygon) >= 3:
        combined_raw = [
            x for x in combined_raw
            if point_in_polygon(float(x.get("lat", 0)), float(x.get("lon", 0)), polygon)
        ]

    if selected_portals:
        combined_raw = [x for x in combined_raw if x["portal_id"] in selected_portals]

    approved: List[Dict[str, Any]] = []
    rejected: List[Dict[str, Any]] = []
    rejection_breakdown: Dict[str, int] = {
        "OCUPADO / SIN POSESIÓN": 0,
        "NUDA PROPIEDAD / USUFRUCTO": 0,
        "ALQUILADO / CON INQUILINO": 0,
        "SOLO INVERSORES / SUBASTA": 0,
        "NO VIVIENDA / LOCAL COMERCIAL": 0,
        "ALTURA SIN ASCENSOR": 0,
        "SUPERA 130.000 €": 0,
        "INFERIOR AL MÍNIMO": 0,
    }

    use_default_eval_cache = (
        max_price == 130000
        and min_price <= 0
        and not allow_occupied
        and not custom_excluded_words
        and allow_first_floor_no_elevator
        and allow_ground_floor
    )

    for item in combined_raw:
        iid = item["id"]
        if use_default_eval_cache and "filter_audit" in item:
            evaluated = item
        elif use_default_eval_cache and iid in _PRE_EVALUATED_CACHE:
            evaluated = _PRE_EVALUATED_CACHE[iid]
        elif "filter_audit" in item and not custom_excluded_words:
            # Fast dynamic adjustment when user moves min/max price sliders or toggles 1º/Bajo/Ocupado pills
            base_audit = item["filter_audit"]
            mode = base_audit.get("accessibility_mode")
            rejs = [
                r for r in (base_audit.get("rejections") or [])
                if not r["category"].startswith("SUPERA") and not r["category"].startswith("INFERIOR")
            ]
            if allow_occupied:
                rejs = [r for r in rejs if r["category"] != "OCUPADO / SIN POSESIÓN"]
            p_val = item.get("price", 0)
            if p_val > max_price:
                rejs.append({
                    "category": "SUPERA 130.000 €",
                    "reason": f"Supera el tope seleccionado de {max_price} €",
                    "snippet": f"{p_val} €",
                })
            elif min_price > 0 and p_val < min_price:
                rejs.append({
                    "category": "INFERIOR AL MÍNIMO",
                    "reason": f"Precio ({p_val} €) inferior al mínimo seleccionado de {min_price} € (filtro Aval ICO / valor mínimo)",
                    "snippet": f"{p_val} €",
                })
            if not allow_first_floor_no_elevator and mode == "first_floor_walkup":
                rejs.append({
                    "category": "ALTURA SIN ASCENSOR",
                    "reason": "1ª planta sin ascensor desactivada por el usuario",
                    "snippet": "1ª Planta sin ascensor",
                })
            if not allow_ground_floor and mode == "ground":
                rejs.append({
                    "category": "ALTURA SIN ASCENSOR",
                    "reason": "Planta baja desactivada por el usuario",
                    "snippet": "Planta Baja",
                })
            evaluated = dict(item)
            evaluated["filter_audit"] = dict(base_audit, passed=(len(rejs) == 0), rejections=rejs)
        else:
            evaluated = evaluate_listing(
                item,
                max_price=max_price,
                min_price=min_price,
                custom_excluded_words=custom_excluded_words,
                allow_first_floor_no_elevator=allow_first_floor_no_elevator,
                allow_ground_floor=allow_ground_floor,
                allow_occupied=allow_occupied,
            )
            if use_default_eval_cache:
                _PRE_EVALUATED_CACHE[iid] = evaluated

        if evaluated["filter_audit"]["passed"]:
            approved.append(evaluated)
        else:
            rejected.append(evaluated)
            for rej in evaluated["filter_audit"]["rejections"]:
                cat = rej["category"]
                rejection_breakdown[cat] = rejection_breakdown.get(cat, 0) + 1

    approved.sort(key=lambda x: (-x["filter_audit"]["habitability_score"], x["price"]))

    # Per-portal counts
    portal_counts_ok: Dict[str, int] = {}
    portal_counts_blocked: Dict[str, int] = {}
    for a in approved:
        pid = a["portal_id"]
        portal_counts_ok[pid] = portal_counts_ok.get(pid, 0) + 1
    for r in rejected:
        pid = r["portal_id"]
        portal_counts_blocked[pid] = portal_counts_blocked.get(pid, 0) + 1

    portal_statuses: List[Dict[str, Any]] = []
    for portal in PORTALS_CATALOG:
        pid = portal["id"]
        ok_c = portal_counts_ok.get(pid, 0)
        bad_c = portal_counts_blocked.get(pid, 0)
        search_url = build_portal_search_url(portal, city_meta, max_price)
        portal_statuses.append({
            "id": pid,
            "name": portal["name"],
            "domain": portal["domain"],
            "badge_color": portal["badge_color"],
            "tier": portal["tier"],
            "search_url": search_url,
            "approved_count": ok_c,
            "rejected_count": bad_c,
            "total_scanned": ok_c + bad_c,
        })

    elapsed_ms = round((time.time() - t0) * 1000)

    return {
        "city": city_meta,
        "city_key": city_key,
        "query": query,
        "max_price": max_price,
        "elapsed_ms": elapsed_ms,
        "national_total_cached": len(_NATIONAL_LISTINGS_BY_ID),
        "scraped_cities_count": len(_SCRAPED_CITY_KEYS),
        "portals": portal_statuses,
        "stats": {
            "total_scanned": len(combined_raw),
            "approved_count": len(approved),
            "rejected_count": len(rejected),
            "portals_queried": len(PORTALS_CATALOG),
            "avg_price": round(sum(x["price"] for x in approved) / len(approved)) if approved else 0,
            "avg_sqm": round(sum(x["sqm"] for x in approved) / len(approved)) if approved else 0,
            "avg_price_per_sqm": round(sum(x["price_per_sqm"] for x in approved) / len(approved)) if approved else 0,
            "by_accessibility": {
                "elevator": sum(1 for x in approved if x["filter_audit"]["accessibility_mode"] == "elevator"),
                "ground": sum(1 for x in approved if x["filter_audit"]["accessibility_mode"] == "ground"),
                "first_floor_walkup": sum(1 for x in approved if x["filter_audit"]["accessibility_mode"] == "first_floor_walkup"),
            },
            "rejection_breakdown": rejection_breakdown,
        },
        "approved": approved,
        "rejected": rejected[:450],
    }


async def inspect_custom_url_or_text(
    url: Optional[str] = None,
    raw_text: Optional[str] = None,
    price: Optional[int] = None,
    max_price: int = 130000,
) -> Dict[str, Any]:
    extracted_title = "Anuncio analizado en directo"
    extracted_desc = raw_text or ""
    extracted_price = price or 115000
    extracted_images: List[str] = []
    portal_detected = "Portal Externo"

    if url:
        for p in PORTALS_CATALOG:
            if p["domain"] in url.lower():
                portal_detected = p["name"]
                break
        sc, html = await asyncio.get_event_loop().run_in_executor(None, fetch_html_sync, url, 6.5)
        if html:
            clean_html = html.replace("\\/", "/")
            idealista_matches = re.findall(r"(id\.[\w\.]+\.image\.master/[a-zA-Z0-9/_-]+\.jpg)", clean_html)
            for img_id in list(dict.fromkeys(idealista_matches))[:12]:
                extracted_images.append(f"https://img3.idealista.com/blur/WEB_DETAIL-XL-L/0/{img_id}")

            soup = BeautifulSoup(html, "lxml")
            if soup.title and soup.title.string:
                extracted_title = soup.title.string.strip()
            meta_desc = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"property": "og:description"})
            if meta_desc and meta_desc.get("content"):
                extracted_desc = f"{extracted_desc} {meta_desc['content']}".strip()
            text_all = " ".join(soup.stripped_strings)
            pm = re.search(r"(\d{2,3}(?:\.\d{3})+)\s*€", text_all)
            if pm and not price:
                extracted_price = int(pm.group(1).replace(".", ""))

    listing_stub = {
        "id": f"custom-{int(time.time())}",
        "ref_code": "AUDIT-LIVE",
        "portal_id": "custom",
        "portal_name": portal_detected,
        "title": extracted_title,
        "description": extracted_desc or "Sin descripción adicional.",
        "price": extracted_price,
        "sqm": 70,
        "rooms": 2,
        "baths": 1,
        "url": url or "#",
        "images": extracted_images,
        "features": [],
    }
    return evaluate_listing(listing_stub, max_price=max_price)
