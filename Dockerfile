FROM docker.io/continuumio/miniconda3:24.11.1-0

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV SHELL=/bin/bash
ENV PATH /opt/conda/envs/clingo-env/bin:$PATH
ENV PATH /usr/local/share/pnpm:$PATH
ENV PNPM_HOME=/usr/local/share/pnpm

# Necessary packages
RUN apt-get update && apt-get install -y curl git && \
    curl -fsSL https://deb.nodesource.com/setup_21.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/* && \
    conda create -n clingo-env -y python=3.12 && \
    /bin/bash -c "\
        source activate clingo-env && \
        conda install -c conda-forge clingo && \
        conda install -c potassco clingraph && \
        conda clean --all --yes \
    " && \
    npm install -g pnpm antora && \
    git clone https://github.com/CyberismoCom/cyberismo.git /cyberismo && \
    cd /cyberismo && \
    /bin/bash -c "pnpm setup && pnpm install && pnpm build && pnpm link -g" && \
    rm -rf /cyberismo/tools/app/.next/cache/ && \
    pnpm store prune && pnpm prune --prod && \
    find /cyberismo -path /cyberismo/node_modules -prune -o -exec chmod 777 {} \;

WORKDIR /project

# Set default command
CMD ["cyberismo"]
