FROM node:22-alpine

ENV NODE_ENV=production \
    LUXU_DATA_DIR=/app/data

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src ./src

RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
CMD ["node", "src/index.js"]
