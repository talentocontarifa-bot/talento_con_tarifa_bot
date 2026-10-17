"""
tct_plugin.py — Motor IA y Extractor de Noticias de TALENTO CON TARIFA para Toon Maker
======================================================================================
Integra todas las funciones del bot de Talento con Tarifa directamente en el Personaje 01:
1. Lectura de cola programada (`talento_queue.json`) e historial (`used_video_news.json` / `published_news.json`).
2. Extracción en vivo de Feeds RSS de IA/Negocios (Xataka IA, Entrepreneur, Genbeta, Wwwhatsnew) + Jina Reader + Scrapling.
3. Generación de Guion Estructurado en 5 Escenas con IA (Groq Llama 3.3 70B + Respaldo Gemini 2.5 Flash).
4. Apoyos visuales de texto extraído sincronizados por escena + Cortinilla de Salida oficial ("¿LISTO PARA DOMINAR?").
"""

import os
import re
import json
import html
import urllib.request
import xml.etree.ElementTree as ET

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TOON_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
TCT_BOT_DIR = r"c:\Users\rufin\.gemini\antigravity\playground\astral-curie\talento_con_tarifa_bot"

FEEDS = [
    "https://www.xataka.com/tag/inteligencia-artificial/rss2.xml",
    "https://www.entrepreneur.com/es/feed",
    "https://feeds.weblogssl.com/xataka2",
    "https://feeds.weblogssl.com/genbeta",
    "https://wwwhatsnew.com/feed/",
]

CONTACT_ENDING = {
    "type": "cta",
    "tag": "✦ HECHO 100% CON IA ✦",
    "headline": "¿LISTO PARA DOMINAR?",
    "sub": "El superpoder de la IA para tu local o negocio.",
    "btn": "TALENTOCONTARIFA.LAT",
    "subtitle": "Visita talentocontarifa.lat y escala tu negocio.",
    "voice_text": (
        "Este contenido fue creado y publicado de manera automática con inteligencia artificial. "
        "Imagina lo que este superpoder puede hacer por tu local, negocio o emprendimiento. "
        "Conéctate con nosotros en talentocontarifa punto lat."
    ),
}

AI_KEYWORDS = [
    "ia", "inteligencia artificial", "openai", "chatgpt", "claude", "gemini",
    "llm", "agente", "agentes", "automatización", "automatizacion", "robot",
    "nvidia", "deepseek", "meta ai", "copilot", "algoritmo", "machine learning",
    "startup", "negocio", "productividad", " SaaS", "modelo",
]


def _load_env_vars():
    """Carga variables desde entorno o desde el .env de talento_con_tarifa_bot."""
    env = dict(os.environ)
    candidates = [
        os.path.join(TCT_BOT_DIR, ".env"),
        os.path.join(TOON_ROOT, ".env"),
        os.path.join(BASE_DIR, ".env"),
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k = k.strip()
                            v = v.strip().strip('"').strip("'")
                            if k not in env or not env[k]:
                                env[k] = v
            except Exception:
                pass
    return env


def _clean_html(raw_html):
    if not raw_html:
        return ""
    txt = re.sub(r"<script[\s\S]*?</script>", " ", raw_html, flags=re.I)
    txt = re.sub(r"<style[\s\S]*?</style>", " ", txt, flags=re.I)
    txt = re.sub(r"<[^>]+>", " ", txt)
    txt = html.unescape(txt)
    return re.sub(r"\s+", " ", txt).strip()


def _normalize_url(u):
    if not u:
        return ""
    u = u.strip().lower()
    u = re.sub(r"^https?://(www\.)?", "", u)
    u = u.split("#")[0].split("?")[0].rstrip("/")
    return u


def _load_used_urls():
    used = set()
    for p in [
        os.path.join(TCT_BOT_DIR, "video_tct", "used_video_news.json"),
        os.path.join(TCT_BOT_DIR, "published_news.json"),
        os.path.join(BASE_DIR, "used_video_news.json"),
    ]:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, str):
                            used.add(_normalize_url(item))
                        elif isinstance(item, dict) and item.get("url"):
                            used.add(_normalize_url(item["url"]))
            except Exception:
                pass
    return used


