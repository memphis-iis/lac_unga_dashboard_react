FROM node:alpine as build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:alpine as production-stage
WORKDIR /app
COPY --from=build-stage /app/build /app/build
EXPOSE 3000
CMD ["npx", "serve", "-s", "build"]