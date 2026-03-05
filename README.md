# AdPlay - Professional Digital Signage Solution

AdPlay is a lightweight, high-performance digital signage system designed to transform any screen into a powerful advertising or information hub. It is optimized for local networks, providing a seamless experience for managing and playing video content across multiple displays.

---

## 🚀 Key Features

- **Centralized Management**: Easily upload and organize videos into profiles (playlists).
- **Multi-Screen Support**: Stream specific playlists to different devices on your network.
- **Modern UI**: A premium, responsive dashboard and a clean, immersive player.
- **Local First**: Runs entirely on your own infrastructure for maximum speed and privacy.
- **Portrait Ready**: Dynamic detection and beautiful rendering for vertical displays.

## ⚠️ Important Project Notes

Please be aware of the following design choices and constraints:

- **No Authentication**: This project currently does **not** include a login or authentication system. It is designed to be used within a **trusted local area network (LAN)**. Access to the dashboard should be restricted at the network level if security is a concern.
- **Local LAN Network**: The system is built for local network usage. Devices must be connected to the same Wi-Fi or Ethernet network to communicate.

## 🔓 Open Source & Forking

This project is open for everyone! You are free to:
- **Fork** the repository and create your own version.
- **Modify** the code to suit your specific needs (e.g., adding Auth, cloud sync, etc.).
- **Share** and use it for your own projects.

If you find this project useful, feel free to contribute back or give it a star!

---

## � Simple Guide (For Everyone)

Setting up AdPlay is easy, even if you aren't a "tech person." Here is how to get your videos on the big screen:

### 1. Start the System
- **Mac Users**: Open the project folder and double-click the `start.sh` file.
- **Windows Users**: Open the project folder and double-click the `start.bat` file.
- *Tip: Keep the black windows that appear open. They are the "engine" of the app!*

### 2. Open the "Remote Control" (Dashboard)
On your computer, open your web browser (Chrome, Safari, etc.) and type:
`http://localhost:4200/admin`
This is where you upload your videos and create playlists.

### 3. Connect your TV or Tablet
- Make sure your TV/Tablet is on the **same Wi-Fi** as your computer.
- On the computer running the app, the "black window" will show an address like `http://192.168.1.50:4200`.
- Type that exact address into your TV's web browser.

### 4. Play!
- In the Dashboard, upload your video and put it in a "Profile."
- On your TV, select that Profile, and it will start playing automatically in full screen!

---

## �🛠 Technical Getting Started

### 1. Prerequisites
- Node.js (v18+)
- Local network access

### 2. Startup Scripts
We provide automated scripts to launch both the backend and frontend simultaneously.

**For macOS / Linux:**
```bash
./start.sh
```

**For Windows:**
```bash
start.bat
```

### 3. Accessing the System
- **Admin Dashboard**: `http://localhost:4200/admin` (Manage your content)
- **Content Player**: `http://localhost:4200/player` (Display your videos)

For remote displays (TVs, Tablets), replace `localhost` with your machine's IP address (e.g., `http://192.168.1.50:4200/player`).

---

## 📺 Player Interaction
Browsers often block videos with sound from playing automatically. 
- If your video has audio, the player will show a **"Chạm Để Bật Tiếng" (Tap to Unmute)** button.
- Click anywhere on the player to enter **Full Screen** mode for the best signage experience.

---

## 🇻🇳 Phiên Bản Tiếng Việt (Vietnamese Version)

### AdPlay là gì?
AdPlay là một hệ thống trình chiếu nội dung kỹ thuật số (digital signage) năng suất cao, được thiết kế để hoạt động trên mạng nội bộ (mạng LAN/Wi-Fi). Hệ thống giúp bạn tải video, tổ chức danh sách phát (Profiles) và phát trên bất kỳ thiết bị nào.

### Ghi Chú Quan Trọng
- **Không có Đăng Nhập (No Auth)**: Ứng dụng này sử dụng tốt nhất trong môi trường mạng LAN an toàn.
- **Sử Dụng Khởi Động Nhanh**: Dùng `start.bat` (Windows) hoặc `./start.sh` (Mac/Linux) để tự động khởi động hệ thống.

### Hướng Dẫn Sử Dụng Nhanh (Dành Cho Mọi Người)
1. **Khởi động**: Chọn và chạy file `start.bat` hoặc `start.sh`. Giữ cửa sổ dòng lệnh mở.
2. **Quản Lý**: Mở trình duyệt trên máy tính hiện tại, vào địa chỉ `http://localhost:4200/admin`.
3. **Phát Video**: Trên Tivi hoặc điện thoại (cùng WiFi), mở địa chỉ IP được hệ thống cung cấp (ví dụ: `http://192.168.1.5:4200`) để truy cập Dashboard, hoặc tự điền `. /player` để xem video.
4. Chọn danh sách phát, và bấm chạm vào màn hình để bật tiếng / phóng to.

---

Designed with ❤️ for simple, effective digital signage.

