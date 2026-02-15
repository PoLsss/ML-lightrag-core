# syntax=docker/dockerfile:1

# ============================================================
# Stage 1: Build the React/Vite frontend
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source code (includes .env.production for build-time VITE_ vars)
COPY . .

# Vite automatically loads .env.production during `vite build`
# VITE_BACKEND_URL=/api ensures nginx reverse proxy works correctly
RUN npm run build

# ============================================================
# Stage 2: Serve with Nginx
# ============================================================
FROM nginx:alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built frontend assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port
EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
