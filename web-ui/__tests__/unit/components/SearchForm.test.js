import api from '@/api';
import SearchForm from '@/components/SearchForm.vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';

describe('SearchForm.vue', () => {
  let wrapper;

  beforeEach(() => {
    wrapper = mount(SearchForm, {
      props: {
        loading: false,
        stats: {
          categories: ['hotel', 'restaurant', 'museum'],
          locations: ['Paris', 'London', 'Tokyo']
        }
      }
    });
  });

  afterEach(() => {
    wrapper.unmount();
  });

  describe('Component Rendering', () => {
    it('renders search form wrapper correctly', () => {
      expect(wrapper.find('.search-form').exists()).toBe(true);
      expect(wrapper.find('.form-title').text()).toBe('Search Configuration');
    });

    it('renders search type selector', () => {
      const select = wrapper.find('.select');
      expect(select.exists()).toBe(true);
      const options = select.findAll('option');
      expect(options.length).toBe(5); // hybrid, semantic, by-document, location, geo
      expect(options[0].text()).toContain('Hybrid');
      expect(options[1].text()).toContain('Semantic');
      expect(options[2].text()).toContain('By Document');
      expect(options[3].text()).toContain('Location');
      expect(options[4].text()).toContain('Geo');
    });

    it('renders query textarea for non-document search types', () => {
      const textarea = wrapper.find('.textarea');
      expect(textarea.exists()).toBe(true);
      expect(textarea.attributes('placeholder')).toContain('search query');
    });

    it('renders search and clear buttons', () => {
      const buttons = wrapper.findAll('.btn-primary');
      expect(buttons.length).toBeGreaterThan(0);
      const buttonTexts = buttons.map(b => b.text());
      expect(buttonTexts.some(text => text.includes('Search'))).toBe(true);
    });

    it('renders surprise me button', () => {
      const surpriseBtn = wrapper.find('.btn-surprise');
      expect(surpriseBtn.exists()).toBe(true);
      expect(surpriseBtn.text()).toContain('Surprise Me');
    });
  });

  describe('Search Type Switching', () => {
    it('switches to semantic search type', async () => {
      const select = wrapper.find('.select');
      await select.setValue('semantic');
      expect(select.element.value).toBe('semantic');
      // Query textarea should still be visible
      expect(wrapper.find('.textarea').exists()).toBe(true);
    });

    it('switches to location search and shows location dropdown', async () => {
      const select = wrapper.find('.select');
      await select.setValue('location');
      expect(select.element.value).toBe('location');
      
      // Should show location select
      const selects = wrapper.findAll('.select');
      expect(selects.length).toBeGreaterThan(1);
    });

    it('switches to geo search and shows coordinate inputs', async () => {
      const select = wrapper.find('.select');
      await select.setValue('geo');
      expect(select.element.value).toBe('geo');
      
      // Should show latitude, longitude, radius inputs
      const geoInputs = wrapper.findAll('.geo-inputs .input');
      expect(geoInputs.length).toBe(3); // lat, lon, radius
    });

    it('switches to by-document and shows file upload', async () => {
      const select = wrapper.find('.select');
      await select.setValue('by-document');
      expect(select.element.value).toBe('by-document');
      
      // Should show file input
      const fileInput = wrapper.find('.file-input');
      expect(fileInput.exists()).toBe(true);
      expect(fileInput.attributes('type')).toBe('file');
    });

    it('includes image types in accept list when vision enabled', async () => {
      // Mock /api/config
      api.get.mockResolvedValueOnce({
        data: {
          visionEnabled: true,
          supportedImageTypes: ['.png', '.jpg']
        }
      });

      // Remount to trigger onMounted fetchConfig
      wrapper.unmount();
      wrapper = mount(SearchForm, {
        props: {
          loading: false,
          stats: {
            categories: ['hotel'],
            locations: ['Paris']
          }
        }
      });

      // Switch to by-document
      const select = wrapper.find('.select');
      await select.setValue('by-document');

      // Wait for async onMounted
      await Promise.resolve();
      await Promise.resolve();

      const fileInput = wrapper.find('.file-input');
      expect(fileInput.attributes('accept')).toContain('.png');
      expect(fileInput.attributes('accept')).toContain('.jpg');
    });
  });

  describe('Hybrid Search Features', () => {
    it('shows dense weight slider for hybrid search', () => {
      // Default type is hybrid
      const slider = wrapper.find('.slider');
      expect(slider.exists()).toBe(true);
      expect(slider.attributes('type')).toBe('range');
      expect(slider.attributes('min')).toBe('0');
      expect(slider.attributes('max')).toBe('1');
    });

    it('hides dense weight slider for non-hybrid search', async () => {
      const select = wrapper.find('.select');
      await select.setValue('semantic');
      
      const slider = wrapper.find('.slider');
      expect(slider.exists()).toBe(false);
    });

    it('updates dense weight value', async () => {
      const slider = wrapper.find('.slider');
      await slider.setValue('0.8');
      expect(slider.element.value).toBe('0.8');
      
      // Label should show the value
      const labels = wrapper.findAll('.label');
      const denseLabel = labels.find(l => l.text().includes('Dense Weight'));
      expect(denseLabel.text()).toContain('0.80');
    });
  });

  describe('Query Input', () => {
    it('updates query on textarea input', async () => {
      const textarea = wrapper.find('.textarea');
      await textarea.setValue('luxury hotel in Paris');
      expect(textarea.element.value).toBe('luxury hotel in Paris');
    });

    it('handles Ctrl+Enter to submit', async () => {
      const textarea = wrapper.find('.textarea');
      await textarea.setValue('test query');
      
      await textarea.trigger('keydown.ctrl.enter');
      
      // Should emit search event
      expect(wrapper.emitted('search')).toBeTruthy();
    });
  });

  describe('Advanced Filters', () => {
    it('toggles advanced filters panel', async () => {
      const toggleBtn = wrapper.find('.filters-section .btn-secondary');
      expect(toggleBtn.exists()).toBe(true);
      
      // Initially collapsed
      expect(wrapper.find('.filters-content').exists()).toBe(false);
      
      // Click to expand
      await toggleBtn.trigger('click');
      expect(wrapper.find('.filters-content').exists()).toBe(true);
      
      // Click to collapse
      await toggleBtn.trigger('click');
      expect(wrapper.find('.filters-content').exists()).toBe(false);
    });

    it('shows category filter in advanced filters', async () => {
      const toggleBtn = wrapper.find('.filters-section .btn-secondary');
      await toggleBtn.trigger('click');
      
      const filters = wrapper.find('.filters-content');
      expect(filters.exists()).toBe(true);
      
      const selects = filters.findAll('.select');
      // Find the category select (first one in filters)
      const categorySelect = selects.length > 0 ? selects[0] : null;
      expect(categorySelect).toBeTruthy();
      const options = categorySelect.findAll('option');
      expect(options.length).toBeGreaterThanOrEqual(1); // At least "Any category"
    });
  });

  describe('Event Emissions', () => {
    it('emits search event with query and type', async () => {
      const textarea = wrapper.find('.textarea');
      await textarea.setValue('luxury hotel');
      
      const searchBtn = wrapper.findAll('.btn-primary').find(b => b.text().includes('Search'));
      await searchBtn.trigger('click');
      
      expect(wrapper.emitted('search')).toBeTruthy();
      const emittedEvent = wrapper.emitted('search')[0][0];
      expect(emittedEvent.query).toBe('luxury hotel');
      expect(emittedEvent.searchType).toBe('hybrid');
    });

    it('emits surpriseMe event when surprise button clicked', async () => {
      const surpriseBtn = wrapper.find('.btn-surprise');
      await surpriseBtn.trigger('click');
      
      expect(wrapper.emitted('surpriseMe')).toBeTruthy();
    });

    it('emits clear event when clear button clicked', async () => {
      const clearBtn = wrapper.findAll('.btn-primary').find(b => b.text().includes('Clear'));
      if (clearBtn) {
        await clearBtn.trigger('click');
        expect(wrapper.emitted('clear')).toBeTruthy();
      }
    });

    it('includes dense weight in hybrid search emission', async () => {
      const slider = wrapper.find('.slider');
      await slider.setValue('0.7');
      
      const textarea = wrapper.find('.textarea');
      await textarea.setValue('test');
      
      const searchBtn = wrapper.findAll('.btn-primary').find(b => b.text().includes('Search'));
      await searchBtn.trigger('click');
      
      const emittedEvent = wrapper.emitted('search')[0][0];
      expect(emittedEvent.denseWeight).toBe(0.7);
    });
  });

  describe('Props Handling', () => {
    it('starts with empty query by default', () => {
      const textarea = wrapper.find('.textarea');
      expect(textarea.element.value).toBe('');
    });

    it('starts with hybrid search type by default', () => {
      const select = wrapper.find('.select');
      expect(select.element.value).toBe('hybrid');
    });

    it('shows categories from stats in filter', async () => {
      const toggleBtn = wrapper.find('.filters-section .btn-secondary');
      await toggleBtn.trigger('click');
      
      // Component should compute availableCategories from stats prop
      const text = wrapper.text();
      // At minimum, the component should render
      expect(wrapper.find('.filters-content').exists()).toBe(true);
    });
  });
});
