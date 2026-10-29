import re
import unicodedata
from typing import Dict, List, Any, Optional, Tuple


def normalize_text(text: str) -> str:
    if not text:
        return ""
    return text.lower().strip()


def strip_accents(text: str) -> str:
    if not text:
        return ""
    return "".join(
        c for c in unicodedata.normalize("NFD", text.lower())
        if unicodedata.category(c) != "Mn"
    )


EXCLUSION_PATTERNS: Dict[str, List[Tuple[str, str]]] = {
    "OCUPADO / SIN POSESIÓN": [
        (r"\binmueble\s+sin\s+posesi[oó]n\b", "Inmueble sin posesión"),
        (r"\bvivienda\s+sin\s+posesi[oó]n\b", "Vivienda sin posesión"),
        (r"\bsin\s+posesi[oó]n\b", "Sin posesión efectiva"),
        (r"\bdestinad[oa]\s+a\s+profesionales\b", "Destinado a profesionales (no consumidores)"),
        (r"\bno\s+consumidores\b", "Venta exclusiva a profesionales (no consumidores)"),
        (r"\bno\s+hay\s+posibilidad\s+de\s+visitar\b", "No hay posibilidad de visitar"),
        (r"\bcondiciones\s+promocionales\b", "Activo bancario con condiciones promocionales"),
        (r"\bocupad[oa]s?\b", "Mención de inmueble ocupado"),
        (r"\bokupad[oa]s?\b", "Mención de inmueble okupado"),
        (r"\bokupas?\b", "Mención de okupas"),
        (r"\bposesi[oó]n\s+no\s+disponible\b", "Posesión no disponible"),
        (r"\bno\s+se\s+puede\s+visitar\b", "No se puede visitar interiormente"),
        (r"\bimposible\s+visitar\b", "Imposible visitar"),
        (r"\bno\s+visitable\b", "Inmueble no visitable"),
        (r"\bsin\s+visita\s+interior\b", "Sin visita interior"),
        (r"\bsituaci[oó]n\s+posesoria\b", "Situación posesoria especial"),
        (r"\bproceso\s+de\s+desahucio\b", "En proceso de desahucio"),
        (r"\bocupaci[oó]n\s+ilegal\b", "Ocupación ilegal"),
        (r"\bocupad[oa]\s+ilegalmente\b", "Ocupado ilegalmente"),
        (r"\bocupad[oa]\s+por\s+terceros\b", "Ocupado por terceros sin título"),
        (r"\btapiad[oa]\b", "Inmueble tapiado"),
    ],
    "NUDA PROPIEDAD / USUFRUCTO": [
        (r"\bnuda\s+propiedad\b", "Venta de nuda propiedad"),
        (r"\bnula\s+propiedad\b", "Venta de nuda/nula propiedad"),
        (r"\busufructo\b", "Con usufructo vitalicio o temporal"),
        (r"\busufructuari[oa]s?\b", "Mantiene usufructuario"),
        (r"\brenta\s+vitalicia\b", "Modalidad de renta vitalicia"),
    ],
    "ALQUILADO / CON INQUILINO": [
        (r"\balquilad[oa]s?\b", "Inmueble actualmente alquilado"),
        (r"\bcon\s+inquilin[oa]s?\b", "Vivienda con inquilino"),
        (r"\bactualmente\s+arrendad[oa]\b", "Actualmente arrendado"),
        (r"\bvivienda\s+arrendada\b", "Vivienda arrendada"),
        (r"\bpiso\s+arrendado\b", "Piso arrendado"),
        (r"\bcontrato\s+de\s+alquiler\s+vigente\b", "Contrato de alquiler en vigor"),
        (r"\bcontrato\s+vigente\b", "Contrato de arrendamiento vigente"),
        (r"\bcon\s+renta\s+mensual\b", "Vendido con renta de alquiler"),
        (r"\bpercibiendo\s+renta\b", "Percibiendo renta de inquilino"),
        (r"\binquilino\s+solvente\b", "Con inquilino activo"),
        (r"\brentabilidad\s+desde\s+el\s+primer\s+d[ií]a\b", "Arrendado para rentabilidad"),
    ],
    "SOLO INVERSORES / SUBASTA": [
        (r"\bpara\s+inversor(es)?\b", "Orientado a inversores"),
        (r"\bsolo\s+inversor(es)?\b", "Exclusivo para inversores"),
        (r"\bideal\s+inversor(es)?\b", "Anunciado como ideal inversores"),
        (r"\boportunidad\s+inversor(es)?\b", "Oportunidad para inversores"),
        (r"\bespecial\s+inversor(es)?\b", "Especial inversores"),
        (r"\bperfil\s+inversor\b", "Solo perfil inversor"),
        (r"\bcesi[oó]n\s+de\s+remate\b", "Cesión de remate judicial"),
        (r"\bcesi[oó]n\s+de\s+cr[eé]dito\b", "Cesión de crédito"),
        (r"\bsubasta\s+judicial\b", "Subasta judicial"),
        (r"\bactivo\s+bancario\s+sin\s+posesi[oó]n\b", "Activo bancario sin posesión"),
        (r"\bno\s+hipotecable\b", "Inmueble no hipotecable"),
    ],
    "NO VIVIENDA / LOCAL COMERCIAL": [
        (r"\blocal\s+comercial\b", "Registrado como local comercial, no vivienda"),
        (r"\buso\s+de\s+local\b", "Tiene uso de local en el Registro de la Propiedad"),
        (r"\bno\s+es\s+vivienda\b", "El anuncio indica expresamente que no es vivienda"),
        (r"\bno\s+permite\s+empadronamiento\b", "No permite empadronamiento"),
        (r"\bsin\s+empadronamiento\b", "No permite empadronamiento"),
        (r"\bno\s+se\s+puede\s+empadronar\b", "No permite empadronarse"),
        (r"\bno\s+permite\s+uso\s+residencial\b", "No permite uso residencial habitual"),
        (r"\bsin\s+uso\s+residencial\b", "Carece de uso residencial"),
        (r"\buso\s+comercial\b", "Local con uso comercial, no residencial"),
        (r"\buso\s+terciario\b", "Calificación urbanística de uso terciario/oficina"),
        (r"\bregistrad[oa]\s+como\s+local\b", "Registrado como local comercial"),
        (r"\bsin\s+cambio\s+de\s+uso\b", "Sin posibilidad de cambio de uso a vivienda"),
        (r"\bno\s+admite\s+cambio\s+de\s+uso\b", "No admite cambio de uso a vivienda"),
        (r"\bno\s+tiene\s+cedula\b", "Carece de cédula de habitabilidad"),
        (r"\bno\s+dispone\s+de\s+cedula\b", "No dispone de cédula de habitabilidad"),
        (r"\bsin\s+cedula\s+de\s+habitabilidad\b", "Sin cédula de habitabilidad"),
    ],
}

