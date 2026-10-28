import asyncio
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Tuple

from backend.portals_scraper import (
    CACHE_FILE,
    _NATIONAL_LISTINGS_BY_ID,
    _SCRAPED_CITY_KEYS,
    load_national_cache,
    save_national_cache,
)
from backend.real_scrapers import (
    fetch_html_sync,
    parse_fotocasa_html,
    parse_habitaclia_html,
    parse_pisos_com_html,
)

# All 50 Provinces of Spain (name, fotocasa_slug, habitaclia_slug, pisos_slug, lat, lon)
SPAIN_50_PROVINCES: List[Tuple[str, str, str, str, float, float]] = [
    ("Valencia", "valencia-provincia", "valencia", "valencia", 39.4699, -0.3763),
    ("Madrid", "madrid-provincia", "madrid", "madrid", 40.4168, -3.7038),
    ("Alicante", "alicante-provincia", "alicante", "alicante", 38.3452, -0.4810),
    ("Sevilla", "sevilla-provincia", "sevilla", "sevilla", 37.3891, -5.9845),
    ("Zaragoza", "zaragoza-provincia", "zaragoza", "zaragoza", 41.6488, -0.8891),
    ("Málaga", "malaga-provincia", "malaga", "malaga", 36.7213, -4.4214),
    ("Murcia", "murcia-provincia", "murcia", "murcia", 37.9922, -1.1307),
    ("Granada", "granada-provincia", "granada", "granada", 37.1773, -3.5986),
    ("Barcelona", "barcelona-provincia", "barcelona", "barcelona", 41.3874, 2.1686),
    ("Cádiz", "cadiz-provincia", "cadiz", "cadiz", 36.5271, -6.2886),
    ("Tarragona", "tarragona-provincia", "tarragona", "tarragona", 41.1189, 1.2445),
    ("Castellón", "castellon-provincia", "castellon", "castellon", 39.9864, -0.0513),
    ("Toledo", "toledo-provincia", "toledo", "toledo", 39.8628, -4.0273),
    ("Almería", "almeria-provincia", "almeria", "almeria", 36.8340, -2.4637),
    ("Córdoba", "cordoba-provincia", "cordoba", "cordoba", 37.8882, -4.7794),
    ("Valladolid", "valladolid-provincia", "valladolid", "valladolid", 41.6523, -4.7245),
    ("Asturias", "asturias-provincia", "asturias", "asturias", 43.3614, -5.8593),
    ("Pontevedra", "pontevedra-provincia", "pontevedra", "pontevedra", 42.4310, -8.6444),
    ("A Coruña", "a-coruna-provincia", "a-coruna", "a_coruna", 43.3623, -8.4115),
    ("Vizcaya", "vizcaya-provincia", "vizcaya", "vizcaya", 43.2630, -2.9350),
    ("Cantabria", "cantabria-provincia", "cantabria", "cantabria", 43.4623, -3.8099),
    ("Huelva", "huelva-provincia", "huelva", "huelva", 37.2614, -6.9447),
    ("Jaén", "jaen-provincia", "jaen", "jaen", 37.7796, -3.7849),
    ("Badajoz", "badajoz-provincia", "badajoz", "badajoz", 38.8794, -6.9707),
    ("Cáceres", "caceres-provincia", "caceres", "caceres", 39.4753, -6.3724),
    ("Ciudad Real", "ciudad-real-provincia", "ciudad-real", "ciudad_real", 38.9848, -3.9274),
    ("Albacete", "albacete-provincia", "albacete", "albacete", 38.9943, -1.8585),
    ("León", "leon-provincia", "leon", "leon", 42.5987, -5.5671),
    ("Salamanca", "salamanca-provincia", "salamanca", "salamanca", 40.9701, -5.6635),
    ("Burgos", "burgos-provincia", "burgos", "burgos", 42.3440, -3.6969),
    ("Girona", "girona-provincia", "girona", "girona", 41.9794, 2.8214),
    ("Lleida", "lleida-provincia", "lleida", "lleida", 41.6176, 0.6200),
    ("La Rioja", "la-rioja-provincia", "la-rioja", "la_rioja", 42.4627, -2.4450),
    ("Navarra", "navarra-provincia", "navarra", "navarra", 42.8125, -1.6458),
    ("Guadalajara", "guadalajara-provincia", "guadalajara", "guadalajara", 40.6337, -3.1674),
    ("Cuenca", "cuenca-provincia", "cuenca", "cuenca", 40.0704, -2.1374),
    ("Huesca", "huesca-provincia", "huesca", "huesca", 42.1401, -0.4089),
    ("Teruel", "teruel-provincia", "teruel", "teruel", 40.3456, -1.1065),
    ("Lugo", "lugo-provincia", "lugo", "lugo", 43.0097, -7.5568),
    ("Ourense", "ourense-provincia", "ourense", "ourense", 42.3358, -7.8639),
    ("Palencia", "palencia-provincia", "palencia", "palencia", 42.0096, -4.5288),
    ("Zamora", "zamora-provincia", "zamora", "zamora", 41.5035, -5.7468),
    ("Ávila", "avila-provincia", "avila", "avila", 40.6567, -4.6812),
    ("Segovia", "segovia-provincia", "segovia", "segovia", 40.9429, -4.1088),
    ("Soria", "soria-provincia", "soria", "soria", 41.7665, -2.4790),
    ("Álava", "alava-provincia", "alava", "alava", 42.8467, -2.6716),
    ("Guipúzcoa", "guipuzcoa-provincia", "guipuzcoa", "guipuzcoa", 43.3183, -1.9812),
    ("Baleares", "illes-balears-provincia", "illes-balears", "islas_baleares", 39.5696, 2.6502),
    ("Las Palmas", "las-palmas-provincia", "las-palmas", "las_palmas", 28.1235, -15.4363),
    ("Santa Cruz de Tenerife", "santa-cruz-de-tenerife-provincia", "santa-cruz-de-tenerife", "santa_cruz_de_tenerife", 28.4636, -16.2518),
]

