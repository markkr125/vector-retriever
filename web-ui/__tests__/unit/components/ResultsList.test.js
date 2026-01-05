import ResultsList from '@/components/ResultsList.vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ScatterPlot to avoid Plotly
vi.mock('@/components/ScatterPlot.vue', () => ({
  default: {
    name: 'ScatterPlot',
    template: '<div class="scatter-mock"></div>',
    props: ['clusters', 'colorBy', 'loading']
  }
}));

describe('ResultsList.vue', () => {
  let wrapper;
  let localStorageMock;

  const mockResults = [
    {
      id: 1,
      score: 0.95,
      payload: {
        category: 'hotel',
        location: 'Paris',
        content: 'Luxury hotel',
        price: 450,
        rating: 4.8,
        filename: 'hotel.txt'
      }
    },
    {
      id: 2,
      score: 0.87,
      payload: {
        category: 'restaurant',
        location: 'London',
        content: 'Italian restaurant',
        price: 50,
        rating: 4.5,
        filename: 'restaurant.txt'
      }
    }
  ];

  beforeEach(() => {
    localStorageMock = {
      data: {},
      getItem: vi.fn((key) => localStorageMock.data[key] || null),
      setItem: vi.fn((key, val) => { localStorageMock.data[key] = val; }),
      removeItem: vi.fn((key) => { delete localStorageMock.data[key]; }),
      clear: vi.fn(() => { localStorageMock.data = {}; })
    };
    global.localStorage = localStorageMock;
  });

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
    }
    vi.clearAllMocks();
  });

  it('renders results header', () => {
    wrapper = mount(ResultsList, {
      props: {
        results: mockResults,
        totalResults: 2,
        currentPage: 1,
        limit: 20,
        searchType: 'search',
        query: 'hotel'
      }
    });
    
    expect(wrapper.find('.results-header').exists()).toBe(true);
  });

  it('displays result cards', () => {
    wrapper = mount(ResultsList, {
      props: {
        results: mockResults,
        totalResults: 2,
        currentPage: 1,
        limit: 20,
        searchType: 'search',
        query: 'test'
      }
    });
    
    const cards = wrapper.findAll('.result-card');
    expect(cards.length).toBe(2);
  });

  it('shows result metadata', () => {
    wrapper = mount(ResultsList, {
      props: {
        results: mockResults,
        totalResults: 2,
        currentPage: 1,
        limit: 20,
        searchType: 'search',
        query: 'test'
      }
    });
    
    const text = wrapper.text();
    expect(text).toContain('hotel');
    expect(text).toContain('Paris');
  });

  it('shows empty state when no query', () => {
    wrapper = mount(ResultsList, {
      props: {
        results: [],
        totalResults: 0,
        currentPage: 1,
        limit: 20,
        searchType: 'search',
        query: ''
      }
    });
    
    expect(wrapper.find('.empty-state').exists()).toBe(true);
  });

  it('displays bookmarks title in bookmarks mode', () => {
    wrapper = mount(ResultsList, {
      props: {
        results: [],
        totalResults: 0,
        currentPage: 1,
        limit: 20,
        searchType: 'bookmarks',
        query: ''
      }
    });
    
    expect(wrapper.text()).toContain('My Bookmarks');
  });

  it('displays browse title in browse mode', () => {
    wrapper = mount(ResultsList, {
      props: {
        results: mockResults,
        totalResults: 2,
        currentPage: 1,
        limit: 20,
        searchType: 'browse',
        query: ''
      }
    });
    
    expect(wrapper.text()).toContain('Browse All Documents');
  });

  it('shows loading state', () => {
    wrapper = mount(ResultsList, {
      props: {
        results: [],
        totalResults: 0,
        currentPage: 1,
        limit: 20,
        searchType: 'search',
        query: 'test',
        loading: true
      }
    });
    
    expect(wrapper.find('.loading-state').exists()).toBe(true);
  });

  it('displays bookmark buttons', () => {
    wrapper = mount(ResultsList, {
      props: {
        results: mockResults,
        totalResults: 2,
        currentPage: 1,
        limit: 20,
        searchType: 'search',
        query: 'test'
      }
    });
    
    const bookmarkBtns = wrapper.findAll('.btn-bookmark');
    expect(bookmarkBtns.length).toBe(2);
  });

  it('saves bookmark to localStorage', async () => {
    wrapper = mount(ResultsList, {
      props: {
        results: mockResults,
        totalResults: 2,
        currentPage: 1,
        limit: 20,
        searchType: 'search',
        query: 'test'
      }
    });
    
    const bookmarkBtn = wrapper.findAll('.btn-bookmark')[0];
    await bookmarkBtn.trigger('click');
    
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });

  it('shows pagination when results exceed limit', () => {
    wrapper = mount(ResultsList, {
      props: {
        results: mockResults,
        totalResults: 100,
        currentPage: 1,
        limit: 20,
        searchType: 'search',
        query: 'test'
      }
    });
    
    expect(wrapper.find('.pagination').exists()).toBe(true);
  });

  it('renders detected language badge when present', async () => {
    const resultsWithLanguage = [
      {
        id: 1,
        score: 0.95,
        payload: {
          filename: 'doc.txt',
          content: 'Hello',
          detected_language: 'English'
        }
      }
    ];

    wrapper = mount(ResultsList, {
      props: {
        results: resultsWithLanguage,
        totalResults: 1,
        currentPage: 1,
        limit: 10,
        searchType: 'search',
        query: 'hello'
      }
    });

    // Expand and open overview tab
    const card = wrapper.find('.result-card');
    const showMoreBtn = card.findAll('.result-actions button').find(b => b.text().includes('Show More'));
    expect(showMoreBtn).toBeTruthy();
    await showMoreBtn.trigger('click');

    const overviewTab = card.findAll('button.tab-btn').find(b => b.text().includes('Overview'));
    expect(overviewTab).toBeTruthy();
    await overviewTab.trigger('click');

    await wrapper.vm.$nextTick();

    expect(wrapper.find('.language-badge').exists()).toBe(true);
    expect(wrapper.text()).toContain('English');
  });

  it('disables overview refresh for images without source image_data', async () => {
    const imageResultNoSource = [
      {
        id: 1,
        score: 0.95,
        payload: {
          filename: 'image.png',
          content: 'Extracted content',
          description: 'Existing description',
          document_type: 'image',
          vision_processed: true
          // no image_data
        }
      }
    ];

    wrapper = mount(ResultsList, {
      props: {
        results: imageResultNoSource,
        totalResults: 1,
        currentPage: 1,
        limit: 10,
        searchType: 'search',
        query: 'image'
      }
    });

    // Expand and open overview tab
    const card = wrapper.find('.result-card');
    const showMoreBtn = card.findAll('.result-actions button').find(b => b.text().includes('Show More'));
    expect(showMoreBtn).toBeTruthy();
    await showMoreBtn.trigger('click');

    const overviewTab = card.findAll('button.tab-btn').find(b => b.text().includes('Overview'));
    expect(overviewTab).toBeTruthy();
    await overviewTab.trigger('click');

    await wrapper.vm.$nextTick();

    const refreshBtn = wrapper.find('.btn.btn-refresh');
    expect(refreshBtn.exists()).toBe(true);
    expect(refreshBtn.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Refresh is unavailable');
  });

  it('emits page-change event', async () => {
    wrapper = mount(ResultsList, {
      props: {
        results: mockResults,
        totalResults: 100,
        currentPage: 1,
        limit: 20,
        searchType: 'search',
        query: 'test'
      }
    });
    
    const pageBtn = wrapper.findAll('.page-btn')[1];
    if (pageBtn) {
      await pageBtn.trigger('click');
      expect(wrapper.emitted('page-change')).toBeTruthy();
    }
  });

  it('shows find similar button', () => {
    wrapper = mount(ResultsList, {
      props: {
        results: mockResults,
        totalResults: 2,
        currentPage: 1,
        limit: 20,
        searchType: 'search',
        query: 'test'
      }
    });
    
    const findBtns = wrapper.findAll('.btn-secondary');
    // Should have at least 2 find similar buttons (one per result)
    expect(findBtns.length).toBeGreaterThanOrEqual(2);
  });

  it('emits find-similar event', async () => {
    wrapper = mount(ResultsList, {
      props: {
        results: mockResults,
        totalResults: 2,
        currentPage: 1,
        limit: 20,
        searchType: 'search',
        query: 'test'
      }
    });
    
    // Find the btn-secondary that has the find similar text
    const findBtn = wrapper.findAll('.btn-secondary').find(btn => btn.text().includes('Find Similar'));
    if (findBtn) {
      await findBtn.trigger('click');
      expect(wrapper.emitted('find-similar')).toBeTruthy();
    }
  });

  it('shows visualize button when results exist', () => {
    wrapper = mount(ResultsList, {
      props: {
        results: mockResults,
        totalResults: 2,
        currentPage: 1,
        limit: 20,
        searchType: 'search',
        query: 'test'
      }
    });
    
    expect(wrapper.find('.btn-visualize-results').exists()).toBe(true);
  });

  it('shows browse controls in browse mode', () => {
    wrapper = mount(ResultsList, {
      props: {
        results: mockResults,
        totalResults: 2,
        currentPage: 1,
        limit: 20,
        searchType: 'browse',
        query: ''
      }
    });
    
    expect(wrapper.find('.browse-controls-inline').exists()).toBe(true);
  });

  it('emits sort-change in browse mode', async () => {
    wrapper = mount(ResultsList, {
      props: {
        results: mockResults,
        totalResults: 2,
        currentPage: 1,
        limit: 20,
        searchType: 'browse',
        query: ''
      }
    });
    
    const sortSelect = wrapper.find('.control-select');
    await sortSelect.setValue('filename');
    
    expect(wrapper.emitted('sort-change')).toBeTruthy();
  });

  it('emits filename-filter-change (browse) after 300ms debounce', async () => {
    vi.useFakeTimers();

    wrapper = mount(ResultsList, {
      props: {
        results: mockResults,
        totalResults: 2,
        currentPage: 1,
        limit: 20,
        searchType: 'browse',
        query: ''
      }
    });

    const input = wrapper.find('input.filename-filter-input');
    expect(input.exists()).toBe(true);

    await input.setValue('hotel');

    await vi.advanceTimersByTimeAsync(299);
    expect(wrapper.emitted('filename-filter-change')).toBeFalsy();

    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.emitted('filename-filter-change')).toBeTruthy();
    expect(wrapper.emitted('filename-filter-change')[0][0]).toEqual({ mode: 'browse', filter: 'hotel' });

    vi.useRealTimers();
  });

  it('emits filename-filter-change (bookmarks) after 300ms debounce', async () => {
    vi.useFakeTimers();

    wrapper = mount(ResultsList, {
      props: {
        results: mockResults,
        totalResults: 2,
        currentPage: 1,
        limit: 20,
        searchType: 'bookmarks',
        query: ''
      }
    });

    const input = wrapper.find('input.filename-filter-input');
    expect(input.exists()).toBe(true);

    await input.setValue('rest');

    await vi.advanceTimersByTimeAsync(300);

    expect(wrapper.emitted('filename-filter-change')).toBeTruthy();
    expect(wrapper.emitted('filename-filter-change')[0][0]).toEqual({ mode: 'bookmarks', filter: 'rest' });

    vi.useRealTimers();
  });

  it('clears filename filter and emits empty filter immediately', async () => {
    wrapper = mount(ResultsList, {
      props: {
        results: mockResults,
        totalResults: 2,
        currentPage: 1,
        limit: 20,
        searchType: 'browse',
        query: ''
      }
    });

    const input = wrapper.find('input.filename-filter-input');
    await input.setValue('hotel');

    const clearBtn = wrapper.find('button.clear-filter-btn');
    expect(clearBtn.exists()).toBe(true);

    await clearBtn.trigger('click');

    expect(wrapper.emitted('filename-filter-change')).toBeTruthy();
    const last = wrapper.emitted('filename-filter-change').at(-1)[0];
    expect(last).toEqual({ mode: 'browse', filter: '' });
  });
});