SAFE_CONTEXT_PATTERNS = [
    r"libre\s+de\s+inquilinos",
    r"sin\s+inquilinos",
    r"no\s+esta\s+alquilad[oa]",
    r"no\s+esta\s+ocupad[oa]",
    r"plena\s+propiedad",
    r"no\s+es\s+nuda\s+propiedad",
]

EXPLICIT_WALKUP_PAT = (
    r"\b(segund[oa]|tercer[oa]|cuart[oa]|quint[oa]|sext[oa]|[2-9][ºªo]?)\s+(planta|piso)\b[^\.\n;]{0,60}\b(sin\s+ascensor|no\s+tiene\s+ascensor|no\s+dispone\s+de\s+ascensor)\b"
    r"|\b(sin\s+ascensor|no\s+tiene\s+ascensor|no\s+dispone\s+de\s+ascensor)\b[^\.\n;]{0,60}\b(segund[oa]|tercer[oa]|cuart[oa]|quint[oa]|sext[oa]|[2-9][ºªo]?)\s+(planta|piso)\b"
    r"|\b(segund[oa]|tercer[oa]|cuart[oa]|quint[oa]|[2-9][ºªo]?)\s+(sin\s+ascensor|no\s+tiene\s+ascensor|no\s+dispone\s+de\s+ascensor)\b"
    r"|\bplanta\s+([2-9]|segunda|tercera|cuarta|quinta)\b[^\.\n;]{0,50}\b(sin\s+ascensor|no\s+tiene\s+ascensor|no\s+dispone\s+de\s+ascensor)\b"
)


