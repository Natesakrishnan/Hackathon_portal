import requests

BASE_URL = "http://localhost:5000"

def test_live_announcements():
    session = requests.Session()
    
    # 1. Login
    login_resp = session.post(f"{BASE_URL}/api/admin/login", json={
        "username": "admin",
        "password": "Admin@SYNEX2026"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.status_code} - {login_resp.text}"
    print("[PASS] Admin login successful.")

    # 2. Check dashboard HTML
    dash_resp = session.get(f"{BASE_URL}/admin/dashboard")
    assert dash_resp.status_code == 200, f"Dashboard load failed: {dash_resp.status_code}"
    html = dash_resp.text
    assert "announcementSendDiscord" not in html, "FAIL: announcementSendDiscord still present in HTML!"
    assert "General Public Discord Channel" not in html, "FAIL: Discord channel option still present in HTML!"
    assert "server-side Discord webhook" not in html, "FAIL: Discord webhook text still in HTML!"
    print("[PASS] Admin dashboard HTML contains no Discord webhook references.")

    # 3. Post a portal announcement
    import time
    ts = int(time.time())
    post_resp = session.post(f"{BASE_URL}/api/admin/announcements", json={
        "title": f"Portal Only Announcement Live Test {ts}",
        "message": f"Testing announcement delivery after removing Discord webhook connection at {ts}.",
        "target_audience": "all",
        "send_email": False
    })
    assert post_resp.status_code == 201, f"Post announcement failed: {post_resp.status_code} - {post_resp.text}"
    data = post_resp.json()
    assert data["success"] is True
    assert "discord" not in data.get("delivery", {}), "FAIL: discord found in delivery response!"
    assert "Portal: Published" in data["announcement"]["delivery_status"], f"FAIL: Unexpected delivery_status: {data['announcement']['delivery_status']}"
    print("[PASS] Announcement posted successfully with delivery status:", data["announcement"]["delivery_status"])

    # 4. Fetch announcements history
    hist_resp = session.get(f"{BASE_URL}/api/admin/announcements")
    assert hist_resp.status_code == 200, f"Fetch announcements history failed: {hist_resp.status_code}"
    hist_data = hist_resp.json()
    assert hist_data["success"] is True
    assert len(hist_data["announcements"]) > 0
    latest = hist_data["announcements"][0]
    assert latest["title"].startswith("Portal Only Announcement Live Test")
    assert "Portal: Published" in latest["delivery_status"]
    print("[PASS] Announcements history loaded correctly and verified.")

if __name__ == "__main__":
    test_live_announcements()
