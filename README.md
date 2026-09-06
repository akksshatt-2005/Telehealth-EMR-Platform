# 🏥 Neuro Harmony Clinic — Telehealth & Clinical EMR Platform

[![Node.js](https://img.shields.io/badge/Node.js-v18+-68a063?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646cff?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-ORM-2d3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169e1?style=for-the-badge&logo=postgresql&logoColor=white)](https://supabase.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-Real--Time-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)
[![Razorpay](https://img.shields.io/badge/Payments-Razorpay-02042b?style=for-the-badge&logo=razorpay&logoColor=3395ff)](https://razorpay.com/)

> **Neuro Harmony Clinic** is an end-to-end modern Telehealth, Practice Management, and Clinical Electronic Medical Records (EMR) system. It unites a real-time Doctor Clinical Workspace, an intuitive Patient Booking Portal, and a resilient Express/Prisma/PostgreSQL backend engine.

---

## 🏛️ System Architecture

```mermaid
graph TD
    subgraph Clients
        DP["🩺 Doctor Portal (React 19 + Vite)"]
        PP["🧑‍⚕️ Patient Portal (React 19 + Vite)"]
    end

    subgraph Backend Services ["⚙️ Node.js / Express API"]
        AUTH["Auth & Session Controller"]
        SLOT["Atomic Slot & Booking Engine"]
        RX["Prescription & EMR Generator (PDFKit)"]
        ANALYTICS["Clinical Research & Analytics"]
        SOCKET["Socket.IO Live Hub"]
    end

    subgraph Infrastructure
        DB[("PostgreSQL / Supabase")]
        REDIS[("Redis Cache & Lock")]
        JITSI["Jitsi Meet WebRTC Video"]
        PAY["Razorpay Payment Gateway"]
        MAIL["Resend / Nodemailer Engine"]
    end

    DP <-->|REST API + WebSockets| Backend Services
    PP <-->|REST API + WebSockets| Backend Services
    Backend Services <--> DB
    Backend Services <--> REDIS
    Backend Services <--> JITSI
    Backend Services <--> PAY
    Backend Services <--> MAIL
```

---

## ✨ Key Features & Capabilities

### 🩺 1. Doctor Clinical Workspace (`doctor-portal`)
* **Live Patient Queue & Teleconsultation**: Real-time consultation room integrated with Jitsi Meet WebRTC video and active queue sync.
* **Smart EMR & Prescription Studio**:
  * Hierarchical symptom & chief complaint selector.
  * Auto-formatting clinical vitals (BP `mmHg`, Pulse `bpm`, Weight `kg`).
  * Active medicine composition search & dosage frequency scheduling.
  * Dynamic vector digital signature placement & branded PDF output.
* **Clinical Research & Practice Analytics**:
  * Practice & patient volume statistics (daily/monthly breakdowns).
  * Medication utilization & clinical diagnosis frequency analysis.
* **On-Demand Schedule Manager**: Configurable fixed & recurring availability windows (5 PM – 9 PM daily on-demand slots).
* **Follow-up Cloning & Offline Records**: One-click historical diagnosis & prescription duplication for returning patients.

### 🧑‍⚕️ 2. Patient Experience Portal (`patient-portal`)
* **Frictionless Booking Flow**: Live calendar slot availability with transaction-isolated locking to eliminate double-booking.
* **Secure Telemedicine Suite**: One-click video room access with automated waiting room status.
* **Digital Records Vault**: Immediate download of stamped digital prescriptions and appointment summaries.
* **Payment Integration**: Seamless checkout powered by Razorpay with payment verification and webhook fail-safes.

### ⚙️ 3. High-Performance Backend Core (`backend`)
* **Atomic Concurrency Control**: Prisma transaction isolation preventing conflicting simultaneous slot bookings.
* **Automated Cron Jobs**: Background queue cleanup and automated daily slot provisioning via `node-cron`.
* **Multi-channel Notifications**: Automated SMS logs and email dispatch with PDF attachments via Resend/Nodemailer.
* **Multi-layer Security**: Role-based JWT access tokens, password hashing with bcrypt, input sanitization, and CORS protection.

---

## 📂 Repository Structure

```text
doctor-appointment-website/
├── backend/                  # Node.js + Express REST API & Realtime Server
│   ├── assets/               # Clinic branding assets & digital signatures
│   ├── config/               # Database, payment, and mailer configs
│   ├── controllers/          # Business logic (Appointments, Slots, Rx, Auth, Analytics)
│   ├── db/                   # Prisma client & database seed scripts
│   ├── middleware/           # JWT auth, role validation, file upload handlers
│   ├── prisma/               # Database schema & migrations
│   ├── routes/               # Modular Express API endpoints
│   ├── services/             # Notifications, PDF generation, cron schedulers
│   └── server.js             # API entrypoint & Socket.IO server
│
├── doctor-portal/            # Vite + React 19 Doctor Workspace
│   ├── public/               # Public assets (avatars, icons, signatures)
│   ├── src/                  # React components, EMR studio, analytics views
│   └── vite.config.js        # Vite build & proxy configuration
│
├── patient-portal/           # Vite + React 19 Patient Web Application
│   ├── public/               # Public assets & favicons
│   ├── src/                  # Booking flows, consultation rooms, profile
│   └── vite.config.js        # Vite build & proxy configuration
│
└── .gitignore                # Production ignore rules
```

---

## 🚀 Quick Start Guide

### Prerequisites
* **Node.js**: `v18.0.0` or higher
* **npm** or **pnpm**
* **PostgreSQL** database (Local instance or [Supabase](https://supabase.com))

---

### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL, JWT_SECRET, RAZORPAY credentials, etc.

# Run database migrations and generate Prisma client
npm run prisma:generate
npm run prisma:migrate

# Seed demo doctor profiles and medicine master list
npm run prisma:seed

# Start backend server
npm run dev
# Server running at http://localhost:5001
```

---

### 2. Doctor Portal Setup

```bash
cd doctor-portal

# Install dependencies
npm install

# Start Vite dev server
npm run dev
# Application running at http://localhost:5173
```

---

### 3. Patient Portal Setup

```bash
cd patient-portal

# Install dependencies
npm install

# Start Vite dev server
npm run dev
# Application running at http://localhost:5174
```

---

## 🛠️ Tech Stack Matrix

| Area | Technologies |
| :--- | :--- |
| **Frontend** | React 19, Vite, React Router, HTML5 / CSS3 Design System |
| **Backend** | Node.js, Express.js, Socket.IO, PDFKit, Node-cron |
| **Database & ORM** | PostgreSQL, Supabase, Prisma ORM, Redis |
| **Integrations** | Jitsi Meet (WebRTC), Razorpay (Payments), Resend / Nodemailer (Email) |
| **Auth & Security**| JWT, Bcrypt, Role-Based Access Control (RBAC), CORS |

---

## 📄 License & Attribution

Developed with ❤️ for **Neuro Harmony Clinic**. All rights reserved.
