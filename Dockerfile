FROM node:20-alpine

# ffmpeg para recodificación de audio
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Instalar dependencias
COPY package.json package-lock.json* ./
RUN npm install

# Copiar código fuente
COPY src/ ./src/
COPY tsconfig.json ./

# Compilar TypeScript (ignorar errores de tipos de librerías externas)
RUN npx tsc --skipLibCheck

# Limpiar devDependencies
RUN npm prune --production

EXPOSE 3001

CMD ["node", "dist/index.js"]
