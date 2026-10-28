import uvicorn

if __name__ == "__main__":
    print("=" * 72)
    print("  UMBRAL · Observatorio Multi-Portal de Vivienda Habitable (<= 130.000 €)")
    print("  Abriendo servidor en: http://localhost:8050")
    print("=" * 72)
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8050, reload=False)

