import requests
import time

BASE_URL = "http://localhost:5000"

def test_live_announcement_with_email():
    session = requests.Session()
    
    # 1. Login
    login_resp = session.post(f"{BASE_URL}/api/admin/login", json={
        "username": "admin",
        "password": "Admin@SYNEX2026"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.status_code} - {login_resp.text}"
    print("[PASS] Admin logged in successfully.")

    # 2. Post an announcement with Email Broadcast checked
    ts = int(time.time())
    post_resp = session.post(f"{BASE_URL}/api/admin/announcements", json={
        "title": f"Live Email Broadcast Verification {ts}",
        "message": f"Official test of unified email service dispatch for announcements at timestamp {ts}.",
        "target_audience": "all",
        "send_email": True
    })
    assert post_resp.status_code == 201, f"Post failed: {post_resp.status_code} - {post_resp.text}"
    data = post_resp.json()
    print("Post Response:", data)
    assert data["success"] is True
    assert data["announcement"]["email_sent"] is True, f"Expected email_sent True, got {data['announcement']}"
    assert "Delivered to" in data["delivery"]["email"]["status"], f"Expected Delivered to, got {data['delivery']['email']['status']}"
    assert "timed out" not in data["delivery"]["email"]["status"].lower()
    print("[PASS] Announcement posted and email broadcast succeeded via Resend API!")

if __name__ == "__main__":
    test_live_announcement_with_email()
