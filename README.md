# AdPlay - Digital Signage Solution

A lightweight, local-network-friendly digital signage system.

## Project Structure
-   `frontend/`: Angular application (Dashboard & Player).
-   `backend/`: Express.js server (API & File Storage).

## Getting Started

### Prerequisites
-   Node.js (v18+ recommended)
-   npm

### Installation

1.  **Frontend**:
    ```bash
    cd frontend
    npm install
    ```

2.  **Backend**:
    ```bash
    cd backend
    npm install
    ```

### Running the Application

To access the application from other devices on the same network, you must run both the frontend and backend.

#### 1. Start the Backend
```bash
cd backend
npm run dev
```
*The server will log the local IP address (e.g., `http://192.168.1.10:3000`).*

#### 2. Start the Frontend
```bash
cd frontend
npm run start
```
*The frontend will be available at `http://0.0.0.0:4200` locally.*

## Accessing via Local Network

1.  **Find your Work Machine's IP Address**:
    -   Look at the backend terminal output, it will show something like: `Server available at http://192.168.1.x:3000`.
    -   Or run `ifconfig` (Mac/Linux) / `ipconfig` (Windows).

2.  **On Other Devices (TV, Phone, etc.)**:
    -   Open a browser and go to: `http://<YOUR_IP>:4200`
    -   Example: `http://192.168.1.15:4200`

## Features
-   **Dashboard** (`/admin`): Manage profiles, upload videos, and organize playlists.
-   **Player** (`/player`): Clean, UI-free video player for digital signage displays.
    -   *Note*: Click "Chạm Để Bật Tiếng" if audio does not autoplay.
