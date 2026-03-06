# AdPlay - Professional Digital Signage Solution

AdPlay is a lightweight, high-performance digital signage system designed to transform any screen into a powerful advertising or information hub. It is optimized for local networks, providing a seamless experience for managing and playing video content across multiple displays.

---

## 🚀 Key Features

- **Secure Admin Dashboard**: JWT-protected interface for managing your signage network.
- **Centralized Management**: Easily upload, organize, and delete videos.
- **Profile-Based Playlists**: Create specific content groups (Profiles) for different screens.
- **Modern UI/UX**: Premium "Kawaii Cafe" / "Cute Foodie" aesthetic with glassmorphism and smooth animations.
- **Portrait & Landscape Ready**: Automatic orientation detection and fullscreen scaling.
- **Local First**: Runs entirely on your own infrastructure for maximum speed and privacy.
- **Vietnamese Localization**: Full support for Vietnamese in the dashboard and login.

---

## 🔐 Authentication

To ensure security, the Admin Dashboard is protected by JWT (JSON Web Tokens).

- **Default Username**: `admin`
- **Default Password**: `admin`

*Note: You can change these credentials by setting the `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables in the backend.*

---

## 🚀 Quick Start (For Everyone)

Setting up AdPlay is easy. Follow these steps to get your content on the big screen:

### 1. Start the System
- **Mac/Linux Users**: Open the project folder and run `./start.sh`.
- **Windows Users**: Open the project folder and run `start.bat`.
- *Wait for both the Backend and Frontend to initialize.*

### 2. Access the Admin Dashboard
Open your browser and navigate to:
`http://localhost:4200/admin`
(Login with `admin` / `admin`)

### 3. Connect your TVs or Tablets
- Ensure your display device is on the **same Wi-Fi** as the computer running AdPlay.
- The startup script will display your Local IP (e.g., `http://192.168.1.50:4200`).
- Open that address on your TV's browser.

### 4. Play Content
- In the Dashboard, upload videos and assign them to a **Profile**.
- On the TV, select the Profile, and tap the screen to enter **Full Screen** and enable audio.

---

## 🛠 Technical Overview

### Tech Stack
- **Frontend**: Angular 21+, Tailwind CSS (Modern, Responsive UI).
- **Backend**: Node.js, Express (RESTful API).
- **Database**: `db.json` (Local JSON file storage via `fs-extra`).
- **Auth**: JWT (JSON Web Token) + `bcryptjs` hashing.

### Project Structure
- `/frontend`: Angular source code and assets.
- `/backend`: Express server, `db.json`, and `/uploads` directory.
- `start.bat` / `start.sh`: Combined startup scripts for development and production.

---

## 📺 Player Interaction
Browsers often block videos with sound from playing automatically. 
- **Unmute**: Click the "Chạm Để Bật Tiếng" (Tap to Unmute) button if audio is present.
- **Fullscreen**: Click anywhere on the player to enter immersive signage mode.

---

## 🇻🇳 Hướng Dẫn Tiếng Việt

### Tính Năng Chính
- **Quản lý Bảo mật**: Đăng nhập bằng tài khoản Admin để quản lý nội dung.
- **Giao diện Hiện đại**: Phong cách "Kawaii Cafe" với hiệu ứng kính mờ và bo góc mềm mại.
- **Hoạt động Mạng nội bộ**: Tốc độ cao, riêng tư, không cần internet sau khi cài đặt.

### Thông tin Đăng nhập mặc định
- **Tài khoản**: `admin`
- **Mật khẩu**: `admin`

### Cách sử dụng nhanh
1. Chạy `start.bat` (Windows) và giữ cửa sổ lệnh luôn mở.
2. Truy cập `http://localhost:4200/admin` để quản lý video.
3. Trên Tivi, truy cập vào địa chỉ IP của máy tính (ví dụ `http://192.168.1.5:4200`) để phát video.

---

Designed with ❤️ for simple, effective digital signage.

