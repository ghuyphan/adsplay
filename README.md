<div align="center">
  <h1>📺 AdPlay</h1>
  <p><b>A lightweight, high-performance, and secure local digital signage solution.</b></p>

  <img src="https://img.shields.io/badge/Angular-DD0031?style=for-the-badge&logo=angular&logoColor=white" alt="Angular" />
  <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node" />
  <img src="https://img.shields.io/badge/Express.js-404D59?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
</div>

<br/>

**AdPlay** turns any screen—TV, tablet, or monitor—into a powerful advertising or information hub. Designed to run completely on your local network, it requires no expensive cloud subscriptions, ensuring maximum speed, privacy, and zero internet dependency after setup.

![AdPlay Dashboard Screenshot](./admin.png)

---

## ✨ Why AdPlay?

Enterprise digital signage solutions are often overpriced and overly complex. AdPlay is built to solve that by offering a **free, open-source, and local-first** alternative. Whether you run a cafe, an office, or a retail store, AdPlay lets you manage what plays on your screens effortlessly.

### 🚀 Key Features

- 🎨 **Premium UI/UX:** A gorgeous "Kawaii Cafe" / "Cute Foodie" aesthetic featuring glassmorphism and smooth animations.
- 🔒 **Secure Admin Dashboard:** JWT-protected interface keeps unauthorized users on your WiFi from tampering with your displays.
- 📺 **Multi-Screen Syncing:** Create specific content groups ("Profiles") and assign different playlists to different screens.
- 📱 **Smart Orientation:** Dynamic detection automatically scales for both Landscape and Portrait (vertical) displays.
- ⚡ **LAN Optimized:** Built-in 15-second caching for profile fetching drastically reduces bandwidth and database load when syncing multiple screens.
- 🛡️ **Safe File Handling:** Strict MIME-type checking and a 500MB upload limit protect your host machine from malicious executables or disk exhaustion.
- 📍 **Auto Network Discovery:** Automatically detects and displays your local IPv4 addresses on startup so you don't have to hunt for your IP.

---

## 🛠 Tech Stack

### Frontend
- **Framework:** Angular 21+
- **Styling:** Tailwind CSS (Modern, responsive, glassmorphism UI)

### Backend
- **Server:** Node.js with Express.js (RESTful API)
- **Database:** Local JSON file storage (`db.json` via `fs-extra`) for absolute portability without complex DB setups.
- **Authentication:** JWT (JSON Web Tokens) + `bcryptjs` hashing.
- **File Handling:** `multer` for secure video uploads.

---

## 🚦 Quick Start (Zero Config)

Setting up AdPlay takes less than a minute. You do not need to be a developer to run this!

### 1. Launch the Server
- **Mac/Linux:** Open the project folder and run `./start.sh`
- **Windows:** Open the project folder and double-click `start.bat`
*(Keep the terminal window open; this is the engine running your signage!)*

### 2. Access the Admin Dashboard
Open your web browser and go to:
👉 `http://localhost:4200/admin`

**Default Login:**
- **Username:** `admin`
- **Password:** `admin`

### 3. Connect Your Screens (TVs/Tablets)
Ensure your TV or Tablet is connected to the **same Wi-Fi/LAN** as your host computer. Look at your terminal window—AdPlay will automatically print your local IP address (e.g., `http://192.168.1.50:4200`). 

Open that exact address in the web browser of your TV/Tablet!

### 4. Play Content
- In the Dashboard, upload your video and assign it to a **Profile**.
- On your TV, select that Profile. 
- *Note: Browsers block autoplay audio. Tap the "Chạm Để Bật Tiếng" (Tap to Unmute) button and the video will jump into immersive Full-Screen mode.*

---

## ⚙️ Advanced Configuration (Environment Variables)

For security in production environments, you should change the default admin credentials. You can do this by creating a `.env` file in the `/backend` directory:

```env
PORT=3000
JWT_SECRET=your_super_secret_jwt_key
ADMIN_USERNAME=your_custom_admin
ADMIN_PASSWORD=your_secure_password

```

---

## 🤝 Contributing & Forking

This project is 100% open-source!

* **Fork it** to add cloud sync, remote DBs, or specific features for your clients.
* **Submit PRs** if you find bugs or want to improve the core local experience.
* If you find this project useful for your business or development learning, please consider giving it a ⭐️!

---

## 🇻🇳 Hướng Dẫn Nhanh (Tiếng Việt)

AdPlay là hệ thống phát video quảng cáo nội bộ cực nhẹ, miễn phí và bảo mật. Thay vì tốn tiền thuê các nền tảng đắt đỏ, bạn có thể tự cắm hệ thống này tại quán Cafe, nhà hàng hoặc văn phòng.

**Tính năng nổi bật:**

* Giao diện quản lý hiện đại, có Đăng nhập bảo mật (không sợ khách dùng chung WiFi đổi video bậy bạ).
* Chạy 100% qua mạng LAN nội bộ, tốc độ tải video siêu nhanh.
* Tự động nhận diện video màn hình dọc/ngang.

**Cách sử dụng:**

1. Chạy file `start.bat` (trên Windows) hoặc `./start.sh` (trên Mac) và giữ nguyên cửa sổ màu đen.
2. Vào `http://localhost:4200/admin` để upload video và tạo Playlist. *(Tài khoản: `admin` / Mật khẩu: `admin`)*.
3. Dùng trình duyệt trên Tivi/IPad truy cập vào địa chỉ IP nội bộ của bạn (Ví dụ: `http://192.168.1.15:4200`) để phát video. Bấm vào màn hình Tivi 1 lần để bật tiếng và phóng to toàn màn hình!

---

*Designed with ❤️ for simple, effective digital signage.*

```