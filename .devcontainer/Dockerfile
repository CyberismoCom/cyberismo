FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    # Clingo ASP solver included as it might be useful
    gringo \
    # C++ build tools for node-clingo native addon (requires C++20)
    g++-14 \
    python3 \
    make \
    cmake \
    # Ruby for PDF export via asciidoctor-pdf
    ruby-full \
    # C++ formatting (for node-clingo contributions)
    clang-format \
    && rm -rf /var/lib/apt/lists/*

RUN gem install --no-document asciidoctor-pdf rouge
