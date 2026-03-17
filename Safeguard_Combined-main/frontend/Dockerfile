# Base image
FROM node:20
 
# Set working directory
WORKDIR /app
 
# Install dependencies
COPY package.json package-lock.json ./
RUN npm install
 
# Copy rest of the code
COPY . .
 
# Expose the Vite dev server port
EXPOSE 5173
 
# Start Vite development server with host exposed
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]