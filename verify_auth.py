import requests
import sys

BASE_URL = "http://localhost:3000/api"

def test_auth():
    print("Testing Authentication Flow...")
    
    # 1. Test unauthorized access
    print("\n1. Testing unauthorized access to /api/videos...")
    try:
        r = requests.get(f"{BASE_URL}/videos")
        if r.status_code == 401:
            print("SUCCESS: Got 401 Unauthorized as expected.")
        else:
            print(f"FAILURE: Expected 401, got {r.status_code}")
    except Exception as e:
        print(f"ERROR: {e}")

    # 2. Test login with wrong credentials
    print("\n2. Testing login with invalid credentials...")
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json={"username": "admin", "password": "wrongpassword"})
        if r.status_code == 401:
            print("SUCCESS: Login failed with 401 as expected.")
        else:
            print(f"FAILURE: Expected 401, got {r.status_code}")
    except Exception as e:
        print(f"ERROR: {e}")

    # 3. Test login with correct credentials
    print("\n3. Testing login with correct credentials (admin/admin)...")
    token = None
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json={"username": "admin", "password": "admin"})
        if r.status_code == 200:
            token = r.json().get("token")
            print("SUCCESS: Login successful, token received.")
        else:
            print(f"FAILURE: Expected 200, got {r.status_code}")
            print(f"Response: {r.text}")
    except Exception as e:
        print(f"ERROR: {e}")

    if not token:
        print("\nCANNOT CONTINUE: No token received.")
        return

    # 4. Test authorized access
    print("\n4. Testing authorized access to /api/videos...")
    try:
        headers = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{BASE_URL}/videos", headers=headers)
        if r.status_code == 200:
            print(f"SUCCESS: Access granted. Found {len(r.json())} videos.")
        else:
            print(f"FAILURE: Expected 200, got {r.status_code}")
    except Exception as e:
        print(f"ERROR: {e}")

    print("\nVerification Complete.")

if __name__ == "__main__":
    test_auth()
