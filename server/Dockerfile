# dist는 EC2에서 직접 빌드 후 복사 (메모리 절약)
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache docker-cli python3 py3-pip && pip install --break-system-packages curl-cffi beautifulsoup4 lxml

COPY package*.json ./
RUN npm ci --omit=dev
RUN npm i -g pm2

COPY generated ./generated
COPY dist ./dist
COPY ecosystem.config.js ./

EXPOSE 3001

CMD ["pm2-runtime", "start", "ecosystem.config.js"]
