"""
Tests for Progressive Web App (PWA) and Desktop/Mobile Standalone Application support.
Verifies manifest metadata, service worker routing, offline fallback, and high-DPI icons.
"""

import json


def test_pwa_manifest_endpoint(client):
    """Test that /manifest.json returns valid W3C web app manifest with standalone display."""
    response = client.get("/manifest.json")
    assert response.status_code == 200
    assert "application/manifest+json" in response.content_type

    data = json.loads(response.data.decode("utf-8"))
    assert "Hack" in data["name"]
    assert data["display"] == "standalone"
    assert "window-controls-overlay" in data.get("display_override", [])
    assert data["scope"] == "/"
    assert len(data["icons"]) >= 4

    # Verify standard sizes exist in icon declarations
    sizes = [icon["sizes"] for icon in data["icons"]]
    assert "192x192" in sizes
    assert "512x512" in sizes


def test_pwa_service_worker_endpoint(client):
    """Test that /sw.js is served at root scope with correct headers."""
    response = client.get("/sw.js")
    assert response.status_code == 200
    assert "application/javascript" in response.content_type
    assert response.headers.get("Service-Worker-Allowed") == "/"
    assert "no-cache" in response.headers.get("Cache-Control", "")
    assert b"hack-pwa" in response.data


def test_pwa_offline_page(client):
    """Test that /offline.html renders the offline fallback screen with 200 OK."""
    response = client.get("/offline.html")
    assert response.status_code == 200
    assert b"Offline" in response.data
    assert b"manifest.json" in response.data


def test_pwa_icons_served(client):
    """Test that multi-resolution icons and SVG brand assets are accessible."""
    required_icons = [
        "icon-192.png",
        "icon-512.png",
        "icon-maskable-192.png",
        "icon-maskable-512.png",
        "apple-touch-icon.png",
        "favicon-32x32.png",
        "icon.svg",
    ]
    for icon_name in required_icons:
        response = client.get(f"/icons/{icon_name}")
        assert response.status_code == 200, f"Icon /icons/{icon_name} returned {response.status_code}"
        assert len(response.data) > 0


def test_pwa_client_script_served(client):
    """Test that /js/pwa.js is served properly."""
    response = client.get("/js/pwa.js")
    assert response.status_code == 200
    assert b"beforeinstallprompt" in response.data


def test_pwa_meta_tags_in_templates(client):
    """Test that public pages include PWA manifest link and script without visible install button clutter."""
    pages = ["/", "/schedule", "/rules", "/contact", "/register"]
    for page in pages:
        response = client.get(page)
        assert response.status_code == 200
        assert b'rel="manifest"' in response.data, f"Page {page} missing manifest link"
        assert b'meta name="theme-color"' in response.data, f"Page {page} missing theme-color"
        assert b'btnPwaInstall' not in response.data, f"Page {page} unexpectedly contains visible install button"
        assert b'/js/pwa.js' in response.data, f"Page {page} missing pwa.js script"
