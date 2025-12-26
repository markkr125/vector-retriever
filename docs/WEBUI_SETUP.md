# Web UI Setup Guide

Complete guide to setting up and using the Ollama-Qdrant Web UI.

## 🚀 Quick Start (5 minutes)

### Prerequisites Check

1. **Qdrant is running:**
   ```bash
   docker-compose -f qdrant-docker-compose.yml up -d
   curl http://localhost:6333/collections
   ```

2. **Ollama is running:**
   ```bash
   ollama list
   # Should show your installed models
   ```

3. **Documents are embedded:**
   ```bash
   npm run embed
   ```

### One-Command Start

```bash
npm run webui
```

That's it! Open http://localhost:5173 in your browser.

## 📖 Detailed Setup

### Step 1: Install Dependencies

```bash
# Root dependencies (if not already installed)
npm install

# Web UI dependencies
cd web-ui
npm install
cd ..
```

### Step 2: Configure Environment

Ensure your `.env` file has these settings:

```env
# Ollama API
OLLAMA_URL=http://localhost:11434/api/embed
MODEL=nomic-embed-text

# Qdrant
QDRANT_URL=http://localhost:6333
COLLECTION_NAME=documents

# Server (optional)
SERVER_PORT=3001
```

### Step 3: Start Services

**Option A: Automatic (Recommended)**
```bash
npm run webui
```

**Option B: Manual**
```bash
# Terminal 1: API Server
npm run server

# Terminal 2: Vue UI
cd web-ui && npm run dev
```

### Step 4: Access the UI

Open your browser to: **http://localhost:5173**

## 🎯 Using the Web UI

### Search Types

#### 1. Semantic Search
- Pure embedding-based search
- Best for: Understanding intent and meaning
- Example: "places to relax and unwind"

#### 2. Hybrid Search (Recommended)
- Combines semantic + keyword matching
- Dense weight slider: 0.0 (keywords) → 1.0 (semantic)
- Best for: Most use cases
- Example: "italian restaurant wine cellar"

#### 3. Location Search
- Filter by specific city/location
- Best for: Finding local places
- Example: Query "museum", Location "Paris"

#### 4. Geo-Radius Search
- Search within distance from coordinates
- Best for: Proximity-based searches
- Example: 48.8566, 2.3522, 50000m (50km around Paris)

### Advanced Filters

Click "▶ Advanced Filters" to access:

**Category**
- Filter by document type (hotel, restaurant, technology, etc.)

**Price Range**
- Min/Max price filters
- Example: $100 - $300

**Minimum Rating**
- Filter by rating threshold
- Example: 4.5 stars or higher

**Tags**
- Comma-separated tag matching
- Example: "luxury, spa, romantic"

**Document Type**
- All documents (default)
- Structured (with metadata)
- Unstructured (plain text)

### Reading Results

Each result card shows:

