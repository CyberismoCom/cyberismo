# use node 22
FROM node:22

# install pnpm
RUN npm install -g pnpm

# Clone the Cyberismo repository
RUN git clone https://github.com/CyberismoCom/cyberismo.git /cyberismo

# Install and build Cyberismo
WORKDIR /cyberismo

RUN apt-get update && apt-get install -y gringo software-properties-common python3 python3-pip build-essential

#clingraph via pip
RUN pip3 install clingraph --break-system-packages

RUN pnpm install    
RUN rm -rf .git

RUN pnpm build
ENV PNPM_HOME=/opt/cyberismo
ENV PATH=$PNPM_HOME:$PATH
RUN pnpm link --global
RUN pnpm store prune
RUN pnpm prune --prod
RUN find /cyberismo -path /cyberismo/node_modules -prune -o -exec chmod 777 {} \;

# Set the working directory for the final image
WORKDIR /project    