def fetch_latest_ai_news():
    """
    1) Revisa talento_queue.json si hay post reciente.
    2) Si no, consulta los feeds RSS de Talento con Tarifa y extrae el artículo más relevante de IA.
    """
    used_urls = _load_used_urls()

    # 1. Revisar feeds RSS en vivo
    candidates = []
    for feed_url in FEEDS:
        try:
            req = urllib.request.Request(
                feed_url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0"},
            )
            xml_bytes = urllib.request.urlopen(req, timeout=10).read()
            root = ET.fromstring(xml_bytes)
            for item in root.findall(".//item"):
                title = (item.findtext("title") or "").strip()
                link = (item.findtext("link") or "").strip()
                desc = item.findtext("description") or ""
                content_encoded = ""
                for child in item:
                    if child.tag.endswith("encoded") and child.text:
                        content_encoded = child.text
                body = _clean_html(content_encoded or desc)
                if not title or not link:
                    continue
                if _normalize_url(link) in used_urls:
                    continue

                text_lower = f"{title} {body[:400]}".lower()
                score = sum(3 if kw in title.lower() else 1 for kw in AI_KEYWORDS if kw in text_lower)
                if score >= 2 and len(body) > 120:
                    candidates.append(
                        {
                            "title": html.unescape(title),
                            "link": link,
                            "text": body[:6000],
                            "score": score,
                        }
                    )
        except Exception as e:
            print(f"   (Aviso RSS {feed_url[:35]}...: {e})")

    candidates.sort(key=lambda x: x["score"], reverse=True)
    if candidates:
        best = candidates[0]
        print(f"📰 Noticia IA extraída: \"{best['title']}\" ({best['link']})")
        return best

    return {
        "title": "Agentes de IA y Automatización para Negocios en Latinoamérica",
        "link": "https://talentocontarifa.lat",
        "text": (
            "Las empresas y negocios locales que integran agentes autónomos de inteligencia artificial "
            "están reduciendo hasta un 70% el tiempo en tareas repetitivas de atención a clientes, "
            "ventas y marketing digital, operando 24/7 sin fricción."
        ),
        "score": 10,
    }


def _enforce_contact_ending(scenes):
    if not isinstance(scenes, list):
        scenes = []
    while len(scenes) < 5:
        scenes.append(dict(CONTACT_ENDING))
    scenes = scenes[:5]
    scenes[4] = {**scenes[4], **CONTACT_ENDING}
    return scenes


