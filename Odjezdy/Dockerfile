ARG BUILD_FROM="homeassistant/aarch64-base:latest"
FROM $BUILD_FROM

# Use Bash shell with pipefail option for all subsequent RUN commands
#  SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Create a directory for the app
WORKDIR /usr/src/app

# Copy the application files
COPY public ./public
COPY views ./views
COPY package.json ./package.json
COPY app.js ./app.js
COPY run.sh /app/run.sh

# Update the package list, install tzdata and set time zone
RUN apk add -U tzdata
ENV TZ=Europe/Berlin
RUN cp /usr/share/zoneinfo/Europe/Berlin /etc/localtime

# Install necessary packages on our Alpine Linux
RUN apk add -U nodejs
RUN apk add -U npm
RUN npm install

# Make the script executable
RUN chmod a+x /app/run.sh

EXPOSE 8001

LABEL io.hass.version="VERSION" io.hass.type="addon" io.hass.arch="armhf|aarch64|i386|amd64"

# Run the application
ENTRYPOINT ["/app/run.sh"]
