# dist는 EC2에서 직접 빌드 후 복사 (메모리 절약)
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY dist ./dist

EXPOSE 3001

CMD ["node", "dist/main"]
