import * as api from '@/api';
import CollectionManagementModal from '@/components/CollectionManagementModal.vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api', () => ({
  fetchCollections: vi.fn(),
  createCollection: vi.fn(),
  deleteCollection: vi.fn(),
  emptyCollection: vi.fn(),
  renameCollection: vi.fn()
}));

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

describe('CollectionManagementModal.vue', () => {
  let wrapper;

  const collections = [
    {
      collectionId: 'default',
      displayName: 'default',
      description: 'Default collection',
      isDefault: true,
      createdAt: new Date().toISOString(),
      documentCount: 5
    },
    {
      collectionId: 'c1',
      displayName: 'Work',
      description: 'My work docs',
      isDefault: false,
      createdAt: new Date().toISOString(),
      documentCount: 2
    }
  ];

  beforeEach(() => {
    api.fetchCollections.mockResolvedValue(collections);
    api.renameCollection.mockResolvedValue({ ...collections[1], displayName: 'Renamed' });
  });

  afterEach(() => {
    if (wrapper) wrapper.unmount();
    vi.clearAllMocks();
  });

  it('does not close when clicking outside (overlay click)', async () => {
    wrapper = mount(CollectionManagementModal, {
      props: {
        isOpen: true,
        currentCollectionId: 'default'
      }
    });

    await flushPromises();
    await wrapper.vm.$nextTick();

    await wrapper.find('.modal-overlay').trigger('click');
    expect(wrapper.emitted('close')).toBeFalsy();
  });

  it('enters rename edit mode and saves rename (emits collection-renamed)', async () => {
    wrapper = mount(CollectionManagementModal, {
      props: {
        isOpen: true,
        currentCollectionId: 'default'
      }
    });

    await flushPromises();
    await wrapper.vm.$nextTick();

    const renameBtn = wrapper.findAll('button.btn-rename').find(b => b.text().includes('Rename'));
    expect(renameBtn).toBeTruthy();

    await renameBtn.trigger('click');

    const inputs = wrapper.findAll('input.edit-input');
    expect(inputs.length).toBe(2);

    await inputs[0].setValue('  Renamed  ');
    await inputs[1].setValue('  New desc  ');

    const saveBtn = wrapper.find('button.btn-save');
    await saveBtn.trigger('click');

    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(api.renameCollection).toHaveBeenCalledWith('c1', {
      displayName: 'Renamed',
      description: 'New desc'
    });

    // Should refresh list after rename
    expect(api.fetchCollections).toHaveBeenCalled();

    expect(wrapper.emitted('collection-renamed')).toBeTruthy();
    expect(wrapper.emitted('collection-renamed')[0][0]).toBe('c1');
  });

  it('shows API error when rename fails', async () => {
    api.renameCollection.mockRejectedValue({
      response: { data: { error: 'A collection with this name already exists' } }
    });

    wrapper = mount(CollectionManagementModal, {
      props: {
        isOpen: true,
        currentCollectionId: 'default'
      }
    });

    await flushPromises();
    await wrapper.vm.$nextTick();

    const renameBtn = wrapper.findAll('button.btn-rename').find(b => b.text().includes('Rename'));
    await renameBtn.trigger('click');

    const inputs = wrapper.findAll('input.edit-input');
    await inputs[0].setValue('Duplicate');

    await wrapper.find('button.btn-save').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('A collection with this name already exists');
    expect(wrapper.emitted('collection-renamed')).toBeFalsy();
  });
});
