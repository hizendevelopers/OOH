FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN npm ci --no-fund --no-audit
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/app/db/certs/supabase-ca.crt
ENV IBVS_EVIDENCE_DIR=/var/lib/ibvs/evidence
RUN mkdir -p /var/lib/ibvs/evidence && chown node:node /var/lib/ibvs/evidence && chmod 700 /var/lib/ibvs/evidence
EXPOSE 3000
USER node
CMD ["npm","start"]
