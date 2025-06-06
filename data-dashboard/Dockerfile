FROM node:alpine as build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM httpd:2.4
COPY --from=build-stage /app/build  /usr/local/apache2/htdocs/lac-unga-dashboard/
EXPOSE 80