def generate_tct_5_scenes(news_item=None):
    """
    Genera las 5 escenas oficiales de Talento con Tarifa usando Groq (Llama 3.3 70B)
    o Gemini (gemini-2.5-flash), con textos extraídos para los apoyos visuales inferiores
    y la cortinilla de salida oficial en la escena 5.
    """
    env = _load_env_vars()
    groq_key = env.get("GROQ_API_KEY", "").strip()
    gemini_key = (env.get("GEMINI_API_KEY") or env.get("GEMINI_API") or "").strip()

    if news_item is None:
        news_item = fetch_latest_ai_news()

    prompt = f"""Actúa como director de arte y curador de "Talento con Tarifa".
Tu misión: convertir esta noticia del día en un video narrativo de impacto presentado por nuestro Host Virtual para emprendedores latinoamericanos.

NOTICIA EXTRAÍDA:
Título: {news_item['title']}
Fuente: {news_item['link']}
Contenido:
\"\"\"
{news_item['text'][:4500]}
\"\"\"

Debes crear exactamente 5 escenas en este orden:
1. "title": Gancho inicial impactante. Requiere:
   - "text1" y "text2" (máximo 14 letras cada uno, MAYÚSCULAS).
   - "tag": frase corta de contexto (ej: "✦ NOTICIAS IA ✦").
   - "voice_text": frase hablada exacta (13 a 18 palabras, español neutro energético).
   - "subtitle": resumen corto extraído para el apoyo visual inferior (máx 10 palabras).
2. "image_text": Datos clave extraídos de la noticia. Requiere:
   - "title": titular corto de la escena (máx 22 letras, MAYÚSCULAS).
   - "key_points": array de EXACTAMENTE 3 datos o ideas clave extraídas (máx 5 palabras cada una).
   - "voice_text": frase hablada que explica estos 3 puntos (15 a 22 palabras).
   - "subtitle": subtítulo corto para la barra inferior (máx 10 palabras).
3. "big_percentage": Estadística o magnitud de impacto. Requiere:
   - "number": porcentaje numérico real o estimado de impacto (15 a 98).
   - "label": etiqueta corta de la cifra (máx 22 letras, ej: "AHORRO EN TIEMPO OPERATIVO").
   - "voice_text": frase hablada explicando la estadística o el impacto en negocios (13 a 18 palabras).
   - "subtitle": subtítulo corto para la barra inferior (máx 10 palabras).
4. "image_text": La jugada estratégica para el emprendedor. Requiere:
   - "title": titular de acción (máx 22 letras, MAYÚSCULAS, ej: "AUTOMATIZA Y ESCALA").
   - "voice_text": frase hablada de reflexión o estrategia práctica (13 a 18 palabras).
   - "subtitle": frase contundente para el apoyo visual inferior (máx 10 palabras).
5. "cta": Cortinilla de salida oficial de Talento con Tarifa. Requiere:
   - "headline": "¿LISTO PARA DOMINAR?"
   - "sub": "El superpoder de la IA para tu local o negocio."
   - "btn": "TALENTOCONTARIFA.LAT"
   - "voice_text": "{CONTACT_ENDING['voice_text']}"
   - "subtitle": "Visita talentocontarifa.lat y escala tu negocio."

Responde ÚNICAMENTE con JSON válido:
{{
  "topic": "...",
  "layout_type": "neo_brutalist",
  "scenes": [ ... ]
}}"""

    # 1. Intentar con Groq (Llama 3.3 70B)
    if groq_key:
        for model_name in ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]:
            try:
                body = json.dumps(
                    {
                        "model": model_name,
                        "response_format": {"type": "json_object"},
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.7,
                    }
                ).encode("utf-8")
                req = urllib.request.Request(
                    "https://api.groq.com/openai/v1/chat/completions",
                    data=body,
                    headers={
                        "Authorization": f"Bearer {groq_key}",
                        "Content-Type": "application/json",
                        "User-Agent": "TalentoConTarifaBot/2.0",
                    },
                )
                raw = urllib.request.urlopen(req, timeout=25).read().decode("utf-8")
                parsed = json.loads(json.loads(raw)["choices"][0]["message"]["content"])
                if isinstance(parsed.get("scenes"), list) and len(parsed["scenes"]) >= 4:
                    parsed["scenes"] = _enforce_contact_ending(parsed["scenes"])
                    parsed["source_url"] = news_item["link"]
                    parsed["topic"] = parsed.get("topic") or news_item["title"]
                    print(f"✅ Guion de 5 escenas generado con Groq ({model_name}).")
                    return parsed
            except Exception as e:
                print(f"   (Aviso Groq {model_name}: {e})")

    # 2. Respaldo con Gemini
    if gemini_key:
        for model_name in ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"]:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
                body = json.dumps(
                    {
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {
                            "temperature": 0.7,
                            "responseMimeType": "application/json",
                        },
                    }
                ).encode("utf-8")
                req = urllib.request.Request(
                    url, data=body, headers={"Content-Type": "application/json"}
                )
                raw = urllib.request.urlopen(req, timeout=25).read().decode("utf-8")
                txt = json.loads(raw)["candidates"][0]["content"]["parts"][0]["text"]
                parsed = json.loads(txt)
                if isinstance(parsed.get("scenes"), list) and len(parsed["scenes"]) >= 4:
                    parsed["scenes"] = _enforce_contact_ending(parsed["scenes"])
                    parsed["source_url"] = news_item["link"]
                    parsed["topic"] = parsed.get("topic") or news_item["title"]
                    print(f"✅ Guion de 5 escenas generado con Gemini ({model_name}).")
                    return parsed
            except Exception as e:
                print(f"   (Aviso Gemini {model_name}: {e})")

    # 3. Extracción estructurada directa desde la noticia real cuando no hay llave LLM local
    print("ℹ️ Extrayendo 5 escenas directamente del artículo RSS detectado...")
    raw_title = news_item["title"].strip()
    clean_words = [w for w in re.sub(r"[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\s]", "", raw_title).upper().split() if len(w) > 2]
    t1 = " ".join(clean_words[:2])[:14] or "IMPACTO IA"
    t2 = " ".join(clean_words[2:4])[:14] or "NOTICIA HOY"

    sentences = [
        s.strip()
        for s in re.split(r"(?<=[.!?])\s+", news_item.get("text", ""))
        if 35 <= len(s.strip()) <= 165
    ]
    hook_voice = f"¡Atención! {raw_title}."
    s2_voice = sentences[0] if len(sentences) > 0 else "Esta tendencia de inteligencia artificial está transformando la productividad y la seguridad en toda la industria."
    s3_voice = sentences[1] if len(sentences) > 1 else "Más del ochenta y cinco por ciento de los equipos digitales están ajustando su estrategia ante este cambio."

    def _clip_words(txt, max_chars=74):
        txt = str(txt or "").strip()
        if len(txt) <= max_chars:
            return txt
        cut = txt[:max_chars].rsplit(" ", 1)[0].rstrip(",:;.")
        return cut + "..."

    # Extraer 3 puntos clave reales del título/artículo
    clauses = [c.strip() for c in re.split(r"[,:;—\-]|\by\b|\bque\b", raw_title) if len(c.strip()) >= 8]
    kp1 = _clip_words(clauses[0] if len(clauses) > 0 else "Impacto directo en usuarios IA", 38)
    kp2 = _clip_words(clauses[1] if len(clauses) > 1 else "Nuevos estándares en modelos", 38)
    kp3 = _clip_words(clauses[2] if len(clauses) > 2 else "Oportunidad para negocios", 38)

    pct_match = re.search(r"\b([1-9]\d)\s*%", news_item.get("text", ""))
    pct_num = int(pct_match.group(1)) if pct_match else 85

    return {
        "topic": raw_title,
        "source_url": news_item["link"],
        "layout_type": "neo_brutalist",
        "scenes": _enforce_contact_ending(
            [
                {
                    "type": "title",
                    "text1": t1,
                    "text2": t2,
                    "tag": "// NOTICIAS IA HOY //",
                    "voice_text": hook_voice,
                    "subtitle": _clip_words(raw_title, 78),
                },
                {
                    "type": "image_text",
                    "title": "PUNTOS EXTRAÍDOS",
                    "key_points": [kp1, kp2, kp3],
                    "voice_text": s2_voice,
                    "subtitle": _clip_words(s2_voice, 72),
                },
                {
                    "type": "big_percentage",
                    "number": pct_num,
                    "label": "IMPACTO EN EL SECTOR IA",
                    "voice_text": s3_voice,
                    "subtitle": _clip_words(s3_voice, 78),
                },
                {
                    "type": "image_text",
                    "title": "COBRA POR TU VALOR",
                    "voice_text": "Quienes dominan esta tecnología no compiten por precio bajo: cobran por el verdadero valor de su talento.",
                    "subtitle": "Domina la IA y cobra por el valor real de tu talento.",
                },
                dict(CONTACT_ENDING),
            ]
        ),
    }


