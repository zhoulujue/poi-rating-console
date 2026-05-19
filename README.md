# POI Rating Console

Private local web app for comparing POI ratings across Google Places, TripAdvisor, Yelp, Booking, Agoda, Michelin, Brave Search, Tavily, and Gemini-powered summaries.

## Local Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create local config files from the examples:

   ```sh
   cp config.example.js config.js
   cp server-config.example.js server-config.js
   ```

3. Fill in your local API keys in `config.js` and `server-config.js`.

4. Start the local proxy server:

   ```sh
   npm start
   ```

5. Open `http://127.0.0.1:4173/`.

## Notes

- `config.js` and `server-config.js` are intentionally ignored so API keys stay local.
- The full provider search and Know Before You Go summary require the Node server; a static GitHub Pages deployment alone cannot run these proxy endpoints.
