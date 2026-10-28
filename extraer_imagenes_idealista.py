from playwright.sync_api import sync_playwright
import os
import requests
import time
import re

def extraer_imagenes(url: str):
    print("[*] Abriendo el navegador...")
    
    with sync_playwright() as p:
        # Abrimos el navegador en modo visible
        browser = p.chromium.launch(headless=False, args=['--disable-blink-features=AutomationControlled'])
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={'width': 1280, 'height': 720}
        )
        page = context.new_page()
        
        print(f"[*] Navegando a {url}")
        # Hacemos goto pero atrapamos el error de timeout por si DataDome corta la conexión
        try:
            page.goto(url, timeout=15000)
        except Exception:
            pass
        
        print("\n" + "="*70)
        print("⚠️ ATENCIÓN: IDEALISTA TE HA DETECTADO ⚠️")
        print("Si ves el mensaje de DataDome o un CAPTCHA, resuélvelo manualmente")
        print("en la ventana del navegador que acaba de abrirse.")
        print("Haz clic en 'Reproducir', escucha los 6 dígitos y escríbelos.")
        print("")
        print("Cuando hayas resuelto el Captcha y veas las fotos del piso,")
        print("PRESIONA LA TECLA 'ENTER' EN ESTA CONSOLA PARA CONTINUAR...")
        print("="*70 + "\n")
        
        input() # Espera a que el usuario presione Enter
        
        print("[*] Leyendo el código fuente de la página completa...")
        html = page.content()
        # Las URLs a veces vienen escapadas en el JSON
        html = html.replace('\\/', '/')
        
        print("[+] Buscando imágenes originales de alta calidad...")
        # Buscamos el identificador maestro de las imágenes de Idealista.
        # Ejemplo: id.pro.es.image.master/91/7c/b4/1460694302.jpg
        patron = r'(id\.[\w\.]+\.image\.master/[a-zA-Z0-9/_-]+\.jpg)'
        matches = re.findall(patron, html)
        
        # Usamos un conjunto (set) para eliminar duplicados
        imagenes_unicas = set(matches)
        
        # Reconstruimos las URLs forzando el formato de mayor tamaño (WEB_DETAIL-XL-L)
        image_urls = []
        for img_id in imagenes_unicas:
            # Construimos la URL con la máxima calidad
            url_alta_calidad = f"https://img3.idealista.com/blur/WEB_DETAIL-XL-L/0/{img_id}"
            image_urls.append(url_alta_calidad)

        print(f"\n[+] Extracción completada: {len(image_urls)} fotos reales detectadas (sin banderas ni iconos).")
        
        carpeta_destino = "fotos_idealista"
        if not os.path.exists(carpeta_destino):
            os.makedirs(carpeta_destino)
            
        for i, img_url in enumerate(image_urls, 1):
            print(f"{i:02d} -> Descargando foto de alta calidad...")
            try:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Referer": "https://www.idealista.com/",
                    "Accept": "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
                }
                respuesta = requests.get(img_url, headers=headers)
                
                # Comprobar si la descarga fue exitosa
                if respuesta.status_code == 200:
                    nombre_archivo = os.path.join(carpeta_destino, f"foto_{i:02d}.jpg")
                    with open(nombre_archivo, 'wb') as f:
                        f.write(respuesta.content)
                else:
                    print(f"[!] Error: El servidor devolvió {respuesta.status_code} para {img_url}")
            except Exception as e:
                print(f"[!] Error descargando la imagen {i}: {e}")

if __name__ == "__main__":
    # Pon aquí la URL del piso que quieras
    url_objetivo = "https://www.idealista.com/pro/idealista-260420067-1705660893304/inmueble/112160325/foto/1/"
    extraer_imagenes(url_objetivo)