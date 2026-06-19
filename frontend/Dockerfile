FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

ENV API_URL=http://prospeccion-api:3001

RUN npm run build

EXPOSE 3002

CMD ["npx", "next", "start", "-p", "3002"]
