"""
Obscura Browser Wrapper for Playwright & Scrapling.
Obscura is an ultra-lightweight Rust headless browser that speaks Chrome DevTools Protocol (CDP).
Instead of launching a heavyweight Chromium instance (~300MB RAM), Obscura runs as a lightweight daemon (~30-40MB RAM).

Usage:
1. Start Obscura: `./obscura --remote-debugging-port=9222 --headless`
2. Connect with this wrapper from Playwright / Scrapling.
"""
import os
import json
import asyncio

async def fetch_with_obscura(url: str, cdp_endpoint: str = "http://localhost:9222"):
    """
    Connects to Obscura via CDP and retrieves page content and title.
    Falls back gracefully if Obscura daemon is not running.
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return {"success": False, "error": "playwright not installed in Python environment"}

    try:
        async with async_playwright() as p:
            # Connect over CDP to Obscura's remote debugging port
            browser = await p.chromium.connect_over_cdp(cdp_endpoint)
            default_context = browser.contexts[0] if browser.contexts else await browser.new_context()
            page = await default_context.new_page()
            
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            title = await page.title()
            content = await page.content()
            await page.close()
            
            return {
                "success": True,
                "title": title,
                "content_length": len(content),
                "engine": "obscura-cdp"
            }
    except Exception as e:
        return {
            "success": False,
            "error": f"Obscura CDP connection error: {str(e)}"
        }

if __name__ == '__main__':
    result = asyncio.run(fetch_with_obscura("https://example.com"))
    print(json.dumps(result, indent=2))
