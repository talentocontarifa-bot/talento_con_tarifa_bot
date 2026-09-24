import urllib.request
import re
import ssl
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

url = "https://www.genbeta.com/inteligencia-artificial/meta-se-ha-puesto-a-cabeza-carrera-agentes-ia-adquiriendo-manus-2-000-millones-dolares"
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
html = urllib.request.urlopen(req, context=ctx).read().decode("utf-8", errors="ignore")

# Extract og:image
og = re.findall(r'<meta[^>]+property=[\'"]og:image(?::secure_url)?[\'"][^>]+content=[\'"]([^\'"]+)[\'"]', html, re.I)
if not og:
    og = re.findall(r'<meta[^>]+content=[\'"]([^\'"]+)[\'"][^>]+property=[\'"]og:image(?::secure_url)?[\'"]', html, re.I)

# Extract images in article
imgs = re.findall(r'<img[^>]+src=[\'"](https?://[^\'"]+\.(?:jpg|jpeg|png|webp)[^\'"]*)[\'"]', html, re.I)
clean_imgs = [i for i in imgs if "avatar" not in i and "logo" not in i and "icon" not in i and "pixel" not in i]

print("OG Image:", og)
print(f"Content images ({len(clean_imgs)}):")
for i in clean_imgs[:5]:
    print(" -", i)
