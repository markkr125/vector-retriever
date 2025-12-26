# 🚀 Web UI Quick Reference

## Start the Web UI

```bash
npm run webui
```

Then open: **http://localhost:5173**

## Prerequisites

✅ Qdrant running: `docker-compose -f qdrant-docker-compose.yml up -d`  
✅ Ollama running: `ollama list`  
✅ Data embedded: `npm run embed`

## Search Types

| Type | Best For | Example |
|------|----------|---------|
| **Hybrid** ⭐ | Most queries | "luxury hotel spa" |
| **Semantic** | Conceptual | "places to relax" |
| **Location** | City-based | "museum" in "Paris" |
| **Geo** | Distance | Within 50km of coordinates |

## Quick Filters

- **Category**: hotel, restaurant, technology, etc.
- **Price**: Min/Max range ($100-$300)
- **Rating**: Minimum stars (4.5+)
- **Tags**: luxury, spa, romantic (comma-separated)
- **Type**: Structured or Unstructured docs

## Ports

- 🌐 Web UI: `5173`
- 🔧 API: `3001`
- 📊 Qdrant: `6333`

## Shortcuts

- `Ctrl + Enter` - Search
- Click result card - Expand/collapse

## Troubleshooting

**No results?**
```bash
npm run embed  # Re-embed documents
```

**API not connecting?**
```bash
curl http://localhost:3001/api/health
```

**Need to restart?**
```bash
# Ctrl+C to stop, then:
npm run webui
```

## Manual Start

```bash
# Terminal 1: API
npm run server

# Terminal 2: UI
cd web-ui && npm run dev
```

## Documentation

- 📖 [Main README](README.md)
- 🌐 [Web UI Setup](WEBUI_SETUP.md)
- 📚 [Full Docs](docs/)

---

**Happy searching! 🔍**