- **Rank** - Position in results (#1, #2, etc.)
- **Score** - Relevance score (0-100%)
- **Filename** - Source document
- **Metadata** - Category, location, rating, price, date
- **Tags** - Associated tags
- **Content Preview** - First 300 characters
- **Expand Button** - Show full content and metadata

Click "▼ Show More" to see:
- Complete document content
- Full metadata JSON
- All available fields

## 🎨 UI Features

### Visual Elements

- **Score Bars** - Visual representation of relevance
- **Badges** - Color-coded category and type indicators
- **Animations** - Smooth transitions and loading states
- **Responsive** - Works on desktop, tablet, and mobile

### Keyboard Shortcuts

- `Ctrl + Enter` in search box - Submit search

## 🔧 Configuration

### Change Ports

**API Server (default: 3001)**

Edit [server.js](../server.js):
```javascript
const PORT = process.env.SERVER_PORT || 3001;
```

**Vue UI (default: 5173)**

Edit [web-ui/vite.config.js](vite.config.js):
```javascript
server: {
  port: 5173,
  // ...
}
```

### Customize Theme

Edit [web-ui/src/style.css](src/style.css):

```css
:root {
  --primary-color: #4f46e5;      /* Change primary color */
  --secondary-color: #10b981;    /* Change secondary color */
  --background: #f9fafb;         /* Background color */
  /* ... more variables */
}
```

## 🐛 Troubleshooting

### "Cannot connect to API"

**Check API server is running:**
```bash
curl http://localhost:3001/api/health
```

**Expected response:**
```json
{
  "status": "ok",
  "qdrant": "connected",
  "collections": ["documents"]
}
```

**If not working:**
1. Check Qdrant is running: `docker ps`
2. Check Ollama is running: `ollama list`
3. Restart API server: `npm run server`

### "No results found"

1. **Verify documents are embedded:**
   ```bash
   curl http://localhost:6333/collections/documents
   ```
   
2. **Check point count:**
   Should show `points_count > 0`

3. **Re-embed if needed:**
   ```bash
   npm run embed
   ```

### "API server failed to start"

1. **Port 3001 in use:**
   ```bash
   lsof -i :3001
   kill <PID>
   ```

2. **Or change port in server.js**

### "Module not found" errors

```bash
# Reinstall root dependencies
rm -rf node_modules package-lock.json
npm install

# Reinstall UI dependencies
cd web-ui
rm -rf node_modules package-lock.json
npm install
cd ..
```

### CORS Errors

The API server has CORS enabled by default. If you still see errors:

1. Check `server.js` has:
   ```javascript
   app.use(cors());
   ```

2. Restart the API server

## 📊 API Reference

### Endpoints

**GET /api/health**
```bash
curl http://localhost:3001/api/health
```

**GET /api/stats**
```bash
curl http://localhost:3001/api/stats
```

**POST /api/search/semantic**
```bash
curl -X POST http://localhost:3001/api/search/semantic \
  -H "Content-Type: application/json" \
  -d '{"query": "luxury hotels", "limit": 5}'
```

**POST /api/search/hybrid**
```bash
curl -X POST http://localhost:3001/api/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{
    "query": "italian restaurant",
    "limit": 5,
    "denseWeight": 0.7
  }'
```

**POST /api/search/location**
```bash
curl -X POST http://localhost:3001/api/search/location \
  -H "Content-Type: application/json" \
  -d '{
    "query": "museum",
    "location": "Paris",
    "limit": 5
  }'
```

**POST /api/search/geo**
```bash
curl -X POST http://localhost:3001/api/search/geo \
  -H "Content-Type: application/json" \
  -d '{
    "query": "attractions",
    "latitude": 48.8566,
    "longitude": 2.3522,
    "radius": 50000,
    "limit": 5
  }'
```

## 🚢 Production Deployment

### Build for Production

```bash
cd web-ui
npm run build
```

This creates optimized files in `web-ui/dist/`.

### Serve Static Files

**Option 1: With Express**

Add to `server.js`:
```javascript
const path = require('path');
app.use(express.static(path.join(__dirname, 'web-ui/dist')));
```

**Option 2: Nginx**

```nginx
server {
  listen 80;
  
  location / {
    root /path/to/web-ui/dist;
    try_files $uri $uri/ /index.html;
  }
  
  location /api {
    proxy_pass http://localhost:3001;
  }
}
```

**Option 3: Static Host**

Deploy `web-ui/dist/` to:
- Netlify
- Vercel
- GitHub Pages
- Any static host

Update API URL in production build.

## 💡 Tips & Best Practices

### Performance

1. **Use Hybrid Search** - Best balance of speed and relevance
2. **Adjust Dense Weight** - 0.7 is usually optimal
3. **Limit Results** - Start with 10-20 results max
4. **Use Filters** - Reduce search space with category/price filters

### Query Writing

**Good Queries:**
- "luxury hotel with spa in Paris"
- "affordable italian restaurant with outdoor seating"
- "quantum computing research papers"

**Less Effective:**
- Single words: "hotel"
- Too specific: "hotel-luxury-paris-2023-spa-5star"

### Result Interpretation

- **Score > 0.8** - Highly relevant
- **Score 0.6-0.8** - Good match
- **Score < 0.6** - Loosely related

## 🎓 Learning Resources

- [Vue.js Documentation](https://vuejs.org/)
- [Vite Documentation](https://vitejs.dev/)
- [Express.js Guide](https://expressjs.com/)
- [Qdrant Docs](https://qdrant.tech/documentation/)

## 🤝 Contributing

Want to improve the UI? Consider:

1. **New Features**
   - Saved searches
   - Search history
   - Result export (CSV/JSON)
   - Bulk operations
   - Dashboard/analytics

2. **UI Improvements**
   - Dark mode toggle
   - More themes
   - Accessibility enhancements
   - Mobile optimization

3. **Backend Features**
   - Caching layer
   - Rate limiting
   - User authentication
   - Multi-collection support

## 📝 License

MIT

---

**Need help?** Check the main [README.md](../README.md) or open an issue.
