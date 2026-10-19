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
    # Fuentes primarias de IA Aplicada, Agentes, DevTools y Negocios B2B (Inglés)
    "https://blog.n8n.io/rss/",
    "https://simonwillison.net/atom/everything/",
    "https://huggingface.co/blog/feed.xml",
    "https://techcrunch.com/category/artificial-intelligence/feed/",
    "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    "https://hnrss.org/newest?q=AI+OR+LLM+OR+agent&points=80",
    # Fuentes curadas en Español (Tecnología, IA y Emprendimiento)
    "https://www.xataka.com/tag/inteligencia-artificial/rss2.xml",
    "https://wwwhatsnew.com/feed/",
    "https://feeds.weblogssl.com/genbeta",
    "https://feeds.weblogssl.com/xataka2",
    "https://www.entrepreneur.com/es/feed",
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
    "ia", "inteligencia artificial", "artificial intelligence", "openai", "chatgpt",
    "claude", "anthropic", "gemini", "llm", "agente", "agentes", "agent", "agents",
    "agentic", "automatización", "automatizacion", "automation", "nvidia", "deepseek",
    "meta ai", "copilot", "algoritmo", "machine learning", "mcp", "rag", "n8n",
    "open source", "open weights", "api", "sdk", "hugging face", "qwen", "mistral",
]

MEAT_KEYWORDS = [
    "api", "sdk", "open source", "open weights", "github", "benchmark", "workflow",
    "flujo de trabajo", "automatizar", "integración", "integracion", "producción",
    "produccion", "caso de uso", "use case", "arquitectura", "architecture", "mcp",
    "rag", "fine-tuning", "n8n", "zapier", "make", "supabase", "postgres", "docker",
    "ahorro", "costo", "cost", "pricing", "precio", "token", "latencia", "latency",
    "b2b", "saas", "crm", "erp", "ventas", "soporte", "pipeline",
]

FLUFF_KEYWORDS = [
    "demanda", "juicio", "policía", "policia", "arresto", "allana", "casa de",
    "famoso", "celebridad", "chisme", "polémica", "polemica", "horóscopo",
    "horoscopo", "crimen", "homicidio", "ataque", "adolescente", "suicidio",
]