def extract_floor_and_elevator(
    title: str,
    description: str,
    raw_floor: Optional[Any] = None,
    raw_elevator: Optional[bool] = None,
    features: Optional[List[str]] = None,
) -> Dict[str, Any]:
    combined = f"{title} {description} {' '.join(str(f) for f in (features or []))}"
    clean = strip_accents(combined)
    floor_str = strip_accents(str(raw_floor if raw_floor is not None else ""))

    # PRIORITY 1: Check for explicit 2nd floor or higher walkup in text.
    # Agencies often fraudulently label listings as 'Planta baja' or '1ª planta' in portal metadata,
    # but confess 'segunda planta de un edificio sin ascensor' in the text body.
    # This explicit statement must override metadata completely!
    m_walkup = re.search(EXPLICIT_WALKUP_PAT, clean)
    if m_walkup:
        matched_str = m_walkup.group(0)
        floor_num = 2
        if any(w in matched_str for w in ["tercer", "3", "3ª", "3º"]):
            floor_num = 3
        elif any(w in matched_str for w in ["cuart", "4", "4ª", "4º"]):
            floor_num = 4
        elif any(w in matched_str for w in ["quint", "5", "5ª", "5º"]):
            floor_num = 5
        elif any(w in matched_str for w in ["sext", "6", "6ª", "6º"]):
            floor_num = 6
        return {
            "floor_num": floor_num,
            "floor_label": f"{floor_num}ª Planta",
            "has_elevator": False,
            "elevator_explicit": True,
            "explicit_walkup_match": matched_str,
        }

    has_elevator: Optional[bool] = raw_elevator
    if (
        re.search(r"\bsin\s+ascensor\b|\bno\s+dispone\s+de\s+ascensor\b|\bno\s+tiene\s+ascensor\b", clean)
        or "sin ascensor" in floor_str
    ):
        has_elevator = False
    elif (
        re.search(
            r"\bcon\s+ascensor\b|\bdispone\s+de\s+ascensor\b|\bedificio\s+con\s+ascensor\b|\bfinca\s+con\s+ascensor\b|\bascensor\s+nuevo\b|\bascensor\s+a\s+cota\s+cero\b|\btiene\s+ascensor\b",
            clean,
        )
        or "con ascensor" in floor_str
    ):
        has_elevator = True
    elif has_elevator is None:
        for feat in (features or []):
            f_clean = strip_accents(str(feat))
            if "sin ascensor" in f_clean:
                has_elevator = False
                break
            elif "ascensor" in f_clean:
                has_elevator = True

    floor_num: Optional[int] = None
    floor_label = "Planta verificada"

    if isinstance(raw_floor, int):
        floor_num = raw_floor
        floor_label = "Planta Baja" if floor_num == 0 else f"{floor_num}ª Planta"
    elif floor_str:
        if any(k in floor_str for k in ["bajo", "planta baja", "entresuelo", "entreplanta", "planta 0", "casa", "chalet"]):
            floor_num = 0
            floor_label = "Planta Baja"
        else:
            m = re.search(r"(\d+)", floor_str)
            if m:
                floor_num = int(m.group(1))
                floor_label = f"{floor_num}ª Planta"
            elif "atico" in floor_str:
                floor_num = 5
                floor_label = "Ático"

    if floor_num is None:
        if re.search(
            r"\b(planta\s+baja|piso\s+bajo|bajo\s+exterior|bajo\s+interior|bajo\s+con|bajo\s+reformado|bajo\s+en\s+venta|vivienda\s+en\s+planta\s+baja|entresuelo|entreplanta)\b",
            clean,
        ):
            floor_num = 0
            floor_label = "Planta Baja"
        elif re.search(
            r"\b(primer\s+piso|primera\s+planta|1[ºªo]\s+sin\s+ascensor|1[ºªo]\s+con\s+ascensor|1[ºª]\s*planta|planta\s+1\b|piso\s+1\b|primero\s+sin\s+ascensor)\b",
            clean,
        ):
            floor_num = 1
            floor_label = "1ª Planta"
        else:
            m_planta = re.search(
                r"\b([2-9])[ºª]\s*planta\b|\bplanta\s+([2-9])\b|\b(segund[oa]|tercer[oa]|cuart[oa]|quint[oa])\s+(planta|piso)\b",
                clean,
            )
            if m_planta:
                word_map = {"segund": 2, "tercer": 3, "cuart": 4, "quint": 5}
                if m_planta.group(1):
                    floor_num = int(m_planta.group(1))
                elif m_planta.group(2):
                    floor_num = int(m_planta.group(2))
                elif m_planta.group(3):
                    prefix = m_planta.group(3)[:6]
                    floor_num = word_map.get(prefix, 2)
                floor_label = f"{floor_num}ª Planta"
            elif re.search(r"\batico\b", clean):
                floor_num = 5
                floor_label = "Ático"
            elif re.search(r"\b(casa\s+de\s+pueblo|casa\s+baja|casa\s+en\s+venta|chalet|adosado|planta\s+unica|duplex)\b", clean):
                floor_num = 0
                floor_label = "Bajo / Casa"

    return {
        "floor_num": floor_num,
        "floor_label": floor_label,
        "has_elevator": bool(has_elevator) if has_elevator is not None else False,
        "elevator_explicit": has_elevator is not None,
    }

    return {
        "floor_num": floor_num,
        "floor_label": floor_label,
        "has_elevator": bool(has_elevator) if has_elevator is not None else False,
        "elevator_explicit": has_elevator is not None,
    }


