import FileSelector from '@/components/FileSelector.vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

describe('FileSelector.vue', () => {
  it('selects only the clicked file when files have no `key` (e.g., Google Drive uses `id`)', async () => {
    const files = [
      { id: 'g1', name: 'a.jpg', extension: '.jpg', size: 123, lastModified: '2026-01-16T00:00:00Z' },
      { id: 'g2', name: 'b.jpg', extension: '.jpg', size: 456, lastModified: '2026-01-16T00:00:00Z' },
      { id: 'g3', name: 'c.jpg', extension: '.jpg', size: 789, lastModified: '2026-01-16T00:00:00Z' }
    ];

    const wrapper = mount(FileSelector, {
      props: {
        show: true,
        provider: 'gdrive',
        files
      }
    });

    // Click the first file row
    const rows = wrapper.findAll('.files-list .file-item');
    expect(rows.length).toBeGreaterThanOrEqual(3);

    await rows[0].trigger('click');

    // Should show exactly 1 selected
    expect(wrapper.text()).toContain('Selected:');
    expect(wrapper.text()).toContain('1 files');

    // And the button should reflect importing 1 file
    expect(wrapper.text()).toContain('Import 1 File');
  });
});
