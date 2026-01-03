# Documentation Index

Welcome to the Vector Retriever documentation! This folder contains comprehensive guides and references for using this project.

## Table of Contents
- [📚 Documentation Files](#-documentation-files)
- [🚀 Quick Navigation](#-quick-navigation)
- [📖 Additional Resources](#-additional-resources)
- [🎯 Common Tasks](#-common-tasks)
- [💡 Tips](#-tips)

## 📚 Documentation Files

### [Complete Summary](SUMMARY.md)
**Complete project overview and achievements**
- What this project demonstrates
- Dataset composition (27 documents)
- All features and capabilities
- Quick command reference
- Technical architecture
- Real-world applications
- Performance characteristics

**Best for:** Getting a high-level understanding of the entire project.

---

### [Quick Reference](QUICK_REFERENCE.md)
**Fast command reference and feature guide**
- Working features checklist
- Dataset summary
- Configuration details
- Example queries
- Key takeaways
- Performance notes

**Best for:** Quick lookup of commands and features while working.

---

### [Mixed Dataset Guide](MIXED_DATASET.md)
**Comprehensive guide to handling structured + unstructured documents**
- Overview of mixed datasets
- Dataset composition (21 structured + 6 unstructured)
- Automatic metadata detection
- Search capabilities across both types
- Use cases and benefits
- Implementation details
- Best practices

**Best for:** Understanding how to work with documents that have different formats.

---

### [Location Search Examples](LOCATION_SEARCH_EXAMPLES.md)
**City-based and geo-radius query examples**
- Location filtering by city name
- Geo-radius searches with coordinates
- Combining location with other filters
- Real-world examples
- Common patterns

**Best for:** Learning how to implement location-based search features.

---

### [Advanced Queries](ADVANCED_QUERIES.md)
**Complex filtering patterns and query examples**
- Must/Should/Must_not operators
- Price range filtering
- Rating and tag combinations
- Nested conditions
- Exclusion patterns
- Geo + category combinations
- 7+ working examples

**Best for:** Mastering complex payload filtering and advanced search techniques.

---

### [PII Detection & GDPR Compliance](PII_DETECTION.md)
**Comprehensive PII scanning and compliance features**
- 5 detection methods (Regex, Ollama, Hybrid, Compromise, Advanced)
- Dual-agent validation for accuracy
- 11 PII types detected (email, phone, SSN, credit card, etc.)
- Risk level classification (None, Low, Medium, High, Critical)
- Web UI filters for PII severity and types
- Bulk scanning capabilities
- Multi-language support
- GDPR compliance use cases

**Best for:** Understanding PII detection, implementing GDPR compliance, and filtering sensitive documents.

---

### [Collection Rename Feature](COLLECTION_RENAME.md)
**Inline collection renaming with validation**
- Backend API and service implementation
- Frontend inline editing interface
- Validation rules (format, length, uniqueness)
- Visual feedback and keyboard shortcuts
- Error handling patterns
- Usage flow and technical details

**Best for:** Understanding how to rename collections and the validation constraints.

---

### [Testing Plan](TESTING_PLAN.md)
**Testing strategy and roadmap**
- Test stack choices (Jest/Vitest/Playwright)
- Suggested test structure and phases
- Coverage targets and recommended priorities

**Best for:** Understanding how the test suite is organized and what to add next.

---

### [Test Implementation Summary](TEST_IMPLEMENTATION_COMPLETE.md)
**What’s implemented in the test suite**
- What tests exist (unit/integration/frontend/e2e)
- How to run them
- Notes about integration requirements

**Best for:** Verifying what’s already in place and how to execute it.

---

## 🚀 Quick Navigation

### By Use Case

**I want to...**
- **Get started quickly** → [Quick Reference](QUICK_REFERENCE.md)
- **Understand the full project** → [Complete Summary](SUMMARY.md)
- **Work with plain text documents** → [Mixed Dataset Guide](MIXED_DATASET.md)
- **Search by location** → [Location Search Examples](LOCATION_SEARCH_EXAMPLES.md)
- **Build complex filters** → [Advanced Queries](ADVANCED_QUERIES.md)
- **Detect PII and ensure GDPR compliance** → [PII Detection](PII_DETECTION.md)

### By Experience Level

**Beginner:**
1. Start with [Quick Reference](QUICK_REFERENCE.md) - Get familiar with basic commands
2. Read [Complete Summary](SUMMARY.md) - Understand what the project does
3. Try [Location Search Examples](LOCATION_SEARCH_EXAMPLES.md) - Simple real-world examples

**Intermediate:**
1. Read [Mixed Dataset Guide](MIXED_DATASET.md) - Learn about document flexibility
2. Study [Advanced Queries](ADVANCED_QUERIES.md) - Master complex filtering
3. Explore [PII Detection](PII_DETECTION.md) - Implement compliance features
4. Test combining different techniques

**Advanced:**
- All documents provide implementation details and best practices
- [PII Detection](PII_DETECTION.md) covers advanced multi-agent validation
- Use as reference while building your own features
- Adapt patterns to your specific use cases

---

## 📖 Additional Resources

**Main README:** [../README.md](../README.md)
- Installation instructions
- Prerequisites
- Quick start guide
- Basic usage examples
- Troubleshooting

**Code Files:**
- `../index.js` - Main application with all search functions
- `../examples/examples.js` - 7 advanced filtering examples
- `../examples/mixed_examples.js` - Structured vs unstructured demos

---

## 🎯 Common Tasks

| Task | Documentation | Command |
|------|--------------|---------|
| Run basic search | [Quick Reference](QUICK_REFERENCE.md) | `npm run search "query"` |
| Hybrid search | [Quick Reference](QUICK_REFERENCE.md) | `npm run hybrid "query"` |
| Location filtering | [Location Search Examples](LOCATION_SEARCH_EXAMPLES.md) | `node index.js location "City" "query"` |
| Geo-radius search | [Location Search Examples](LOCATION_SEARCH_EXAMPLES.md) | `node index.js geo lat lon radius "query"` |
| Complex filters | [Advanced Queries](ADVANCED_QUERIES.md) | `npm run examples` |
| Mixed datasets | [Mixed Dataset Guide](MIXED_DATASET.md) | `npm run mixed` |
| Full demo | [Complete Summary](SUMMARY.md) | `npm run demo` |

---

## 💡 Tips

- **Start simple:** Begin with semantic search, then add filters
- **Test incrementally:** Try each feature one at a time
- **Check examples:** All guides include runnable code examples
- **Mix and match:** Combine techniques for powerful queries
- **Refer back:** Use this index to find the right documentation quickly

---

**Happy searching! 🔍**

[← Back to Main README](../README.md)
