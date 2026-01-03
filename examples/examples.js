#!/usr/bin/env node

/**
 * Advanced Filtering Examples for Qdrant
 * This file demonstrates complex query patterns
 */

const { QdrantClient } = require('@qdrant/js-client-rest');
const axios = require('axios');
require('dotenv').config({ quiet: true });

const OLLAMA_URL = process.env.OLLAMA_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const MODEL = process.env.MODEL;
const QDRANT_URL = process.env.QDRANT_URL;
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'documents';

const qdrantClient = new QdrantClient({ url: QDRANT_URL });

async function getDenseEmbedding(text) {
  const headers = { 'Content-Type': 'application/json' };
  if (AUTH_TOKEN) headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  
  const response = await axios.post(OLLAMA_URL, {
    model: MODEL,
    input: text
  }, { headers });
  
  return response.data.embeddings[0];
}

// Example 1: Find luxury hotels under $500 with spa
async function example1() {
  console.log('\n' + '='.repeat(70));
  console.log('EXAMPLE 1: Luxury hotels with spa under $500');
  console.log('='.repeat(70));
  
  const query = 'luxury hotel with spa facilities';
  const embedding = await getDenseEmbedding(query);
  
  const results = await qdrantClient.search(COLLECTION_NAME, {
    vector: { name: 'dense', vector: embedding },
    filter: {
      must: [
        { key: 'category', match: { value: 'hotel' } },
        { key: 'tags', match: { any: ['luxury', 'spa'] } },
        { key: 'price', range: { lte: 500 } }
      ]
    },
    limit: 5,
    with_payload: true
  });
  
  results.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.payload.filename} (Score: ${r.score.toFixed(4)})`);
    console.log(`   Location: ${r.payload.location}, Price: $${r.payload.price}`);
    console.log(`   Tags: ${r.payload.tags.join(', ')}`);
  });
}

// Example 2: High-rated restaurants OR museums in specific cities
async function example2() {
  console.log('\n' + '='.repeat(70));
  console.log('EXAMPLE 2: Top-rated dining or cultural experiences');
  console.log('='.repeat(70));
  
  const query = 'amazing food and cultural experiences';
  const embedding = await getDenseEmbedding(query);
  
  const results = await qdrantClient.search(COLLECTION_NAME, {
    vector: { name: 'dense', vector: embedding },
    filter: {
      must: [
        { key: 'rating', range: { gte: 4.7 } }
      ],
      should: [
        { key: 'category', match: { value: 'restaurant' } },
        { key: 'category', match: { value: 'museum' } }
      ]
    },
    limit: 5,
    with_payload: true
  });
  
  results.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.payload.filename} (Score: ${r.score.toFixed(4)})`);
    console.log(`   ${r.payload.category} in ${r.payload.location}`);
    console.log(`   Rating: ${r.payload.rating}/5, Price: $${r.payload.price || 0}`);
  });
}

// Example 3: Find places with specific tags (AND logic)
async function example3() {
  console.log('\n' + '='.repeat(70));
  console.log('EXAMPLE 3: Family-friendly luxury beach hotels');
  console.log('='.repeat(70));
  
  const query = 'family vacation resort';
  const embedding = await getDenseEmbedding(query);
  
  const results = await qdrantClient.search(COLLECTION_NAME, {
    vector: { name: 'dense', vector: embedding },
    filter: {
      must: [
        { key: 'tags', match: { any: ['luxury', 'family-friendly'] } },
        { key: 'tags', match: { any: ['beach', 'waterpark'] } }
      ]
    },
    limit: 5,
    with_payload: true
  });
  
  results.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.payload.filename} (Score: ${r.score.toFixed(4)})`);
    console.log(`   ${r.payload.location} - $${r.payload.price}`);
    console.log(`   Tags: ${r.payload.tags.join(', ')}`);
  });
}

// Example 4: Exclude specific categories
async function example4() {
  console.log('\n' + '='.repeat(70));
  console.log('EXAMPLE 4: Non-restaurant venues with food/drinks');
  console.log('='.repeat(70));
  
  const query = 'place with food and drinks';
  const embedding = await getDenseEmbedding(query);
  
  const results = await qdrantClient.search(COLLECTION_NAME, {
    vector: { name: 'dense', vector: embedding },
    filter: {
      must_not: [
        { key: 'category', match: { value: 'restaurant' } }
      ]
    },
    limit: 5,
    with_payload: true
  });
  
  results.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.payload.filename} (Score: ${r.score.toFixed(4)})`);
    console.log(`   Category: ${r.payload.category}, Location: ${r.payload.location}`);
  });
}

