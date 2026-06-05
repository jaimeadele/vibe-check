FROM node:20-alpine

WORKDIR /app

# Copy the full repo
COPY . .

# Build frontend (outputs to backend/dist/public via vite.config.ts outDir)
RUN npm install --prefix frontend && npm run build --prefix frontend

# Build backend
WORKDIR /app/backend
RUN npm install && npx prisma generate && npm run build

# Run migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
