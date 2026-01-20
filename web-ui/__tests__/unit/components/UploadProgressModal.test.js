import * as api from '@/api';
import UploadProgressModal from '@/components/UploadProgressModal.vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the API
vi.mock('@/api', () => ({
  getUploadJobStatus: vi.fn(),
  getUploadJobFiles: vi.fn(),
  resumeUploadJob: vi.fn()
}));

describe('UploadProgressModal.vue', () => {
  let wrapper;

  const mockJobData = {
    id: 'job_123',
    status: 'processing',
    totalFiles: 5,
    processedFiles: 2,
    successfulFiles: 2,
    failedFiles: 0,
    currentFile: 'file3.txt',
    currentStage: 'Embedding…',
    source: 'cloud',
    filesTotal: 5,
    filesOffset: 0,
    filesLimit: 0,
    files: []
  };

  beforeEach(() => {
    vi.useFakeTimers();
    api.getUploadJobStatus.mockResolvedValue(mockJobData);
    api.resumeUploadJob.mockResolvedValue({ success: true });
    api.getUploadJobFiles.mockResolvedValue({
      id: 'job_123',
      filesTotal: 5,
      offset: 0,
      limit: 5,
      files: [
        { name: 'file1.txt', status: 'success' },
        { name: 'file2.txt', status: 'updated' },
        { name: 'file3.txt', status: 'processing' },
        { name: 'file4.txt', status: 'pending' },
        { name: 'file5.txt', status: 'pending' }
      ]
    });
  });

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
    }
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('renders modal when show is true', async () => {
    wrapper = mount(UploadProgressModal, {
      props: { show: true, jobId: 'job_123' }
    });
    
    await vi.advanceTimersByTimeAsync(50);
    await wrapper.vm.$nextTick();
    
    expect(wrapper.find('.modal-overlay').exists()).toBe(true);
  });

  it('does not render when show is false', () => {
    wrapper = mount(UploadProgressModal, {
      props: { show: false, jobId: 'job_123' }
    });
    
    expect(wrapper.find('.modal-overlay').exists()).toBe(false);
  });

  it('displays modal title', async () => {
    wrapper = mount(UploadProgressModal, {
      props: { show: true, jobId: 'job_123' }
    });
    
    await vi.advanceTimersByTimeAsync(50);
    await wrapper.vm.$nextTick();
    
    expect(wrapper.text()).toContain('Upload Progress');
  });

  it('shows file count after loading data', async () => {
    wrapper = mount(UploadProgressModal, {
      props: { show: true, jobId: 'job_123' }
    });
    
    await vi.advanceTimersByTimeAsync(50);
    await wrapper.vm.$nextTick();
    
    expect(wrapper.text()).toMatch(/2\/5/);
  });

  it('shows current stage for active file', async () => {
    wrapper = mount(UploadProgressModal, {
      props: { show: true, jobId: 'job_123' }
    });

    await vi.advanceTimersByTimeAsync(50);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Processing: file3.txt');
    expect(wrapper.text()).toContain('Embedding…');
  });

  it('calculates progress percentage', async () => {
    wrapper = mount(UploadProgressModal, {
      props: { show: true, jobId: 'job_123' }
    });
    
    await vi.advanceTimersByTimeAsync(50);
    await wrapper.vm.$nextTick();
    
    expect(wrapper.text()).toContain('40%'); // 2/5 = 40%
  });

  it('displays files list', async () => {
    wrapper = mount(UploadProgressModal, {
      props: { show: true, jobId: 'job_123' }
    });
    
    await vi.advanceTimersByTimeAsync(50);
    await wrapper.vm.$nextTick();
    
    const fileItems = wrapper.findAll('.file-item');
    expect(fileItems.length).toBeGreaterThan(0);
  });

  it('shows correct status icons', async () => {
    wrapper = mount(UploadProgressModal, {
      props: { show: true, jobId: 'job_123' }
    });
    
    await vi.advanceTimersByTimeAsync(50);
    await wrapper.vm.$nextTick();
    
    const text = wrapper.text();
    expect(text).toContain('✅'); // success icon
    expect(text).toContain('🔄'); // updated icon
    expect(text).toContain('⏳'); // processing icon
    expect(text).toContain('⏱️'); // pending icon
  });

  it('emits close event when close button clicked', async () => {
    wrapper = mount(UploadProgressModal, {
      props: { show: true, jobId: 'job_123' }
    });
    
    await vi.advanceTimersByTimeAsync(50);
    await wrapper.vm.$nextTick();
    
    await wrapper.find('.close-btn').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('shows stop button when processing', async () => {
    wrapper = mount(UploadProgressModal, {
      props: { show: true, jobId: 'job_123' }
    });
    
    await vi.advanceTimersByTimeAsync(50);
    await wrapper.vm.$nextTick();
    
    expect(wrapper.find('.btn-warning').exists()).toBe(true);
  });

  it('hides stop button when completed', async () => {
    api.getUploadJobStatus.mockResolvedValue({
      ...mockJobData,
      status: 'completed',
      processedFiles: 5
    });
    
    wrapper = mount(UploadProgressModal, {
      props: { show: true, jobId: 'job_123' }
    });
    
    await vi.advanceTimersByTimeAsync(50);
    await wrapper.vm.$nextTick();
    
    expect(wrapper.find('.btn-warning').exists()).toBe(false);
  });

  it('emits stop event when stop clicked', async () => {
    wrapper = mount(UploadProgressModal, {
      props: { show: true, jobId: 'job_123' }
    });
    
    await vi.advanceTimersByTimeAsync(50);
    await wrapper.vm.$nextTick();
    
    await wrapper.find('.btn-warning').trigger('click');
    expect(wrapper.emitted('stop')).toBeTruthy();
  });

  it('shows back + resume buttons when stopped (paused) cloud upload', async () => {
    api.getUploadJobStatus.mockResolvedValue({
      ...mockJobData,
      status: 'stopped',
      processedFiles: 2,
      source: 'cloud'
    });

    wrapper = mount(UploadProgressModal, {
      props: { show: true, jobId: 'job_123' }
    });

    await vi.advanceTimersByTimeAsync(50);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Back');
    expect(wrapper.text()).toContain('Resume Upload');
    expect(wrapper.find('.btn-warning').exists()).toBe(false);
  });

  it('shows back button when completed with errors', async () => {
    api.getUploadJobStatus.mockResolvedValue({
      ...mockJobData,
      status: 'completed',
      processedFiles: 5,
      failedFiles: 1
    });

    wrapper = mount(UploadProgressModal, {
      props: { show: true, jobId: 'job_123' }
    });

    await vi.advanceTimersByTimeAsync(50);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Back');
    expect(wrapper.text()).not.toContain('Resume Upload');
  });

  it('emits back event when back clicked', async () => {
    api.getUploadJobStatus.mockResolvedValue({
      ...mockJobData,
      status: 'stopped',
      source: 'cloud'
    });

    wrapper = mount(UploadProgressModal, {
      props: { show: true, jobId: 'job_123' }
    });

    await vi.advanceTimersByTimeAsync(50);
    await wrapper.vm.$nextTick();

    const backBtn = wrapper.findAll('button').find(b => b.text() === 'Back');
    expect(backBtn).toBeTruthy();
    await backBtn.trigger('click');
    expect(wrapper.emitted('back')).toBeTruthy();
  });

  it('emits back event when back clicked after completion with errors', async () => {
    api.getUploadJobStatus.mockResolvedValue({
      ...mockJobData,
      status: 'completed',
      processedFiles: 5,
      failedFiles: 1
    });

    wrapper = mount(UploadProgressModal, {
      props: { show: true, jobId: 'job_123' }
    });

    await vi.advanceTimersByTimeAsync(50);
    await wrapper.vm.$nextTick();

    const backBtn = wrapper.findAll('button').find(b => b.text() === 'Back');
    expect(backBtn).toBeTruthy();
    await backBtn.trigger('click');
    expect(wrapper.emitted('back')).toBeTruthy();
  });

  it('calls resume API when resume clicked (cloud upload)', async () => {
    api.getUploadJobStatus.mockResolvedValue({
      ...mockJobData,
      status: 'stopped',
      source: 'cloud'
    });

    wrapper = mount(UploadProgressModal, {
      props: { show: true, jobId: 'job_123' }
    });

    await vi.advanceTimersByTimeAsync(50);
    await wrapper.vm.$nextTick();

    const resumeBtn = wrapper.findAll('button').find(b => b.text().includes('Resume Upload'));
    expect(resumeBtn).toBeTruthy();
    await resumeBtn.trigger('click');

    expect(api.resumeUploadJob).toHaveBeenCalledWith('job_123');
  });
});