// Example 5: Price range with location filter
async function example5() {
  console.log('\n' + '='.repeat(70));
  console.log('EXAMPLE 5: Mid-range options in Asia ($100-$500)');
  console.log('='.repeat(70));
  
  const query = 'accommodation or activities';
  const embedding = await getDenseEmbedding(query);
  
  const results = await qdrantClient.search(COLLECTION_NAME, {
    vector: { name: 'dense', vector: embedding },
    filter: {
      must: [
        { key: 'price', range: { gte: 100, lte: 500 } }
      ],
      should: [
        { key: 'location', match: { value: 'Tokyo' } },
        { key: 'location', match: { value: 'Singapore' } },
        { key: 'location', match: { value: 'Dubai' } }
      ]
    },
    limit: 5,
    with_payload: true
  });
  
  results.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.payload.filename} (Score: ${r.score.toFixed(4)})`);
    console.log(`   ${r.payload.location} - $${r.payload.price} - ${r.payload.category}`);
  });
}

// Example 6: Geo-radius with category and rating filter
async function example6() {
  console.log('\n' + '='.repeat(70));
  console.log('EXAMPLE 6: Top attractions within 100km of Paris');
  console.log('='.repeat(70));
  
  const query = 'tourist attractions and activities';
  const embedding = await getDenseEmbedding(query);
  
  const results = await qdrantClient.search(COLLECTION_NAME, {
    vector: { name: 'dense', vector: embedding },
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
    },
    limit: 5,
    with_payload: true
  });
  
  results.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.payload.filename} (Score: ${r.score.toFixed(4)})`);
    console.log(`   ${r.payload.location} - Rating: ${r.payload.rating}/5`);
    console.log(`   Coordinates: ${r.payload.coordinates?.lat}, ${r.payload.coordinates?.lon}`);
  });
}

// Example 7: Complex nested conditions
async function example7() {
  console.log('\n' + '='.repeat(70));
  console.log('EXAMPLE 7: Premium experiences (rating 4.8+) with multiple criteria');
  console.log('='.repeat(70));
  
  const query = 'premium luxury experience';
  const embedding = await getDenseEmbedding(query);
  
  const results = await qdrantClient.search(COLLECTION_NAME, {
    vector: { name: 'dense', vector: embedding },
    filter: {
      must: [
        { key: 'rating', range: { gte: 4.8 } }
      ],
      should: [
        // Either expensive hotel
        {
          key: 'category',
          match: { value: 'hotel' }
        },
        // Or Michelin-starred restaurant
        {
          key: 'tags',
          match: { any: ['michelin-star', 'fine-dining'] }
        }
      ],
      must_not: [
        { key: 'status', match: { value: 'closed' } }
      ]
    },
    limit: 5,
    with_payload: true
  });
  
  results.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.payload.filename} (Score: ${r.score.toFixed(4)})`);
    console.log(`   ${r.payload.category} in ${r.payload.location}`);
    console.log(`   Rating: ${r.payload.rating}/5, Price: $${r.payload.price || 'Free'}`);
    console.log(`   Tags: ${r.payload.tags?.slice(0, 4).join(', ')}`);
  });
}

async function runAllExamples() {
  console.log('\n🎯 ADVANCED FILTERING EXAMPLES\n');
  
  await example1();
  await new Promise(r => setTimeout(r, 1000));
  
  await example2();
  await new Promise(r => setTimeout(r, 1000));
  
  await example3();
  await new Promise(r => setTimeout(r, 1000));
  
  await example4();
  await new Promise(r => setTimeout(r, 1000));
  
  await example5();
  await new Promise(r => setTimeout(r, 1000));
  
  await example6();
  await new Promise(r => setTimeout(r, 1000));
  
  await example7();
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ All examples completed!');
  console.log('='.repeat(70) + '\n');
}

runAllExamples().catch(console.error);
