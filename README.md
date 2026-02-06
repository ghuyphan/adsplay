# adsplay

A full-stack application for managing and playing video ads. This project consists of an **Angular** frontend and an **Express** backend.

## Prerequisites

Before you begin, ensure you have met the following requirements:

*   **Node.js**: v18 or higher is recommended.
*   **npm**: Included with Node.js.

## Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/ghuyphan/adsplay.git
    cd adsplay
    ```

2.  **Install Frontend Dependencies**:
    ```bash
    cd frontend
    npm install
    ```

3.  **Install Backend Dependencies**:
    ```bash
    cd ../backend
    npm install
    ```

## Running the Application

### 1. Start the Backend

The backend server handles API requests and serves the static files in production.

1.  Navigate to the `backend` directory:
    ```bash
    cd backend
    ```
2.  (Optional) Create a `.env` file based on `.env.example` if you want to configure the port:
    ```bash
    cp .env.example .env
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```
    The backend will run on `http://localhost:3000` (or your configured port).
    
    > **Note**: The backend expects an `uploads` folder to store uploaded videos. It should be created automatically, but ensure write permissions are available.

### 2. Start the Frontend

1.  Open a new terminal and navigate to the `frontend` directory:
    ```bash
    cd frontend
    ```
2.  Start the Angular development server:
    ```bash
    npm start
    ```
    The frontend will be available at `http://localhost:4200`.

## Building for Production

To build the frontend for production and serve it via the backend:

1.  **Build Frontend**:
    ```bash
    cd frontend
    npm run build
    ```
    This will generate artifacts in `frontend/dist/frontend/browser`.

2.  **Start Backend**:
    ```bash
    cd ../backend
    npm start
    ```
    The backend is configured to serve the Angular app from the `dist` folder. You can access the application at `http://localhost:3000`.

## Project Structure

*   `frontend/`: Angular application source code.
*   `backend/`: Express.js server and API implementation.
*   `backend/uploads/`: Directory where uploaded video files are stored.
*   `backend/db.json`: Simple JSON-based database for development.

## License

This project is licensed under the MIT License.
