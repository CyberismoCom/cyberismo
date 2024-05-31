## Getting Started

Install dependencies with:

```
npm install
```

...and start the development server. The Cyberismo project needs to be given as project_path parameter.

```
npm run dev --project_path=/path/to/a/cyberismo/project
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Usually you would want to run the app via the Cyberismo CLI tool. Install the CLI tool with instructions in the repository main readme and start the app by running `cyberismo app` in a Cyberismo project folder.

## App structure

The app uses API routes (`app/api` folder) to implement a basic REST API to fetch project cards structure and individual card content via the data-handler package. The front end part (rest of the content in `app` folder) implement the app UI using React and Material UI components.

Asciidoctor.js is used to convert AsciiDoc content into HTML. This is done in front end.

## Tests

Run tests with:

```
npm run test
```
