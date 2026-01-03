const { CollectionMetadataService } = require('../../../services/collections-metadata-service');

describe('CollectionMetadataService (unit)', () => {
  describe('renameCollection', () => {
    test('throws when collection not found', async () => {
      const client = {
        setPayload: jest.fn()
      };

      const service = new CollectionMetadataService(client);

      await expect(
        service.renameCollection('missing', { displayName: 'New', description: '' })
      ).rejects.toThrow('Collection not found');

      expect(client.setPayload).not.toHaveBeenCalled();
    });

    test('throws when renaming default collection', async () => {
      const client = {
        setPayload: jest.fn()
      };

      const service = new CollectionMetadataService(client);
      service.cache.set('default-id', {
        collectionId: 'default-id',
        displayName: 'default',
        description: 'Default collection',
        qdrantName: 'default',
        isDefault: true
      });

      await expect(
        service.renameCollection('default-id', { displayName: 'Nope', description: '' })
      ).rejects.toThrow('Cannot rename default collection');

      expect(client.setPayload).not.toHaveBeenCalled();
    });

    test('updates cache and calls setPayload', async () => {
      const client = {
        setPayload: jest.fn().mockResolvedValue(undefined)
      };

      const service = new CollectionMetadataService(client);
      service.cache.set('c1', {
        collectionId: 'c1',
        displayName: 'Old',
        description: 'Old desc',
        qdrantName: 'col_c1',
        isDefault: false
      });

      const updated = await service.renameCollection('c1', {
        displayName: 'New Name',
        description: 'New desc'
      });

      expect(client.setPayload).toHaveBeenCalledWith('_system_collections', {
        points: ['c1'],
        payload: {
          displayName: 'New Name',
          description: 'New desc'
        }
      });

      expect(updated.displayName).toBe('New Name');
      expect(updated.description).toBe('New desc');

      const fromCache = service.cache.get('c1');
      expect(fromCache.displayName).toBe('New Name');
      expect(fromCache.description).toBe('New desc');
    });

    test('does not overwrite description when description is undefined', async () => {
      const client = {
        setPayload: jest.fn().mockResolvedValue(undefined)
      };

      const service = new CollectionMetadataService(client);
      service.cache.set('c1', {
        collectionId: 'c1',
        displayName: 'Old',
        description: 'Keep me',
        qdrantName: 'col_c1',
        isDefault: false
      });

      const updated = await service.renameCollection('c1', {
        displayName: 'New Name',
        description: undefined
      });

      expect(updated.description).toBe('Keep me');
      expect(client.setPayload).toHaveBeenCalledWith('_system_collections', {
        points: ['c1'],
        payload: {
          displayName: 'New Name',
          description: 'Keep me'
        }
      });
    });
  });
});
