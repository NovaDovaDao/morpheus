# Use a Deno base image
FROM denoland/deno:1.37.2

# Set the working directory inside the container
WORKDIR /app

# Copy only the essential files first to leverage Docker layer caching
COPY deno.json deno.lock ./
COPY main.ts ./

# Cache dependencies
RUN deno cache --reload main.ts

# Copy the rest of the application code
COPY . .

# Set the entrypoint for the container
CMD ["run", "-A", "main.ts"]

# Expose the port the application listens on
EXPOSE 3000