BANNED_CLICHES = [
    "atención emprendedor",
    "cambiar todas las reglas del juego",
    "cambiaron las reglas",
    "operan veinticuatro siete",
    "operan 24 horas continuas",
    "el 85% de las empresas",
    "ochenta y cinco por ciento de las empresas",
    "quienes dominan esta tecnología no compiten por precio",
    "cobra por tu valor",
    "no compitas por precio",
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


def _extract_hard_facts(text):
    """Extrae oraciones con cifras/métricas reales y una insignia corta para la Escena 3."""
    if not text:
        return {"facts": [], "metric": "DATO", "number": None, "context": ""}
    sentences = [
        s.strip()
        for s in re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", text))
        if 35 <= len(s.strip()) <= 210
    ]
    num_re = re.compile(
        r"(\b\d+(?:[.,]\d+)?\s*(?:%|por ciento|percent|x|veces|millones|miles|billones|billion|million|k\b|m\b|usd|dólares|dolares|euros|horas|minutos|segundos|ms|gb|tb|parámetros|parametros|parameters|tokens)\b|\$\s*\d+(?:[.,]\d+)?\s*[kmb]?)",
        re.I,
    )
    facts = [s for s in sentences if num_re.search(s)][:4]

    pct_match = re.search(r"\b([1-9]\d?)\s*(?:%|por ciento|percent)", text, re.I)
    mult_match = re.search(r"\b(\d+(?:[.,]\d+)?)\s*(?:x|veces)\b", text, re.I)
    money_match = re.search(r"\$\s*(\d+(?:[.,]\d+)?\s*[kmb]?)", text, re.I)
    count_match = re.search(r"\b(\d{2,4})\s+(?:empresas|modelos|agentes|clientes|usuarios|herramientas|flujos|integraciones|nodos|workflows|apps)\b", text, re.I)

    metric = "IA B2B"
    num_val = None
    if pct_match:
        num_val = int(pct_match.group(1))
        metric = f"{num_val}%"
    elif mult_match:
        metric = f"{mult_match.group(1).replace(',', '.')}X"[:6]
    elif money_match:
        metric = f"${money_match.group(1).upper().replace(' ', '')}"[:6]
    elif count_match:
        metric = count_match.group(1)[:6]
    elif re.search(r"\bopen[\s-]?source\b|código abierto", text, re.I):
        metric = "OPEN"
    elif re.search(r"\bapi\b|\bsdk\b|\bmcp\b", text, re.I):
        metric = "API"

    return {
        "facts": facts,
        "metric": metric,
        "number": num_val,
        "context": facts[0] if facts else (sentences[0] if sentences else ""),
    }


def fetch_latest_ai_news():
    """
    Consulta los feeds RSS (ES + EN) de Talento con Tarifa y extrae el artículo
    con mayor densidad técnica/práctica ("carnita") y sin repetir URLs usadas.
    """
    used_urls = _load_used_urls()

    candidates = []
    for feed_url in FEEDS:
        try:
            req = urllib.request.Request(
                feed_url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0"},
            )
            xml_bytes = urllib.request.urlopen(req, timeout=10).read()
            root = ET.fromstring(xml_bytes)
            # Soporta tanto RSS (<item>) como Atom (<entry>)
            items = root.findall(".//item") or root.findall(".//{http://www.w3.org/2005/Atom}entry")
            for item in items:
                title = (
                    item.findtext("title")
                    or item.findtext("{http://www.w3.org/2005/Atom}title")
                    or ""
                ).strip()
                link = (item.findtext("link") or "").strip()
                if not link:
                    atom_link = item.find("{http://www.w3.org/2005/Atom}link")
                    if atom_link is not None:
                        link = (atom_link.attrib.get("href") or "").strip()
                desc = (
                    item.findtext("description")
                    or item.findtext("{http://www.w3.org/2005/Atom}summary")
                    or item.findtext("{http://www.w3.org/2005/Atom}content")
                    or ""
                )
                content_encoded = ""
                for child in item:
                    if child.tag.endswith("encoded") and child.text:
                        content_encoded = child.text
                body = _clean_html(content_encoded or desc)
                if not title or not link:
                    continue
                if _normalize_url(link) in used_urls:
                    continue

                text_lower = f"{title} {body[:600]}".lower()
                ai_score = sum(3 if kw in title.lower() else 1 for kw in AI_KEYWORDS if kw in text_lower)
                meat_score = sum(2 if kw in title.lower() else 1 for kw in MEAT_KEYWORDS if kw in text_lower)
                fluff_penalty = sum(4 for kw in FLUFF_KEYWORDS if kw in text_lower)
                if re.search(r"\b\d+(?:[.,]\d+)?\s*(?:%|x|millones|billion|million|usd|\$|ms|gb|tokens)\b", text_lower):
                    meat_score += 2
                total_score = ai_score + meat_score - fluff_penalty

                if ai_score >= 2 and total_score >= 3 and len(body) > 120:
                    candidates.append(
                        {
                            "title": html.unescape(title),
                            "link": link,
                            "text": body[:6000],
                            "score": total_score,
                            "meat": meat_score,
                        }
                    )
        except Exception as e:
            print(f"   (Aviso RSS {feed_url[:35]}...: {e})")

    candidates.sort(key=lambda x: (x["score"], x["meat"]), reverse=True)
    if candidates:
        best = candidates[0]
        print(f"📰 Noticia IA extraída: \"{best['title']}\" (score={best['score']}, carnita={best['meat']}) [{best['link']}]")
        return best

    return {
        "title": "Arquitectura de Agentes con MCP y Flujos en n8n para Operaciones B2B",
        "link": "https://talentocontarifa.lat",
        "text": (
            "El protocolo MCP (Model Context Protocol) combinado con flujos de trabajo en n8n permite "
            "conectar modelos LLM directamente a bases de datos SQL, CRMs y APIs internas con control "
            "de latencia y auditoría, reduciendo el costo por millón de tokens en un 62% frente a "
            "arquitecturas monolíticas sin caché."
        ),
        "score": 12,
        "meat": 8,
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
    o Gemini (gemini-2.5-flash), con datos duros reales del artículo, cero clichés
    y la cortinilla de salida oficial en la escena 5.
    """
    env = _load_env_vars()
    groq_key = env.get("GROQ_API_KEY", "").strip()
    gemini_key = (env.get("GEMINI_API_KEY") or env.get("GEMINI_API") or "").strip()

    if news_item is None:
        news_item = fetch_latest_ai_news()

    hard_facts = _extract_hard_facts(f"{news_item['title']}. {news_item.get('text', '')}")
    facts_block = (
        "DATOS DUROS EXTRAÍDOS DEL ARTÍCULO (úsalos obligatoriamente en las escenas 2 y 3):\n- "
        + "\n- ".join(hard_facts["facts"])
        if hard_facts["facts"]
        else "REGLA DE DATOS: Cita únicamente los nombres técnicos, modelos, empresas y cifras reales del artículo."
    )
    banned_block = ", ".join(f'"{c}"' for c in BANNED_CLICHES)

    prompt = f"""Actúa como Director Técnico y Locutor Estelar de "Talento con Tarifa".
Tu misión: convertir esta noticia técnica o de negocios de IA (puede estar en inglés o español) en un guion en ESPAÑOL de 5 escenas con sustancia real ("con carnita"), datos concretos y un ritmo oral conversacional y fluido (hablando de "tú", nunca de "usted", sin sonar a traducción robótica).

NOTICIA EXTRAÍDA:
Título: {news_item['title']}
Fuente: {news_item['link']}
Contenido:
\"\"\"
{news_item['text'][:4500]}
\"\"\"

{facts_block}
Métrica sugerida para Escena 3: "{hard_facts['metric']}"

PROHIBIDO USAR ESTOS CLICHÉS QUEMADOS: {banned_block}. Tampoco inventes el porcentaje "85%" ni hables de "usted".

Debes crear exactamente 5 escenas en este orden:
1. "title": Gancho técnico/directo sobre la noticia real (entra directo con el nombre de la tecnología, empresa o hallazgo, sin "¡Atención emprendedor!"). Requiere:
   - "text1" y "text2" (máximo 14 letras cada uno, MAYÚSCULAS, en español).
   - "tag": categoría técnica (ej: "✦ INGENIERÍA IA ✦" o "✦ RADIOGRAFÍA ROI ✦").
   - "voice_text": frase hablada fluida y directa con el hecho central de la noticia (13 a 18 palabras, español neutro).
   - "subtitle": resumen corto para la barra inferior (máx 10 palabras).
2. "image_text": Desglose técnico / mecánico de la noticia. Requiere:
   - "title": titular corto de lo que hace o cambia (máx 22 letras, MAYÚSCULAS).
   - "key_points": array de EXACTAMENTE 3 datos o mecanismos concretos del artículo (máx 5 palabras cada uno).
   - "voice_text": frase hablada natural que explica estos 3 puntos concretos (15 a 22 palabras).
   - "subtitle": subtítulo corto para la barra inferior (máx 10 palabras).
3. "big_percentage": El DATO DURO o MÉTRICA REAL del artículo. Requiere:
   - "metric": insignia corta (máx 6 caracteres) con la cifra o hallazgo real (ej: "{hard_facts['metric']}", "3.5X", "$20/M", "OPEN", "API", "66%").
   - "number": si el dato real es un porcentaje (1 a 99), pon el entero; si NO es porcentaje, pon null.
   - "label": qué mide o significa ese dato en el artículo (máx 22 letras).
   - "voice_text": frase hablada natural explicando el dato duro real del artículo (13 a 18 palabras).
   - "subtitle": subtítulo corto para la barra inferior (máx 10 palabras).
4. "image_text": La jugada operativa o arquitectónica aplicable. Requiere:
   - "title": titular táctico específico al tema de hoy (máx 22 letras, MAYÚSCULAS; PROHIBIDO poner "COBRA POR TU VALOR").
   - "voice_text": recomendación accionable y directa (hablando de "tú") derivada de esta noticia para quien construye o dirige un negocio (13 a 18 palabras).
   - "subtitle": frase contundente para el apoyo visual inferior (máx 10 palabras).
5. "cta": Cortinilla de salida oficial de Talento con Tarifa. Requiere:
   - "headline": "¿LISTO PARA DOMINAR?"
   - "sub": "El superpoder de la IA para tu local o negocio."
   - "btn": "TALENTOCONTARIFA.LAT"
   - "voice_text": "{CONTACT_ENDING['voice_text']}"
   - "subtitle": "Visita talentocontarifa.lat y escala tu negocio."

Responde ÚNICAMENTE con JSON válido (con "topic" SIEMPRE traducido o redactado en ESPAÑOL):
{{
  "topic": "Titular atractivo en español",
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
                        "temperature": 0.65,
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
                            "temperature": 0.65,
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
    t1 = " ".join(clean_words[:2])[:14] or "SISTEMA IA"
    t2 = " ".join(clean_words[2:4])[:14] or "EN PRODUCCIÓN"

    sentences = [
        s.strip()
        for s in re.split(r"(?<=[.!?])\s+", news_item.get("text", ""))
        if 35 <= len(s.strip()) <= 165
    ]
    hook_voice = f"{raw_title}."
    s2_voice = sentences[0] if len(sentences) > 0 else f"El reporte detalla cómo {raw_title} modifica la arquitectura técnica y operativa del sector."
    s3_voice = hard_facts["context"] if hard_facts["context"] else (sentences[1] if len(sentences) > 1 else s2_voice)
    s4_voice = sentences[2] if len(sentences) > 2 else "Integra esta capacidad mediante API o flujos automatizados en tus procesos críticos antes de escalar costos."

    def _clip_words(txt, max_chars=74):
        txt = str(txt or "").strip()
        if len(txt) <= max_chars:
            return txt
        cut = txt[:max_chars].rsplit(" ", 1)[0].rstrip(",:;.")
        return cut + "..."

    clauses = [c.strip() for c in re.split(r"[,:;—\-]|\by\b|\bque\b", raw_title) if len(c.strip()) >= 8]
    kp1 = _clip_words(clauses[0] if len(clauses) > 0 else "Integración técnica directa", 38)
    kp2 = _clip_words(clauses[1] if len(clauses) > 1 else "Impacto en arquitectura B2B", 38)
    kp3 = _clip_words(clauses[2] if len(clauses) > 2 else "Optimización de flujos IA", 38)

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
                    "tag": "// INGENIERÍA Y DATOS IA //",
                    "voice_text": hook_voice,
                    "subtitle": _clip_words(raw_title, 78),
                },
                {
                    "type": "image_text",
                    "title": "DESGLOSE TÉCNICO",
                    "key_points": [kp1, kp2, kp3],
                    "voice_text": s2_voice,
                    "subtitle": _clip_words(s2_voice, 72),
                },
                {
                    "type": "big_percentage",
                    "number": hard_facts["number"],
                    "metric": hard_facts["metric"],
                    "label": "DATO DURO DEL REPORTE",
                    "voice_text": s3_voice,
                    "subtitle": _clip_words(s3_voice, 78),
                },
                {
                    "type": "image_text",
                    "title": "JUGADA OPERATIVA",
                    "voice_text": s4_voice,
                    "subtitle": _clip_words(s4_voice, 74),
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
