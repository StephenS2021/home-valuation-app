FROM node:20-alpine AS build
# Create /app directory inside the image's filesystem and set it as the working directory
WORKDIR /app
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Create new image from nginx, which automatically runs nginx when the container starts
FROM nginx:alpine 
# Copy the compiled code from the build stage to nginx default directory for static files
COPY --from=build /app/dist /usr/share/nginx/html 
EXPOSE 80