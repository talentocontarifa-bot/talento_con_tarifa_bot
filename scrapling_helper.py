import sys
import json
import argparse
from scrapling.fetchers import StealthyFetcher

def extract_article(url):
    try:
        # Fetching the news article using StealthyFetcher to bypass Cloudflare/antibots
        page = StealthyFetcher.fetch(url, headless=True)
        
        # Intentamos extraer párrafos dentro de selectores semánticos comunes para noticias
        paragraphs = page.css('article p::text, main p::text, .post-content p::text, .entry-content p::text').getall()
        
        # Fallback genérico si no se encontraron contenedores semánticos
        if not paragraphs:
            paragraphs = page.css('p::text').getall()
            
        text = " ".join([p.strip() for p in paragraphs if p.strip()])
        
        # Si el texto es extremadamente corto, intentamos hacer un volcado completo
        if len(text) < 100:
            all_text = page.css('body::text').getall()
            text = " ".join([t.strip() for t in all_text if t.strip()])
            
        result = {
            "success": True,
            "text": text,
            "url": url
        }
        return result
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "url": url
        }

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    args = parser.parse_args()
    data = extract_article(args.url)
    print(json.dumps(data, ensure_ascii=False))