def evaluate_listing(
    listing: Dict[str, Any],
    max_price: int = 130000,
    min_price: int = 0,
    custom_excluded_words: Optional[List[str]] = None,
    allow_first_floor_no_elevator: bool = True,
    allow_ground_floor: bool = True,
    allow_occupied: bool = False,
) -> Dict[str, Any]:
    title = str(listing.get("title", "") or "")
    description = str(listing.get("description", "") or "")
    price = int(listing.get("price", 0) or 0)
    features = listing.get("features") or []

    full_text = f"{title}. {description}. {' '.join(str(f) for f in features)}"
    clean_text = strip_accents(full_text)

    scrubbed_text = clean_text
    for safe_pat in SAFE_CONTEXT_PATTERNS:
        scrubbed_text = re.sub(safe_pat, " ", scrubbed_text)

    rejections: List[Dict[str, str]] = []
    has_occupied_warning = False
    occupied_snippet = ""

    if price <= 0:
        rejections.append({
            "category": "PRECIO INVÁLIDO",
            "reason": "Sin precio numérico válido",
            "snippet": "Precio a consultar",
        })
    elif price > max_price:
        rejections.append({
            "category": "SUPERA 130.000 €",
            "reason": f"Precio ({price:,.0f} €) superior al límite de {max_price:,.0f} €".replace(",", "."),
            "snippet": f"{price:,.0f} €".replace(",", "."),
        })
    elif min_price > 0 and price < min_price:
        rejections.append({
            "category": "INFERIOR AL MÍNIMO",
            "reason": f"Precio ({price:,.0f} €) inferior al mínimo de {min_price:,.0f} € (filtro Aval ICO / valor mínimo)".replace(",", "."),
            "snippet": f"{price:,.0f} €".replace(",", "."),
        })

    for category, patterns in EXCLUSION_PATTERNS.items():
        for regex_pat, label in patterns:
            match = re.search(regex_pat, scrubbed_text)
            if match:
                start = max(0, match.start() - 28)
                end = min(len(full_text), match.end() + 28)
                snippet = full_text[start:end].strip()
                if category == "OCUPADO / SIN POSESIÓN" and allow_occupied:
                    has_occupied_warning = True
                    occupied_snippet = snippet
                    break
                rejections.append({
                    "category": category,
                    "reason": label,
                    "matched_term": match.group(0),
                    "snippet": f"«...{snippet}...»",
                })
                break

    if custom_excluded_words:
        for word in custom_excluded_words:
            w_clean = strip_accents(word.strip())
            if not w_clean:
                continue
            m = re.search(rf"\b{re.escape(w_clean)}\b", scrubbed_text)
            if m:
                rejections.append({
                    "category": "FILTRO PERSONALIZADO",
                    "reason": f"Contiene término excluido: '{word}'",
                    "matched_term": word,
                    "snippet": f"«...{word}...»",
                })

    vertical = extract_floor_and_elevator(
        title=title,
        description=description,
        raw_floor=listing.get("floor"),
        raw_elevator=listing.get("has_elevator"),
        features=features,
    )
    floor_num = vertical["floor_num"]
    has_elevator = vertical["has_elevator"]
    floor_label = vertical["floor_label"]

    accessibility_ok = False
    accessibility_badge = ""
    accessibility_mode = ""

    if vertical.get("explicit_walkup_match"):
        matched_str = vertical["explicit_walkup_match"]
        idx = clean_text.find(matched_str)
        if idx != -1:
            start = max(0, idx - 25)
            end = min(len(full_text), idx + len(matched_str) + 25)
            snippet = full_text[start:end].strip()
        else:
            snippet = matched_str
        accessibility_ok = False
        accessibility_badge = f"{floor_label.upper()} · SIN ASCENSOR"
        rejections.append({
            "category": "ALTURA SIN ASCENSOR",
            "reason": f"El texto del anuncio indica expresamente {floor_label} sin ascensor (solo se admite Bajo, 1º sin ascensor, o con ascensor)",
            "matched_term": matched_str,
            "snippet": f"«...{snippet}...»",
        })
    elif has_elevator:
        accessibility_ok = True
        fl_txt = floor_label.upper() if floor_num is not None else "CON ASCENSOR"
        accessibility_badge = f"{fl_txt} · CON ASCENSOR" if "ASCENSOR" not in fl_txt else fl_txt
        accessibility_mode = "elevator"
    elif floor_num == 0 and allow_ground_floor:
        accessibility_ok = True
        accessibility_badge = "PLANTA BAJA · ACCESO DIRECTO"
        accessibility_mode = "ground"
    elif floor_num == 1 and allow_first_floor_no_elevator:
        accessibility_ok = True
        accessibility_badge = "1ª PLANTA · SIN ASCENSOR (ADMITIDO)"
        accessibility_mode = "first_floor_walkup"
    else:
        accessibility_ok = False
        if floor_num is not None and floor_num >= 2:
            accessibility_badge = f"{floor_label.upper()} · SIN ASCENSOR"
            rejections.append({
                "category": "ALTURA SIN ASCENSOR",
                "reason": f"Es un {floor_label} sin ascensor acreditado (solo se admite Bajo, 1º sin ascensor, o con ascensor)",
                "snippet": f"{floor_label} sin ascensor",
            })
        else:
            accessibility_badge = "SIN ASCENSOR VERIFICADO"
            rejections.append({
                "category": "ALTURA SIN ASCENSOR",
                "reason": "Anuncio sin ascensor acreditado ni planta baja/1ª",
                "snippet": f"{floor_label} · sin ascensor",
            })

    passed = len(rejections) == 0

    sqm = max(int(listing.get("sqm") or 60), 20)
    price_per_sqm = round(price / sqm) if price > 0 else 0
    score = 80
    if has_elevator:
        score += 10
    elif floor_num == 0:
        score += 7
    elif floor_num == 1:
        score += 5
    if 0 < price <= 105000:
        score += 5
    if sqm >= 65:
        score += 5
    score = min(99, max(15, score if passed else 20))

    enriched = dict(listing)
    enriched["floor_num"] = floor_num if floor_num is not None else (2 if has_elevator else 0)
    enriched["floor_label"] = floor_label
    enriched["has_elevator"] = has_elevator
    enriched["price_per_sqm"] = price_per_sqm
    verified_tags = [
        "ANUNCIO REAL VERIFICADO",
        "⚠️ SIN POSESIÓN (OCUPADO)" if has_occupied_warning else "POSESIÓN LIBRE",
        "SIN INQUILINOS",
        accessibility_badge,
        f"≤ {max_price // 1000}K €",
    ] if passed else [r["category"] for r in rejections]

    enriched["filter_audit"] = {
        "passed": passed,
        "accessibility_ok": accessibility_ok,
        "accessibility_badge": accessibility_badge,
        "accessibility_mode": accessibility_mode,
        "has_occupied_warning": has_occupied_warning,
        "habitability_score": score,
        "rejections": rejections,
        "verified_tags": verified_tags,
    }
    return enriched
