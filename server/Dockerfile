# Creating the image for the server
FROM node:22-alpine AS build
# Create /app directory inside the image's filesystem and set it as the working directory
WORKDIR /app 
# Copy package and package-lock files to the working directory
COPY package*.json ./ 
# Install everything in package-lock.json
RUN npm ci 
# Copy the rest of my code from /server into the daemon and into /app
COPY . . 
# Build the project
# Build script is tsc, which reads from tsconfig.json and takes server.ts from ./ and writes server.js to ./dist
RUN npm run build 

# running the image for the server
# We create a second image so that we dont have the dev dependencies in the final image, which makes our final image smaller
# Create a brand new image from the node:22-alpine image
FROM node:22-alpine 
WORKDIR /app
COPY package*.json ./
# Skip installing dev dependencies because running only compiled code
RUN npm ci --omit=dev 
# Copy the compiled code from the build stage
COPY --from=build /app/dist ./dist 
# Expose port 3000 to the host machine
EXPOSE 3000 
# This actually runs the compiled code in the container
CMD ["node", "dist/server.js"] 
