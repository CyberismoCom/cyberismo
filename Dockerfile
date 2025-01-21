# Use the custom Clingo base image
FROM cyberismo-clingo-base

# Clone the Cyberismo repository
RUN git clone https://github.com/CyberismoCom/cyberismo.git /cyberismo

# Install and build Cyberismo
WORKDIR /cyberismo
RUN pnpm install \
    && rm -rf .git \
    && pnpm build \
    && pnpm link -g \
    && pnpm store prune \
    && rm -rf /cyberismo/tools/app/.next/cache/ \
    && pnpm prune --prod \
    && find /cyberismo -path /cyberismo/node_modules -prune -o -exec chmod 777 {} \;

# Set the working directory for the final image
WORKDIR /project




