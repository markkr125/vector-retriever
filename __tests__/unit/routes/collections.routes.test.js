const express = require('express');
const request = require('supertest');

const { createCollectionsRoutes } = require('../../../routes/collections');

function createApp({ collectionsService }) {
  const app = express();
  app.use(express.json());

  const qdrantClient = {
    getCollection: jest.fn(),
    scroll: jest.fn()
  };

  app.use(
    '/api',
    createCollectionsRoutes({
      collectionsService,
      qdrantClient
    })
  );

  return app;
}

describe('Collections Routes (unit)', () => {
  describe('PATCH /api/collections/:collectionId (rename)', () => {
    test('returns 404 when collection not found', async () => {
      const collectionsService = {
        getCollection: jest.fn(() => null),
        getAllCollections: jest.fn(() => []),
        renameCollection: jest.fn()
      };

      const app = createApp({ collectionsService });

      await request(app)
        .patch('/api/collections/does_not_exist')
        .send({ displayName: 'New Name', description: '' })
        .expect(404);

      expect(collectionsService.renameCollection).not.toHaveBeenCalled();
    });

    test('returns 403 when attempting to rename default collection', async () => {
      const collectionsService = {
        getCollection: jest.fn(() => ({ collectionId: 'default', isDefault: true })),
        getAllCollections: jest.fn(() => [{ collectionId: 'default', displayName: 'default' }]),
        renameCollection: jest.fn()
      };

      const app = createApp({ collectionsService });

      const res = await request(app)
        .patch('/api/collections/default')
        .send({ displayName: 'Nope', description: '' })
        .expect(403);

      expect(res.body.error).toMatch(/default/i);
      expect(collectionsService.renameCollection).not.toHaveBeenCalled();
    });

    test('returns 400 for missing displayName', async () => {
      const collectionsService = {
        getCollection: jest.fn(() => ({ collectionId: 'c1', isDefault: false })),
        getAllCollections: jest.fn(() => []),
        renameCollection: jest.fn()
      };

      const app = createApp({ collectionsService });

      await request(app)
        .patch('/api/collections/c1')
        .send({ displayName: '   ' })
        .expect(400);

      expect(collectionsService.renameCollection).not.toHaveBeenCalled();
    });

    test('returns 400 for invalid characters', async () => {
      const collectionsService = {
        getCollection: jest.fn(() => ({ collectionId: 'c1', isDefault: false })),
        getAllCollections: jest.fn(() => []),
        renameCollection: jest.fn()
      };

      const app = createApp({ collectionsService });

      const res = await request(app)
        .patch('/api/collections/c1')
        .send({ displayName: 'Bad/Name', description: '' })
        .expect(400);

      expect(res.body.error).toMatch(/only contain/i);
      expect(collectionsService.renameCollection).not.toHaveBeenCalled();
    });

    test('returns 400 for too-long name (>50)', async () => {
      const collectionsService = {
        getCollection: jest.fn(() => ({ collectionId: 'c1', isDefault: false })),
        getAllCollections: jest.fn(() => []),
        renameCollection: jest.fn()
      };

      const app = createApp({ collectionsService });

      const longName = 'a'.repeat(51);
      await request(app)
        .patch('/api/collections/c1')
        .send({ displayName: longName, description: '' })
        .expect(400);

      expect(collectionsService.renameCollection).not.toHaveBeenCalled();
    });

    test('returns 400 for duplicate name (case-insensitive), excluding current collection', async () => {
      const collectionsService = {
        getCollection: jest.fn(() => ({ collectionId: 'c1', isDefault: false })),
        getAllCollections: jest.fn(() => [
          { collectionId: 'c1', displayName: 'Current' },
          { collectionId: 'c2', displayName: 'My Collection' }
        ]),
        renameCollection: jest.fn()
      };

      const app = createApp({ collectionsService });

      const res = await request(app)
        .patch('/api/collections/c1')
        .send({ displayName: 'my collection', description: '' })
        .expect(400);

      expect(res.body.error).toMatch(/already exists/i);
      expect(collectionsService.renameCollection).not.toHaveBeenCalled();
    });

    test('returns 200 and calls collectionsService.renameCollection on success', async () => {
      const updated = {
        collectionId: 'c1',
        displayName: 'Renamed',
        description: 'Desc',
        isDefault: false
      };

      const collectionsService = {
        getCollection: jest.fn(() => ({ collectionId: 'c1', isDefault: false })),
        getAllCollections: jest.fn(() => [
          { collectionId: 'c1', displayName: 'Old Name' },
          { collectionId: 'c2', displayName: 'Other' }
        ]),
        renameCollection: jest.fn(async () => updated)
      };

      const app = createApp({ collectionsService });

      const res = await request(app)
        .patch('/api/collections/c1')
        .send({ displayName: 'Renamed', description: 'Desc' })
        .expect(200);

      expect(collectionsService.renameCollection).toHaveBeenCalledWith('c1', {
        displayName: 'Renamed',
        description: 'Desc'
      });
      expect(res.body).toEqual(updated);
    });
  });
});