_HARVEST_EXECUTOR = ThreadPoolExecutor(max_workers=24)


async def scrape_province_pages(
    prov_name: str,
    fc_slug: str,
    hb_slug: str,
    ps_slug: str,
    pages_per_portal: int = 3,
    start_page: int = 1,
    max_price: int = 130000,
) -> int:
    """
    Scrapes multiple pages of Fotocasa, Pisos.com (con-ascensor + general), and Habitaclia
    for a single province and merges them into `_NATIONAL_LISTINGS_BY_ID`.
    """
    urls: List[Tuple[str, str, bool]] = []
    for p in range(start_page, start_page + pages_per_portal):
        if p == 1:
            urls.append(("fc", f"https://www.fotocasa.es/es/comprar/viviendas/{fc_slug}/todas-las-zonas/l?maxPrice={max_price}", False))
            urls.append(("ps_elev", f"https://www.pisos.com/venta/pisos-{ps_slug}/hasta-{max_price}/con-ascensor/", True))
            urls.append(("ps_gen", f"https://www.pisos.com/venta/pisos-{ps_slug}/hasta-{max_price}/", False))
            urls.append(("hb", f"https://www.habitaclia.com/comprar/viviendas/{hb_slug}-provincia/s?maxPrice={max_price}", False))
            urls.append(("hb_bajos", f"https://www.habitaclia.com/comprar/bajos/{hb_slug}-provincia/s?maxPrice={max_price}", False))
        else:
            urls.append(("fc", f"https://www.fotocasa.es/es/comprar/viviendas/{fc_slug}/todas-las-zonas/l/{p}?maxPrice={max_price}", False))
            urls.append(("ps_elev", f"https://www.pisos.com/venta/pisos-{ps_slug}/hasta-{max_price}/con-ascensor/{p}/", True))
            urls.append(("ps_gen", f"https://www.pisos.com/venta/pisos-{ps_slug}/hasta-{max_price}/{p}/", False))

    loop = asyncio.get_event_loop()
    tasks = [
        loop.run_in_executor(_HARVEST_EXECUTOR, fetch_html_sync, u, 7.5)
        for _, u, _ in urls
    ]
    responses = await asyncio.gather(*tasks, return_exceptions=True)

    added = 0
    for idx, (kind, url, force_elev) in enumerate(urls):
        res = responses[idx]
        if not isinstance(res, tuple):
            continue
        sc, html = res
        if sc != 200 or not html:
            continue
        parsed: List[Dict[str, Any]] = []
        if kind == "fc":
            parsed = parse_fotocasa_html(html, prov_name, prov_name)
        elif kind.startswith("hb"):
            parsed = parse_habitaclia_html(html, prov_name, prov_name)
        elif kind.startswith("ps"):
            parsed = parse_pisos_com_html(html, prov_name, prov_name, force_elevator=force_elev)

        for item in parsed:
            iid = item["id"]
            if iid in _NATIONAL_LISTINGS_BY_ID:
                if item.get("has_elevator") is True:
                    _NATIONAL_LISTINGS_BY_ID[iid]["has_elevator"] = True
                    if "Con ascensor" not in _NATIONAL_LISTINGS_BY_ID[iid]["features"]:
                        _NATIONAL_LISTINGS_BY_ID[iid]["features"].append("Con ascensor")
            else:
                item["city_key"] = hb_slug
                _NATIONAL_LISTINGS_BY_ID[iid] = item
                added += 1

    _SCRAPED_CITY_KEYS.add(hb_slug)
    return added


async def harvest_all_50_provinces(pages_per_portal: int = 2) -> Dict[str, Any]:
    """
    Harvests all 50 provinces of Spain in parallel batches and saves incrementally to disk.
    """
    load_national_cache()
    t0 = time.time()
    batch_size = 5
    for i in range(0, len(SPAIN_50_PROVINCES), batch_size):
        batch = SPAIN_50_PROVINCES[i : i + batch_size]
        tasks = [
            scrape_province_pages(
                prov_name=b[0],
                fc_slug=b[1],
                hb_slug=b[2],
                ps_slug=b[3],
                pages_per_portal=pages_per_portal,
                start_page=1,
            )
            for b in batch
        ]
        await asyncio.gather(*tasks, return_exceptions=True)
        save_national_cache()
        print(
            f"[+] Progreso Nacional ({min(i + batch_size, len(SPAIN_50_PROVINCES))}/50 provincias): "
            f"{len(_NATIONAL_LISTINGS_BY_ID)} pisos reales indexados..."
        )

    elapsed = round(time.time() - t0, 1)
    return {
        "provinces_harvested": len(SPAIN_50_PROVINCES),
        "total_cached_listings": len(_NATIONAL_LISTINGS_BY_ID),
        "elapsed_seconds": elapsed,
    }

