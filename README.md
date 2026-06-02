# 🤝 Haath – Open Service Marketplace (Backend)

A backend for an open-market service platform where **any service provider can enlist** and customers can post requirements, receive bids, and hire the best fit — similar to Urban Company but with an open bidding model.

## 🔗 Related Repositories

| Portal | Repo | Description | Live |
|--------|------|-------------|------|
| Backend (this repo) | [marketplacebe](https://github.com/RND2002/marketplacebe) | REST API server — auth, bidding engine, service categories, role management | — |
| Frontend App | [marketplacefe](https://github.com/RND2002/marketplacefe) | Unified React app for both customers and providers — post requirements, browse & submit bids, manage bookings | [Live](https://staging-haath.netlify.app/login) |

> ⚠️ Backend hosted on Render free tier — may take **30–50 seconds to wake up** on first request.

---

## ✨ Features

- **Open Provider Enlistment** — any service provider can register, create a profile, and list their services without approval gates
- **Bidding System** — customers post service requirements; providers browse and submit competitive bids; customers review and accept
- **Role Separation** — distinct flows and permissions for Customers vs Service Providers
- **JWT Authentication** — stateless auth with HttpOnly cookie support
- **Service Category Management** — dynamic service categories with MongoDB-style flexible modeling via Prisma
- **Bid Lifecycle Management** — full workflow: post → bid → accept → complete → review
- **ESLint + Prettier** — enforced code quality and consistent formatting
- **Jest Test Setup** — testing infrastructure configured and ready

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js + TypeScript |
| Framework | Fastify |
| ORM | Prisma |
| Database | PostgreSQL |
| Auth | JWT + HttpOnly Cookies |
| Testing | Jest |
| Linting | ESLint + Prettier |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm
- PostgreSQL database

### Installation

```bash
# Clone the repo
git clone https://github.com/RND2002/marketplacebe.git
cd marketplacebe

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Fill in your DATABASE_URL, JWT_SECRET

# Push DB schema
npx prisma db push

# Start dev server
npm run dev
```

### Environment Variables

```env
DATABASE_URL=your_postgres_connection_string
JWT_SECRET=your_jwt_secret
PORT=3000
```

---

## 📁 Project Structure

```
src/
├── modules/         # Feature modules (auth, bids, services, users)
├── middleware/       # Auth guards and role checks
├── utils/           # Shared utilities
└── index.ts         # App entry point
prisma/
└── schema.prisma    # Database schema
```

---

## 🔄 Core Flow

```
Customer posts a service requirement
        ↓
Providers browse open requirements
        ↓
Providers submit bids (price + details)
        ↓
Customer reviews bids and accepts one
        ↓
Service is completed and reviewed
```

---

## 👤 Author

**Aryan Dwivedi**
[GitHub](https://github.com/RND2002) · [LinkedIn](https://www.linkedin.com/in/aryan-dwivedi)
