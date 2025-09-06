FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
COPY SQL_SCHEMA.sql ./
EXPOSE 4000
CMD ["node", "src/app.js"]


