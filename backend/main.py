import os
from typing import List, Optional
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.portals_scraper import (
    PORTALS_CATALOG,
    SPANISH_CITIES_GAZETTEER,
    get_saved_api_keys,
    harvest_all_spain,
    inspect_custom_url_or_text,
    load_national_cache,
    save_api_keys,
    save_national_cache,
    search_all_portals,
)
from backend.spain_50_provinces import SPAIN_50_PROVINCES, scrape_province_pages

app = FastAPI(
    title="UMBRAL · Observatorio Multi-Portal de Vivienda Habitable ≤ 130.000 €",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    query: str = "Valencia"
    max_price: int = 130000
    min_price: int = 0
    selected_portals: Optional[List[str]] = None
    custom_excluded_words: Optional[List[str]] = None
    allow_first_floor_no_elevator: bool = True
    allow_ground_floor: bool = True
    allow_occupied: bool = False
    force_refresh: bool = False
    bbox: Optional[List[float]] = None
    polygon: Optional[List[List[float]]] = None


class CustomAuditRequest(BaseModel):
    url: Optional[str] = None
    raw_text: Optional[str] = None
    price: Optional[int] = None
    max_price: int = 130000


class ApiKeysRequest(BaseModel):
    idealista_key: str = ""
    idealista_secret: str = ""


class DeepScrapeZoneRequest(BaseModel):
    lat: float = 39.4699
    lon: float = -0.3763
    start_page: int = 4
    pages: int = 4
    max_price: int = 130000


@app.on_event("startup")
async def on_startup():
    load_national_cache()


@app.get("/api/portals")
async def get_portals():
    return {"portals": PORTALS_CATALOG}


@app.get("/api/cities")
async def get_cities():
    cities = [
        {
            "key": k,
            "name": v["name"],
            "province": v["province"],
            "lat": v["lat"],
            "lon": v["lon"],
            "zoom": v.get("zoom", 13),
        }
        for k, v in SPANISH_CITIES_GAZETTEER.items()
    ]
    return {"cities": cities}


@app.get("/api/search")
async def api_search_get(
    query: str = Query("Valencia"),
    max_price: int = Query(130000, ge=30000, le=500000),
    min_price: int = Query(0, ge=0, le=500000),
    allow_first_floor_no_elevator: bool = Query(True),
    allow_ground_floor: bool = Query(True),
    allow_occupied: bool = Query(False),
    force_refresh: bool = Query(False),
):
    load_national_cache()
    return await search_all_portals(
        query=query,
        max_price=max_price,
        min_price=min_price,
        allow_first_floor_no_elevator=allow_first_floor_no_elevator,
        allow_ground_floor=allow_ground_floor,
        allow_occupied=allow_occupied,
        force_refresh=force_refresh,
    )


@app.post("/api/search")
async def api_search_post(req: SearchRequest):
    load_national_cache()
    return await search_all_portals(
        query=req.query,
        max_price=req.max_price,
        min_price=req.min_price,
        selected_portals=req.selected_portals,
        custom_excluded_words=req.custom_excluded_words,
        allow_first_floor_no_elevator=req.allow_first_floor_no_elevator,
        allow_ground_floor=req.allow_ground_floor,
        allow_occupied=req.allow_occupied,
        force_refresh=req.force_refresh,
        bbox=req.bbox,
        polygon=req.polygon,
    )


@app.post("/api/harvest-spain")
async def api_harvest_spain():
    stats = await harvest_all_spain()
    return stats


@app.post("/api/deep-scrape-zone")
async def api_deep_scrape_zone(req: DeepScrapeZoneRequest):
    load_national_cache()
    # Find closest Spanish province to map center (req.lat, req.lon)
    best_prov = min(
        SPAIN_50_PROVINCES,
        key=lambda p: (p[4] - req.lat) ** 2 + (p[5] - req.lon) ** 2,
    )
    prov_name, fc_slug, hb_slug, ps_slug, _, _ = best_prov
    added = await scrape_province_pages(
        prov_name=prov_name,
        fc_slug=fc_slug,
        hb_slug=hb_slug,
        ps_slug=ps_slug,
        pages_per_portal=req.pages,
        start_page=req.start_page,
        max_price=req.max_price,
    )
    save_national_cache()
    return {
        "province": prov_name,
        "new_listings_added": added,
        "next_start_page": req.start_page + req.pages,
    }


@app.get("/api/api-keys")
async def api_get_keys():
    keys = get_saved_api_keys()
    return {
        "has_idealista_key": bool(keys.get("idealista_key") and keys.get("idealista_secret")),
        "idealista_key_preview": (keys.get("idealista_key")[:6] + "...") if keys.get("idealista_key") else "",
    }


@app.post("/api/api-keys")
async def api_save_keys(req: ApiKeysRequest):
    save_api_keys(req.idealista_key, req.idealista_secret)
    return {"ok": True, "has_idealista_key": bool(req.idealista_key and req.idealista_secret)}


@app.post("/api/audit-custom")
async def api_audit_custom(req: CustomAuditRequest):
    result = await inspect_custom_url_or_text(
        url=req.url,
        raw_text=req.raw_text,
        price=req.price,
        max_price=req.max_price,
    )
    return {"result": result}


FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
try:
    if not os.path.exists(FRONTEND_DIR):
        os.makedirs(FRONTEND_DIR, exist_ok=True)
except Exception:
    pass

if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
async def serve_index():
    idx_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(idx_path):
        return FileResponse(idx_path)
    return {"status": "ok", "app": "UMBRAL"}
