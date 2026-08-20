## Command-line interface for [Cyberismo Solution](https://cyberismo.com/solution/)

The Cyberismo CLI is an open-source command-line tool that enables Security-as-Code workflows for cybersecurity management and compliance. It provides comprehensive functionality for managing cybersecurity content, from card-based project management to automated reporting and compliance tracking.

### Prerequisites

- **Node.js (required)**: v22 LTS or later.

  The Clingo answer set solver is bundled as a prebuilt native binary for
  Linux and macOS on x64 and arm64 and for Windows on x64, so no compiler,
  toolchain or separate Clingo installation is needed.

- **Asciidoctor PDF (optional, for PDF export)**
  - **macOS**: `brew install ruby && gem install --no-document asciidoctor-pdf rouge`
  - **Ubuntu/Debian**: `sudo apt-get install -y ruby-full build-essential && sudo gem install --no-document asciidoctor-pdf rouge`
  - **Windows**: See https://www.ruby-lang.org/en/documentation/installation/ and run `gem install --no-document asciidoctor-pdf rouge`
  - **Verify**: `asciidoctor-pdf -v`

- **Mermaid CLI (optional, for mermaid diagrams in PDF export)**
  - **All platforms**: `npm install -g @mermaid-js/mermaid-cli`
  - **Verify**: `mmdc --version`

### Getting started

1. **Install Cyberismo CLI**

   ```bash
   npm install -g @cyberismo/cli
   ```

2. **Clone the demo repository**

   ```bash
   git clone https://github.com/CyberismoCom/cyberismo-demo.git
   cd cyberismo-demo
   ```

3. **Launch the application**
   ```bash
   cyberismo app
   ```

The application will be available in your browser at `http://localhost:3000`
