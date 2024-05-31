#!/bin/bash

# Check if tag argument is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <tag>"
  exit 1
fi

TAG=$1
ARCHITECTURES=("aarch64")
BUILD_FROM_BASE="homeassistant"
CONFIG_FILE="config.yaml"

# Check if config.yaml exists
if [ ! -f "$CONFIG_FILE" ]; then
  echo "$CONFIG_FILE does not exist."
  exit 1
fi

# Update version in config.yaml (cross-platform compatible)
sed -i.bak "s/version: \".*\"/version: \"${TAG}\"/" "$CONFIG_FILE" && rm "${CONFIG_FILE}.bak"

for ARCH in "${ARCHITECTURES[@]}"; do
  # Define the build argument
  BUILD_FROM="${BUILD_FROM_BASE}/${ARCH}-base:latest"
  # Define the image name
  IMAGE_NAME="cibetik/odjezdy-${ARCH}:${TAG}"
  
  # Build the Docker image
  docker buildx build --build-arg BUILD_FROM="${BUILD_FROM}" -t "${IMAGE_NAME}" .
  
  # Push the Docker image
  docker push "${IMAGE_NAME}"
done
