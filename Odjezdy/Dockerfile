
ARG BUILD_FROM=ghcr.io/home-assistant/raspberrypi3-64-homeassistant
FROM $BUILD_FROM

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Create a directory for the app
WORKDIR /usr/src/app

# Copy the application files
COPY public ./public
COPY views ./views
COPY . .
COPY run.sh /app/run.sh

# Update the package list and install tzdata
# RUN apk add -U tzdata
# ENV TZ=Europe/Berlin
# RUN cp /usr/share/zoneinfo/Europe/Berlin /etc/localtime

# RUN apt-get update && \
# apt-get install -yq tzdata && \
# ln -fs /usr/share/zoneinfo/Europe/Berlin /etc/localtime && \
# dpkg-reconfigure -f noninteractive tzdata

ENV TZ="Europe/Berlin"

# Install necessary packages on our Alpine Linux
#RUN apt install
#    nodejs \
#    npm

    # Install Node.js
RUN apt-get install --yes curl
RUN curl --silent --location https://deb.nodesource.com/setup_4.x | sudo bash -
RUN apt-get install --yes nodejs
RUN apt-get install --yes build-essential


RUN npm install express
RUN npm install os
RUN npm install ejs
RUN npm install path
RUN npm install node-fetch

# Make the script executable
RUN chmod a+x /app/run.sh

EXPOSE 8001

LABEL io.hass.version="VERSION" io.hass.type="addon" io.hass.arch="armhf|aarch64|i386|amd64"

# Run the application
ENTRYPOINT ["/app/run.sh"]