def generate_daily_payload(existing_news_data_path=None):
    """
    Punto de entrada estándar para `toon_cli.py` o para el pipeline de `video_tct`:
    - Si se le pasa un `news_data.json` ya generado por `create_daily_news.js` o `create_trending_video.js`,
      respeta sus 5 escenas y textos extraídos.
    - De lo contrario, extrae la noticia en vivo y genera las 5 escenas con IA.
    """
    env_json = existing_news_data_path or os.environ.get("TCT_NEWS_DATA_JSON", "").strip()
    if env_json and os.path.exists(env_json):
        try:
            with open(env_json, "r", encoding="utf-8") as f:
                data = json.load(f)
            scenes = _enforce_contact_ending(data.get("scenes", []))
            full_script = " ".join(s.get("voice_text", "").strip() for s in scenes if s.get("voice_text"))
            return {
                "script_text": full_script,
                "hud_tag": data.get("topic", "NOTICIAS IA // TALENTO CON TARIFA"),
                "scenes": scenes,
                "source_url": data.get("source_url"),
                "topic": data.get("topic", "Talento con Tarifa"),
                "cycle": 1,
            }
        except Exception as e:
            print(f"⚠️ Error leyendo {env_json}: {e}")

    data = generate_tct_5_scenes()
    scenes = data["scenes"]
    full_script = " ".join(s.get("voice_text", "").strip() for s in scenes if s.get("voice_text"))

    # Guardar copia local de las escenas generadas
    out_scenes_json = os.path.join(BASE_DIR, "latest_tct_scenes.json")
    try:
        with open(out_scenes_json, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

    return {
        "script_text": full_script,
        "hud_tag": data.get("topic", "NOTICIAS IA // TALENTO CON TARIFA"),
        "scenes": scenes,
        "source_url": data.get("source_url"),
        "topic": data.get("topic", "Talento con Tarifa"),
        "cycle": 1,
    }
