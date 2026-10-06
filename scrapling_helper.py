"""Extractor local de artículos (último recurso cuando RSS completo y Jina Reader fallan).

Modo ligero: usa `scrapling.fetchers.Fetcher` (HTTP con curl_cffi, SIN navegadores, así que no
requiere `scrapling install`). Si curl_cffi no está disponible, cae a urllib (stdlib) y usa solo
el parser de Scrapling. `--stealthy` (opcional) usa StealthyFetcher, que SÍ necesita navegadores.

Salida: JSON en stdout -> {"success": bool, "text": str, "url": str, "engine": str, "error"?: str}
"""
import sys
import json
import re
import argparse
import urllib.request

DEFAULT_TIMEOUT = 20
USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
)
ARTICLE_SELECTORS = (
    'article p, [itemprop="articleBody"] p, main p, .post-content p, '
    '.entry-content p, .article-content p'
)


def _fetch_page(url, timeout, stealthy=False):
    """Devuelve (page_selector, engine)."""
    if stealthy:
        from scrapling.fetchers import StealthyFetcher
        return StealthyFetcher.fetch(url, headless=True, timeout=timeout * 1000), 'stealthy'
    try:
        from scrapling.fetchers import Fetcher  # requiere scrapling[fetchers] (curl_cffi), sin navegadores
        try:
            page = Fetcher.get(url, timeout=timeout, stealthy_headers=True, follow_redirects=True)
        except TypeError:
            page = Fetcher.get(url, timeout=timeout)
        return page, 'fetcher'
    except ImportError:
        # Fallback sin curl_cffi: descarga con urllib y parsea con el Selector de Scrapling
        from scrapling.parser import Selector
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept-Language': 'es,en;q=0.8'})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            charset = resp.headers.get_content_charset() or 'utf-8'
            html = resp.read().decode(charset, errors='replace')
        return Selector(html, url=url), 'urllib'


def _node_text(node):
    # get_all_text conserva el texto de <a>, <strong>, <em>... (a diferencia de 'p::text')
    text = str(node.get_all_text(separator='', valid_values=False))
    return re.sub(r'\s+', ' ', text).strip()


def extract_article(url, timeout=DEFAULT_TIMEOUT, stealthy=False):
    try:
        page, engine = _fetch_page(url, timeout, stealthy)

        status = getattr(page, 'status', 200)
        if isinstance(status, int) and status >= 400:
            return {"success": False, "error": f"HTTP {status}", "url": url, "engine": engine}

        # Intentamos extraer párrafos dentro de selectores semánticos comunes para noticias
        paragraphs = [_node_text(p) for p in page.css(ARTICLE_SELECTORS)]

        # Fallback genérico si no se encontraron contenedores semánticos
        if not any(paragraphs):
            paragraphs = [_node_text(p) for p in page.css('p')]

        seen = set()
        unique = []
        for p in paragraphs:
            if p and p not in seen:
                seen.add(p)
                unique.append(p)
        text = "\n\n".join(unique)

        # Si el texto es extremadamente corto, intentamos hacer un volcado completo
        if len(text) < 100:
            body = page.css('body')
            if body:
                text = re.sub(r'\s+', ' ', str(body[0].get_all_text(separator=' '))).strip()

        return {"success": True, "text": text, "url": url, "engine": engine}
    except Exception as e:
        return {"success": False, "error": str(e), "url": url, "engine": "none"}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--timeout', type=int, default=DEFAULT_TIMEOUT)
    parser.add_argument('--stealthy', action='store_true', help='Usa StealthyFetcher (requiere navegadores)')
    args = parser.parse_args()
    data = extract_article(args.url, timeout=args.timeout, stealthy=args.stealthy)
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(data, ensure_ascii=False))
