# 🎯 Advanced Location Search & Complex Queries Guide

## Location Search Methods

### 1. **City/Location Name Filter**

Search for documents in a specific city:

```bash
node index.js location Paris "luxury hotel"
node index.js location Boston "medical treatment"
node index.js location Tokyo "electronics shopping"
```

**Use cases:**
- Finding all venues in a specific city
- Comparing options within one location
- Location-specific recommendations

### 2. **Geo-Radius Search**

Search within a radius (in meters) around coordinates:

```bash
node index.js geo 48.8566 2.3522 50000 "tourist attractions"
# Finds everything within 50km of Paris center

node index.js geo 35.7022 139.7745 10000 "gaming stores"
# Finds everything within 10km of Akihabara, Tokyo
```

**Use cases:**
- Finding nearby venues from current location
- Travel planning within a specific area
- Delivery/service radius searches

### 3. **Multiple Locations (OR Logic)**

```javascript
filter: {
  should: [
    { key: 'location', match: { value: 'Paris' } },
    { key: 'location', match: { value: 'London' } },
    { key: 'location', match: { value: 'Tokyo' } }
  ]
}
```

### 4. **Geo-Bounding Box**

For rectangular areas:

```javascript
filter: {
  must: [{
    key: 'coordinates',
    geo_bounding_box: {
      top_left: { lat: 48.9, lon: 2.2 },
      bottom_right: { lat: 48.8, lon: 2.5 }
    }
  }]
}
```

---

## Complex Document Examples

### New Rich Documents Added:

1. **Ultra-Luxury Hotel Dubai** ($850)
   - Categories: hotel, luxury, family-friendly
   - Features: underwater suites, waterpark, Michelin restaurants
   - Tags: beach, spa, all-inclusive, waterpark

2. **Michelin-Star Restaurant Singapore** ($320)
   - Categories: restaurant, fine-dining
   - Features: molecular gastronomy, 18-course tasting menu
   - Tags: michelin-star, reservation-required, innovative

3. **Tech Coworking Barcelona** ($450/month)
   - Categories: coworking, startup space
   - Features: 24/7 access, networking events, rooftop terrace
   - Tags: tech, networking, high-speed-internet

4. **Medical Hospital Boston** (Free)
   - Categories: hospital, healthcare
   - Features: cancer treatment, cardiology, emergency services
   - Tags: research, cancer-treatment, emergency, pediatrics

5. **University Cambridge** ($75,000/year)
   - Categories: education, university
   - Features: 800 years history, Nobel laureates, scholarships
   - Tags: prestigious, stem, humanities, research

6. **Luxury Gym Los Angeles** ($180/month)
   - Categories: fitness, gym
   - Features: spa, pool, personal training, celebrity trainers
   - Tags: personal-training, yoga, swimming-pool, sauna

7. **Musée d'Orsay Paris** ($18)
   - Categories: museum, art
   - Features: Impressionist masterpieces, Monet, Renoir
   - Tags: art, impressionism, wheelchair-accessible

8. **Specialty Café Melbourne** ($22 avg)
   - Categories: cafe, brunch
   - Features: award-winning coffee, innovative brunch
   - Tags: coffee, vegan-options, wifi, instagram-worthy

9. **Akihabara Electronics Tokyo** (Free entry)
   - Categories: shopping, electronics
   - Features: gaming, anime, manga, retro games
   - Tags: electronics, gadgets, anime, manga, games

---

## Advanced Query Examples

### Example 1: Price Range + Tags
Find luxury hotels with spa under $500:

```javascript
filter: {
  must: [
    { key: 'category', match: { value: 'hotel' } },
    { key: 'tags', match: { any: ['luxury', 'spa'] } },
    { key: 'price', range: { lte: 500 } }
  ]
}
```

**Results:** Hotel in Paris ($450)

### Example 2: Rating + Category OR Logic
High-rated restaurants OR museums:

```javascript
filter: {
  must: [
    { key: 'rating', range: { gte: 4.7 } }
  ],
  should: [
    { key: 'category', match: { value: 'restaurant' } },
    { key: 'category', match: { value: 'museum' } }
  ]
}
```

### Example 3: Multiple Tag Requirements
Family-friendly luxury beach hotels:

```javascript
filter: {
  must: [
    { key: 'tags', match: { any: ['luxury', 'family-friendly'] } },
    { key: 'tags', match: { any: ['beach', 'waterpark'] } }
  ]
}
```

**Results:** Dubai ultra-luxury hotel with beach and waterpark

### Example 4: Exclusion (must_not)
Places with food but NOT restaurants:

