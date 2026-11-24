FROM node:24-alpine AS frontend
WORKDIR /club/frontend
RUN npm install --global pnpm@11.25.0
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/src ./src
RUN pnpm run build

FROM python:3.12-slim
WORKDIR /club
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
COPY --from=frontend /club/static/bbchess.js ./static/bbchess.js
CMD ["python","club.py","--help"]
