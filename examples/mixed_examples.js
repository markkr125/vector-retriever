#!/usr/bin/env node

/**
 * Mixed Dataset Examples - Structured vs Unstructured
 * Shows how to work with both types of documents
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

// Example 1: Search only unstructured documents
async function example1() {
  console.log('\n' + '='.repeat(70));
  console.log('EXAMPLE 1: Search ONLY unstructured documents (no metadata)');
  console.log('='.repeat(70));
  
  const query = 'meditation mindfulness health benefits';
  const embedding = await getDenseEmbedding(query);
  
  const results = await qdrantClient.search(COLLECTION_NAME, {
    vector: { name: 'dense', vector: embedding },
    filter: {
      must: [
        { key: 'is_unstructured', match: { value: true } }
      ]
    },
    limit: 5,
    with_payload: true
  });
  
  console.log(`\nQuery: "${query}"\n`);
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.payload.filename} (Score: ${r.score.toFixed(4)})`);
    console.log(`   Topic: ${r.payload.topic}`);
    console.log(`   Words: ${r.payload.word_count}, Chars: ${r.payload.char_count}`);
    console.log(`   Preview: ${r.payload.content.substring(0, 120)}...`);
  });
}

// Example 2: Search only structured documents with metadata
async function example2() {
  console.log('\n' + '='.repeat(70));
  console.log('EXAMPLE 2: Search ONLY structured documents (with metadata)');
  console.log('='.repeat(70));
  
  const query = 'luxury accommodation dining';
  const embedding = await getDenseEmbedding(query);
  
  const results = await qdrantClient.search(COLLECTION_NAME, {
    vector: { name: 'dense', vector: embedding },
    filter: {
      must: [
        { key: 'has_structured_metadata', match: { value: true } }
      ]
    },
    limit: 5,
    with_payload: true
  });
  
  console.log(`\nQuery: "${query}"\n`);
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.payload.filename} (Score: ${r.score.toFixed(4)})`);
    console.log(`   Category: ${r.payload.category}, Location: ${r.payload.location || 'N/A'}`);
    if (r.payload.price) console.log(`   Price: $${r.payload.price}`);
    if (r.payload.rating) console.log(`   Rating: ${r.payload.rating}/5`);
    if (r.payload.tags) console.log(`   Tags: ${r.payload.tags.slice(0, 3).join(', ')}`);
  });
}

// Example 3: Search ALL documents (mixed) 
async function example3() {
  console.log('\n' + '='.repeat(70));
  console.log('EXAMPLE 3: Search ALL documents (structured + unstructured)');
  console.log('='.repeat(70));
  
  const query = 'technology innovation artificial intelligence';
  const embedding = await getDenseEmbedding(query);
  
  const results = await qdrantClient.search(COLLECTION_NAME, {
    vector: { name: 'dense', vector: embedding },
    limit: 5,
    with_payload: true
  });
  
  console.log(`\nQuery: "${query}"\n`);
  results.forEach((r, i) => {
    const type = r.payload.is_unstructured ? '[UNSTRUCTURED]' : '[STRUCTURED]';
    console.log(`${i + 1}. ${type} ${r.payload.filename} (Score: ${r.score.toFixed(4)})`);
    if (r.payload.is_unstructured) {
      console.log(`   Topic: ${r.payload.topic}`);
    } else {
      console.log(`   Category: ${r.payload.category}, Location: ${r.payload.location || 'Global'}`);
    }
  });
}

// Example 4: Compare structured vs unstructured for same topic
async function example4() {
  console.log('\n' + '='.repeat(70));
  console.log('EXAMPLE 4: Music/Jazz - Mixed results');
  console.log('='.repeat(70));
  
  const query = 'jazz music history culture';
  const embedding = await getDenseEmbedding(query);
  
  const results = await qdrantClient.search(COLLECTION_NAME, {
    vector: { name: 'dense', vector: embedding },
    limit: 5,
    with_payload: true
  });
  
  console.log(`\nQuery: "${query}"\n`);
  results.forEach((r, i) => {
    const type = r.payload.is_unstructured ? 'Unstructured Essay' : 'Structured Doc';
    console.log(`${i + 1}. [${type}] ${r.payload.filename}`);
    console.log(`   Score: ${r.score.toFixed(4)}`);
    console.log(`   ${r.payload.content.substring(0, 100)}...`);
  });
}

// Example 5: Get statistics on document types
async function example5() {
  console.log('\n' + '='.repeat(70));
  console.log('EXAMPLE 5: Dataset Statistics');
  console.log('='.repeat(70));
  
  // Count structured docs
  const structuredResult = await qdrantClient.scroll(COLLECTION_NAME, {
    filter: {
      must: [{ key: 'has_structured_metadata', match: { value: true } }]
    },
    limit: 100
  });
  
  // Count unstructured docs
  const unstructuredResult = await qdrantClient.scroll(COLLECTION_NAME, {
    filter: {
      must: [{ key: 'is_unstructured', match: { value: true } }]
    },
    limit: 100
  });
  
  const structured = structuredResult.points || [];
  const unstructured = unstructuredResult.points || [];
  
  console.log(`\n📊 Dataset Composition:`);
  console.log(`   Structured documents (with metadata): ${structured.length}`);
  console.log(`   Unstructured documents (plain text): ${unstructured.length}`);
  console.log(`   Total documents: ${structured.length + unstructured.length}`);
  
  console.log(`\n📚 Unstructured Document Topics:`);
  unstructured.forEach(doc => {
    console.log(`   - ${doc.payload.topic} (${doc.payload.word_count} words)`);
  });
  
  console.log(`\n🏷️  Structured Document Categories:`);
  const categories = {};
  structured.forEach(doc => {
    categories[doc.payload.category] = (categories[doc.payload.category] || 0) + 1;
  });
  Object.entries(categories).forEach(([cat, count]) => {
    console.log(`   - ${cat}: ${count} documents`);
  });
}

// Example 6: Hybrid search shows both work equally well
async function example6() {
  console.log('\n' + '='.repeat(70));
  console.log('EXAMPLE 6: Hybrid search works on all document types');
  console.log('='.repeat(70));
  
  const query = 'climate change renewable energy solutions';
  const embedding = await getDenseEmbedding(query);
  
  const results = await qdrantClient.search(COLLECTION_NAME, {
    vector: { name: 'dense', vector: embedding },
    limit: 5,
    with_payload: true
  });
  
  console.log(`\nQuery: "${query}"\n`);
  results.forEach((r, i) => {
    const docType = r.payload.is_unstructured ? '📄 Essay' : '🏢 Structured';
    console.log(`${i + 1}. ${docType} ${r.payload.filename}`);
    console.log(`   Score: ${r.score.toFixed(4)}`);
    console.log(`   Type: ${r.payload.is_unstructured ? 'No metadata, pure semantic search' : 'Rich metadata available for filtering'}`);
  });
}

async function runAllExamples() {
  console.log('\n🎯 MIXED DATASET EXAMPLES - Structured + Unstructured\n');
  
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
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ All examples completed!');
  console.log('\n💡 Key Insights:');
  console.log('   • Semantic search works equally well on both types');
  console.log('   • Structured docs enable advanced filtering');
  console.log('   • Unstructured docs are simpler but still searchable');
  console.log('   • You can filter by document type');
  console.log('   • Mixed datasets are handled seamlessly');
  console.log('='.repeat(70) + '\n');
}

runAllExamples().catch(console.error);