```javascript
filter: {
  must_not: [
    { key: 'category', match: { value: 'restaurant' } }
  ]
}
```

**Results:** Cafes, coworking spaces, gyms, theme parks

### Example 5: Location + Price Range
Mid-range options ($100-500) in Asia:

```javascript
filter: {
  must: [
    { key: 'price', range: { gte: 100, lte: 500 } }
  ],
  should: [
    { key: 'location', match: { value: 'Tokyo' } },
    { key: 'location', match: { value: 'Singapore' } },
    { key: 'location', match: { value: 'Dubai' } }
  ]
}
```

### Example 6: Geo-Radius + Category + Rating
Top attractions within 100km of Paris:

```javascript
filter: {
  must: [
    { key: 'rating', range: { gte: 4.5 } },
    {
      key: 'coordinates',
      geo_radius: {
        center: { lat: 48.8566, lon: 2.3522 },
        radius: 100000
      }
    }
  ]
}
```

### Example 7: Complex Nested Logic
Premium experiences (4.8+ rating) that are either hotels OR Michelin restaurants:

```javascript
filter: {
  must: [
    { key: 'rating', range: { gte: 4.8 } }
  ],
  should: [
    { key: 'category', match: { value: 'hotel' } },
    { key: 'tags', match: { any: ['michelin-star', 'fine-dining'] } }
  ],
  must_not: [
    { key: 'status', match: { value: 'closed' } }
  ]
}
```

---

## Real-World Use Cases

### Use Case 1: Travel Planning
**Goal:** Find luxury hotels with spa in Paris under $500

```bash
node index.js location Paris "luxury spa hotel"
# Then apply price filter in code
```

### Use Case 2: Medical Tourism
**Goal:** Find top-rated hospitals in Boston

```bash
node index.js location Boston "medical treatment cancer"
```

### Use Case 3: Digital Nomad
**Goal:** Find coworking spaces with good amenities

```bash
node index.js hybrid "coworking space with fast internet"
```

### Use Case 4: Foodie Travel
**Goal:** Find Michelin-starred restaurants in Asia

```bash
node index.js hybrid "michelin star fine dining"
# Filter by location: Singapore, Tokyo, etc.
```

### Use Case 5: Family Vacation
**Goal:** Find family-friendly resorts with activities

```bash
node index.js search "family resort with waterpark and kids activities"
```

---

## Dataset Statistics

**Total Documents:** 21

### By Category:
- Hotels: 4 (Budget to Ultra-Luxury)
- Restaurants: 4 (Italian, Vegan, Seafood, Molecular)
- Attractions: 3 (Museums, Parks, Theme Parks)
- Technology: 3 (AI, Quantum, Blockchain)
- Other: 7 (Coworking, Hospital, University, Gym, Cafe, Shopping)

### Price Range:
- Free: 3 documents (Museums, Hospital, Public spaces)
- Under $50: 3 (Café, Yosemite, Smithsonian)
- $50-$200: 4 (Restaurants, Gym, Coworking)
- $200-$500: 5 (Hotels, Fine dining)
- Over $500: 2 (Ultra-luxury hotel, University)

### Geographic Coverage:
- Europe: 5 (Paris, London, Barcelona, Cambridge)
- North America: 6 (NYC, Boston, SF, LA, Orlando, Washington DC)
- Asia: 5 (Tokyo, Singapore, Dubai)
- Australia: 1 (Melbourne)

### Rating Distribution:
- 4.9★: 5 documents
- 4.8★: 3 documents
- 4.7★: 3 documents
- 4.6★: 3 documents
- 4.5★: 3 documents
- Below 4.5★: 4 documents

---

## Running Examples

```bash
# Run all advanced filtering examples
node examples/examples.js

# Test location search
node index.js location Paris "art museum"
node index.js location Boston "hospital"

# Test geo search
node index.js geo 48.8566 2.3522 50000 "attractions"

# Test hybrid search
node index.js hybrid "luxury spa resort family"

# Run comprehensive demo
npm run demo
```

---

## Key Insights

1. **Hybrid Search** provides better results than pure semantic search
2. **Payload Indexes** enable fast filtering without full scans
3. **Geo-Queries** work seamlessly with coordinate data
4. **Complex Filters** support real-world business logic
5. **Rich Metadata** enables sophisticated filtering scenarios
6. **Tag Arrays** allow flexible categorization
7. **Price Ranges** enable budget-based filtering
8. **Rating Filters** ensure quality results

The system now handles 21+ diverse documents with complex metadata, demonstrating production-ready filtering capabilities!
